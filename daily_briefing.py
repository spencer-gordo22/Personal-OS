#!/usr/bin/env python3
"""
Spencer OS — Daily Briefing Bot
Sends a morning Telegram message every day at 08:00 local time containing:
  • Today's date & day of week
  • Top 3 open tasks from Supabase CRM
  • Today's planned workout type
  • Yesterday's habit completion rate
  • Portfolio performance (QQQ, GLD, VOO, ETN via Stooq)
  • AI insight generated from recent journal entries (OpenAI)

Setup:
  1. Add TG_CHAT_ID to your .env file (your personal Telegram chat ID).
     Get it by messaging @userinfobot on Telegram.
  2. Run:  python3 daily_briefing.py           → scheduler (fires at 08:00 daily)
           python3 daily_briefing.py --now     → send immediately (test)
           python3 daily_briefing.py --print   → print to stdout only
"""
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# ─────────────────────────────────────────────────────────────────────────────
# .env loader
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

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

TG_TOKEN   = os.environ.get('TG_TOKEN',   '').strip()
OPENAI_KEY = os.environ.get('OPENAI_KEY', '').strip()
SUPA_URL   = os.environ.get('SUPA_URL',   '').strip()
SUPA_KEY   = os.environ.get('SUPA_KEY',   '').strip()
TG_CHAT_ID = os.environ.get('TG_CHAT_ID', '').strip()   # your personal chat ID

SYMBOLS = ['QQQ', 'GLD', 'VOO', 'ETN']
DEFAULT_SCHEDULE = ['PUSH', 'PULL', 'LEGS', 'SHARMS', 'REST', 'PUSH', 'PULL']   # Mon–Sun

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

BRIEFING_HOUR = 8   # 08:00 local time

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _tg_send(text: str) -> None:
    if not TG_TOKEN or not TG_CHAT_ID:
        print('[briefing] TG_TOKEN or TG_CHAT_ID not set — skipping send')
        return
    body = json.dumps({'chat_id': TG_CHAT_ID, 'text': text, 'parse_mode': 'Markdown'}).encode()
    req  = urllib.request.Request(
        f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage',
        data=body, headers={'Content-Type': 'application/json', 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except Exception as e:
        print(f'[briefing] tg_send failed: {e}')


def _supa_get(path: str, params: dict = None) -> list:
    if not SUPA_URL or not SUPA_KEY:
        return []
    qs = ('?' + urllib.parse.urlencode(params)) if params else ''
    try:
        req = urllib.request.Request(
            f'{SUPA_URL}/rest/v1{path}{qs}',
            headers={'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}',
                     'Accept': 'application/json', 'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        print(f'[briefing] supa_get {path}: {e}')
        return []


def _supa_kv(key: str):
    """Fetch a single key-value from kv_store; returns the parsed value or None."""
    rows = _supa_get('/kv_store', {'select': 'value', 'key': f'eq.{key}'})
    return rows[0]['value'] if rows else None


def _stooq_price(sym: str) -> dict:
    for suffix in (f'{sym}.US', sym):
        url = f'https://stooq.com/q/l/?s={suffix}&f=sd2t2ohlcvp&h&e=csv'
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/csv,*/*'})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                text = r.read().decode().strip()
            lines = text.splitlines()
            if len(lines) < 2:
                continue
            parts = lines[-1].split(',')
            if len(parts) < 9 or parts[6] in ('N/D', '', 'Close'):
                continue
            close = float(parts[6])
            prev  = float(parts[8]) if parts[8] not in ('N/D', '') else close
            pct   = round((close - prev) / prev * 100, 2) if prev else 0.0
            return {'sym': sym, 'price': close, 'pct': pct}
        except Exception:
            continue
    return {'sym': sym, 'price': None, 'pct': None}


def _gpt_insight(entries: list) -> str:
    if not OPENAI_KEY or not entries:
        return ''
    combined = '\n---\n'.join(
        e.get('content', '') for e in entries[:5] if isinstance(e, dict) and e.get('content')
    )
    if not combined.strip():
        return ''
    payload = {
        'model': 'gpt-4o-mini', 'temperature': 0.7, 'max_tokens': 130,
        'messages': [
            {
                'role': 'system',
                'content': (
                    "You are Spencer Gordon's personal AI coach. Spencer is 17, trains BJJ at "
                    "Easton Denver, does a Push/Pull/Legs/Sharms lifting split, is prepping for "
                    "the SAT (target 1500+, test Aug 15 2026), and is planning a gap year in "
                    "China. Based on his recent journal entries, give ONE sharp, specific, "
                    "motivating insight in 1-2 sentences. Be direct. No filler."
                ),
            },
            {'role': 'user', 'content': f'Recent journal entries:\n{combined[:2500]}'},
        ],
    }
    try:
        req = urllib.request.Request(
            'https://api.openai.com/v1/chat/completions',
            data=json.dumps(payload).encode(),
            headers={'Authorization': f'Bearer {OPENAI_KEY}',
                     'Content-Type': 'application/json', 'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode())['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f'[briefing] gpt_insight failed: {e}')
        return ''

# ─────────────────────────────────────────────────────────────────────────────
# Briefing builder
# ─────────────────────────────────────────────────────────────────────────────

def build_briefing() -> str:
    today    = datetime.date.today()
    yest     = today - datetime.timedelta(days=1)
    todayISO = today.isoformat()
    yestISO  = yest.isoformat()
    day_name = today.strftime('%A').upper()

    lines = [f'🌅 *DAILY BRIEFING — {day_name} {todayISO}*\n']

    # ── Top 3 tasks ──────────────────────────────────────────────────────────
    tasks = _supa_get('/crm_items', {
        'select':  'title,priority,due_date',
        'status':  'eq.open',
        'order':   'priority.asc,created_at.asc',
        'limit':   '3',
    })
    PRIO_EMOJI = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}
    lines.append('📋 *TOP TASKS*')
    if tasks:
        for t in tasks:
            e   = PRIO_EMOJI.get(t.get('priority', 'medium'), '•')
            due = f' (due {t["due_date"]})' if t.get('due_date') else ''
            lines.append(f'  {e} {t.get("title", "Untitled")}{due}')
    else:
        lines.append('  No open tasks 🎉')
    lines.append('')

    # ── Today's workout ──────────────────────────────────────────────────────
    dow          = today.weekday()           # 0=Mon … 6=Sun
    default_type = DEFAULT_SCHEDULE[dow] if dow < 7 else 'REST'
    workouts     = _supa_kv('sos_workouts_v4')
    wkt_type     = default_type
    if isinstance(workouts, dict):
        entry = workouts.get(todayISO)
        if isinstance(entry, dict):
            wkt_type = entry.get('type', default_type)
    WKT_EMOJI = {'PUSH': '💪', 'PULL': '🏋️', 'LEGS': '🦵', 'SHARMS': '🔱', 'REST': '😴'}
    lines.append(f'{WKT_EMOJI.get(wkt_type, "🏋️")} *TODAY\'S WORKOUT:* {wkt_type}')
    lines.append('')

    # ── Yesterday's habit completion ─────────────────────────────────────────
    checklist    = _supa_kv('sos_checklist_v2')
    habit_pct    = None
    done_count   = 0
    active_count = 0
    if isinstance(checklist, dict):
        recurring  = checklist.get('recurring', [])
        daily_data = checklist.get('daily', {})
        yest_abbr  = yest.strftime('%a').upper()[:3]
        active     = [h for h in recurring
                      if isinstance(h, dict) and yest_abbr in (h.get('days') or [])]
        yest_entry = daily_data.get(yestISO, {})
        yest_done  = yest_entry.get('done', {}) if isinstance(yest_entry, dict) else {}
        done_count   = sum(1 for h in active if yest_done.get(h.get('id')))
        active_count = len(active)
        if active_count:
            habit_pct = round(done_count / active_count * 100)
    if habit_pct is not None:
        pct_emoji = '🟢' if habit_pct >= 80 else '🟡' if habit_pct >= 50 else '🔴'
        lines.append(f'{pct_emoji} *YESTERDAY\'S HABITS:* {habit_pct}% ({done_count}/{active_count})')
    else:
        lines.append('📊 *YESTERDAY\'S HABITS:* No data')
    lines.append('')

    # ── Portfolio performance ────────────────────────────────────────────────
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(_stooq_price, SYMBOLS))
    lines.append('📈 *PORTFOLIO*')
    for r in results:
        if r['pct'] is None:
            lines.append(f'  `{r["sym"]}` — no data')
            continue
        arrow = '▲' if r['pct'] > 0 else '▼' if r['pct'] < 0 else '—'
        sign  = '+' if r['pct'] >= 0 else ''
        lines.append(f'  `{r["sym"]}` {arrow} {sign}{r["pct"]}%  @ ${r["price"]:.2f}')
    lines.append('')

    # ── AI journal insight ───────────────────────────────────────────────────
    journal_raw = _supa_kv('sos_journal')
    entries = []
    if isinstance(journal_raw, list):
        entries = journal_raw[:5]
    elif isinstance(journal_raw, dict):
        entries = list(journal_raw.values())[:5]

    insight = _gpt_insight(entries)
    if insight:
        lines.append('💡 *AI INSIGHT*')
        lines.append(f'_{insight}_')
        lines.append('')

    lines.append('_— Spencer OS_')
    return '\n'.join(lines)

# ─────────────────────────────────────────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────────────────────────────────────────

def run_scheduler() -> None:
    print(f'[briefing] Scheduler started — fires at {BRIEFING_HOUR:02d}:00 local time every morning')
    print(f'[briefing] TG_CHAT_ID: {TG_CHAT_ID or "NOT SET — add to .env"}')
    last_sent: datetime.date | None = None

    while True:
        now = datetime.datetime.now()
        if now.hour == BRIEFING_HOUR and now.minute == 0 and now.date() != last_sent:
            print(f'[briefing] Sending briefing for {now.date()} …')
            try:
                msg = build_briefing()
                _tg_send(msg)
                last_sent = now.date()
                print('[briefing] Sent ✓')
            except Exception as e:
                print(f'[briefing] Error: {e}')
        time.sleep(30)   # check every 30 s — low CPU overhead


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--now' in args:
        print('[briefing] Sending test briefing now …')
        msg = build_briefing()
        print(msg)
        _tg_send(msg)
        print('[briefing] Done.')
    elif '--print' in args:
        print(build_briefing())
    else:
        run_scheduler()
