#!/usr/bin/env python3
"""
Spencer OS — Telegram bot (long-polling mode).

Reads all credentials from environment variables / .env file.
Run alongside serve.py when you don't have a public HTTPS webhook URL:

    python3 telegram_poll.py

Press Ctrl-C to stop.
"""
import datetime
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import uuid


# ─────────────────────────────────────────────────────────────────────────────
# .env loader  (identical to serve.py — no deps)
# ─────────────────────────────────────────────────────────────────────────────

def _load_dotenv() -> None:
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key   = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

_load_dotenv()


def _require(key: str) -> str:
    val = os.environ.get(key, '').strip()
    if not val:
        sys.exit(f'[error] Missing env var: {key}  — add it to .env')
    return val


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

TG_TOKEN     = _require('TG_TOKEN')
OPENAI_KEY   = _require('OPENAI_KEY')
SUPA_URL     = _require('SUPA_URL')
SUPA_KEY     = _require('SUPA_KEY')

TG_API_BASE  = f'https://api.telegram.org/bot{TG_TOKEN}'
TG_FILE_BASE = f'https://api.telegram.org/file/bot{TG_TOKEN}'

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')


# ─────────────────────────────────────────────────────────────────────────────
# Telegram
# ─────────────────────────────────────────────────────────────────────────────

def tg_api(method: str, data: dict = None) -> dict:
    body = json.dumps(data or {}).encode()
    req  = urllib.request.Request(f'{TG_API_BASE}/{method}', data=body,
               headers={'Content-Type': 'application/json', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def tg_send(chat_id: int, text: str) -> None:
    try:
        tg_api('sendMessage', {'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'})
    except Exception as e:
        print(f'  [send error] {e}')


def tg_download(file_id: str) -> bytes:
    path = tg_api('getFile', {'file_id': file_id})['result']['file_path']
    req  = urllib.request.Request(f'{TG_FILE_BASE}/{path}', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI
# ─────────────────────────────────────────────────────────────────────────────

def build_multipart(fields: dict, fname: str, fbytes: bytes, fmime: str):
    bnd = ('SOS' + uuid.uuid4().hex[:16]).encode()
    buf = bytearray()
    for k, v in fields.items():
        buf += b'--' + bnd + b'\r\n'
        buf += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        buf += str(v).encode() + b'\r\n'
    buf += b'--' + bnd + b'\r\n'
    buf += f'Content-Disposition: form-data; name="file"; filename="{fname}"\r\n'.encode()
    buf += f'Content-Type: {fmime}\r\n\r\n'.encode()
    buf += fbytes + b'\r\n'
    buf += b'--' + bnd + b'--\r\n'
    return bytes(buf), f'multipart/form-data; boundary={bnd.decode()}'


def whisper(audio_bytes: bytes, mime: str = 'audio/ogg') -> str:
    ext = mime.split('/')[-1].split(';')[0].strip() or 'ogg'
    body, ctype = build_multipart({'model': 'whisper-1'}, f'voice.{ext}', audio_bytes, mime)
    req = urllib.request.Request('https://api.openai.com/v1/audio/transcriptions',
              data=body, headers={'Authorization': f'Bearer {OPENAI_KEY}',
                                  'Content-Type': ctype, 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode()).get('text', '').strip()


def classify(text: str, source: str) -> dict:
    today  = datetime.date.today().isoformat()
    system = (
        'You are a personal CRM assistant. Analyse the input and return ONLY a raw JSON object '
        '(no markdown fences) with exactly these fields:\n'
        '  type         : one of task | note | contact | meeting | follow_up | deal | reminder\n'
        '  title        : concise 3-10 word summary\n'
        '  body         : cleaned-up full text\n'
        '  priority     : high | medium | low\n'
        '  due_date     : "YYYY-MM-DD" if a date is mentioned, else null\n'
        '  contact_name : full name of any person mentioned, else null\n'
        f'  tags         : JSON array of 1-5 lowercase tags\nToday is {today}.'
    )
    payload = {'model': 'gpt-4o-mini', 'temperature': 0.1, 'max_tokens': 350,
               'messages': [{'role': 'system', 'content': system},
                             {'role': 'user',   'content': text}]}
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions',
              data=json.dumps(payload).encode(),
              headers={'Authorization': f'Bearer {OPENAI_KEY}',
                       'Content-Type': 'application/json', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        content = json.loads(r.read().decode())['choices'][0]['message']['content'].strip()

    if content.startswith('```'):
        parts   = content.split('```')
        content = parts[1].lstrip('json').strip() if len(parts) > 1 else content
    try:
        result = json.loads(content)
    except Exception:
        result = {'type': 'task', 'title': text[:80], 'body': text,
                  'priority': 'medium', 'due_date': None, 'contact_name': None, 'tags': []}

    result.update({'source': source, 'raw_transcript': text, 'status': 'open'})
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Supabase
# ─────────────────────────────────────────────────────────────────────────────

def supa_insert(item: dict) -> bool:
    body = json.dumps(item).encode()
    req  = urllib.request.Request(f'{SUPA_URL}/rest/v1/crm_items', data=body, method='POST',
               headers={'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}',
                        'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status in (200, 201)
    except urllib.request.HTTPError as e:
        print(f'  [supa] HTTP {e.code}: {e.read().decode()[:200]}')
        return False
    except Exception as e:
        print(f'  [supa] {e}')
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Update handler
# ─────────────────────────────────────────────────────────────────────────────

EMOJI = {'task':'✅','note':'📝','contact':'👤','meeting':'📅',
         'follow_up':'🔄','deal':'💼','reminder':'⏰'}


def handle_update(update: dict) -> None:
    msg = update.get('message') or update.get('edited_message')
    if not msg:
        return
    chat_id = msg['chat']['id']
    fname   = msg.get('from', {}).get('first_name', 'User')
    print(f'\n[update] from {fname} ({chat_id})')

    try:
        source = 'telegram_text'
        text   = msg.get('text', '').strip()

        if not text and 'voice' in msg:
            source = 'telegram_voice'
            print('  downloading voice…')
            tg_send(chat_id, '🎙 Transcribing…')
            text = whisper(tg_download(msg['voice']['file_id']), 'audio/ogg')
            print(f'  transcript: {text[:80]}')
        elif not text and 'audio' in msg:
            source = 'telegram_voice'
            aud    = msg['audio']
            print('  downloading audio…')
            tg_send(chat_id, '🎙 Transcribing…')
            text = whisper(tg_download(aud['file_id']), aud.get('mime_type', 'audio/mpeg'))
            print(f'  transcript: {text[:80]}')

        if not text:
            tg_send(chat_id, '⚠️ Send text or a voice note.'); return

        print(f'  classifying: {text[:60]}…')
        tg_send(chat_id, '🧠 Classifying…')
        item = classify(text, source)
        print(f'  → {item.get("type")} | {item.get("title")}')

        ok = supa_insert(item)
        if ok:
            e = EMOJI.get(item.get('type', 'task'), '✅')
            reply = (f"{e} *{item.get('title','Saved')}*\n"
                     f"Type: `{item.get('type','task')}`  ·  Priority: `{item.get('priority','medium')}`")
            if item.get('due_date'):    reply += f"\nDue: `{item['due_date']}`"
            if item.get('contact_name'): reply += f"\nContact: {item['contact_name']}"
            if item.get('tags'):        reply += '\nTags: ' + '  '.join(f'`{t}`' for t in item['tags'])
            tg_send(chat_id, reply)
            print('  ✓ saved to Supabase')
        else:
            tg_send(chat_id, '❌ Supabase write failed — check server logs.')

    except Exception as e:
        print(f'  [error] {e}')
        tg_send(chat_id, f'❌ {str(e)[:200]}')


# ─────────────────────────────────────────────────────────────────────────────
# Polling loop
# ─────────────────────────────────────────────────────────────────────────────

def poll():
    try:
        tg_api('deleteWebhook', {'drop_pending_updates': False})
    except Exception as e:
        print(f'[deleteWebhook] {e}')

    print('Spencer OS Telegram bot — polling mode')
    print('Send a message or voice note. Ctrl-C to stop.\n')

    offset = 0
    while True:
        try:
            updates = tg_api('getUpdates', {'timeout': 30, 'offset': offset,
                                             'allowed_updates': ['message']}).get('result', [])
            for upd in updates:
                offset = upd['update_id'] + 1
                handle_update(upd)
        except KeyboardInterrupt:
            print('\nStopped.'); sys.exit(0)
        except Exception as e:
            print(f'[poll error] {e} — retrying in 5 s')
            time.sleep(5)


if __name__ == '__main__':
    poll()
