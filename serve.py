#!/usr/bin/env python3
"""
Spencer OS local dev server.

Static files  : no-cache headers so every edit is immediately fresh.
/api/quotes   : Stooq.com proxy — parallel per-symbol fetches, no API key.
/api/config   : Returns public client-side config (Supabase URL + anon key).
/whoop/*      : WHOOP Developer API v2 OAuth proxy + token exchange.
/telegram/*   : Telegram bot webhook — voice→Whisper→GPT→Supabase CRM insert.
"""
import datetime
import http.server
import json
import os
import re
import socketserver
import threading
import time
import urllib.request
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse, parse_qs

# ─────────────────────────────────────────────────────────────────────────────
# .env loader  (no external deps — reads .env only if var not already set)
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
            if key and key not in os.environ:  # platform env vars take precedence
                os.environ[key] = value

_load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Config  (all values come from env — never hardcoded)
# ─────────────────────────────────────────────────────────────────────────────

PORT       = int(os.environ.get('PORT', 8765))
BASE_URL   = os.environ.get('BASE_URL', f'http://localhost:{PORT}').rstrip('/')

# Soft reads — missing vars disable the relevant feature but never crash startup
SUPA_URL   = os.environ.get('SUPA_URL',   '').strip()
SUPA_KEY   = os.environ.get('SUPA_KEY',   '').strip()
TG_TOKEN   = os.environ.get('TG_TOKEN',   '').strip()
OPENAI_KEY = os.environ.get('OPENAI_KEY', '').strip()

TG_API_BASE  = f'https://api.telegram.org/bot{TG_TOKEN}'
TG_FILE_BASE = f'https://api.telegram.org/file/bot{TG_TOKEN}'


VAPID_PUBLIC_KEY  = os.environ.get('VAPID_PUBLIC_KEY',  '').strip()
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '').strip()
VAPID_SUBJECT     = os.environ.get('VAPID_SUBJECT',     'mailto:admin@spencer-os.fly.dev').strip()

PLAID_CLIENT_ID = os.environ.get('PLAID_CLIENT_ID', '').strip()
PLAID_SECRET    = os.environ.get('PLAID_SECRET',    '').strip()
PLAID_ENV       = os.environ.get('PLAID_ENV', 'sandbox').strip()
PLAID_API_BASE  = {
    'sandbox':     'https://sandbox.plaid.com',
    'development': 'https://development.plaid.com',
    'production':  'https://production.plaid.com',
}.get(PLAID_ENV, 'https://sandbox.plaid.com')

WHOOP_AUTH_URL  = 'https://api.prod.whoop.com/oauth/oauth2/auth'
WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
WHOOP_API_BASE  = 'https://api.prod.whoop.com/developer/v2'
WHOOP_API_V1    = 'https://api.prod.whoop.com/developer/v1'
WHOOP_SCOPE     = 'read:recovery read:sleep read:cycles read:workout read:body_measurement read:user.measurement'

# WHOOP redirect URI — must match exactly what's registered in WHOOP Developer Portal.
# Always use the Fly.io URL; local OAuth won't work (WHOOP requires HTTPS).
WHOOP_REDIRECT = 'https://spencer-os.fly.dev/whoop/callback'

# WHOOP client credentials — stored server-side for token refresh without client involvement.
# Either set these as Fly secrets OR leave empty; the server will fall back to reading
# them from the Supabase kv_store (where the client already saves them).
WHOOP_CLIENT_ID     = os.environ.get('WHOOP_CLIENT_ID',     '').strip()
WHOOP_CLIENT_SECRET = os.environ.get('WHOOP_CLIENT_SECRET', '').strip()

# Google Calendar OAuth — server-side authorization code flow.
# GOOGLE_REDIRECT is hardcoded — do not change it here without also updating
# "Authorized redirect URIs" in Google Cloud Console to exactly this string.
GOOGLE_CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID',     '').strip()
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
GOOGLE_REDIRECT      = 'https://spencer-os.fly.dev/google/callback'
GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_SCOPE     = 'https://www.googleapis.com/auth/calendar.readonly'
print(f'[google oauth] redirect_uri locked to: {GOOGLE_REDIRECT}')

# ── WHOOP OAuth state store ──────────────────────────────────────────────────
# Keyed by a random UUID generated per auth attempt. Validated on callback.
# In-memory only; clears on restart (fine — state tokens are short-lived).
_WHOOP_STATES:      dict  = {}
_WHOOP_STATES_LOCK        = threading.Lock()
_WHOOP_STATE_TTL:   float = 600.0   # 10 minutes

_GOOGLE_STATES:     dict  = {}
_GOOGLE_STATES_LOCK       = threading.Lock()
_GOOGLE_STATE_TTL:  float = 600.0   # 10 minutes

DEFAULT_SYMBOLS = ['QQQ', 'GLD', 'VOO', 'ETN']

# ─────────────────────────────────────────────────────────────────────────────
# Web Push helpers
# ─────────────────────────────────────────────────────────────────────────────

def _vapid_private_pem() -> str:
    """Convert base64url DER PKCS8 private key → PEM string for pywebpush."""
    import base64 as b64
    padded  = VAPID_PRIVATE_KEY + '=' * (-len(VAPID_PRIVATE_KEY) % 4)
    der     = b64.urlsafe_b64decode(padded)
    b64_der = b64.b64encode(der).decode()
    lines   = '\n'.join(b64_der[i:i + 64] for i in range(0, len(b64_der), 64))
    return f'-----BEGIN PRIVATE KEY-----\n{lines}\n-----END PRIVATE KEY-----\n'


def _push_save_sub(sub: dict) -> tuple:
    """Upsert a push subscription in Supabase push_subscriptions table."""
    if not SUPA_URL or not SUPA_KEY:
        return False, 'Supabase not configured'
    endpoint = sub.get('endpoint', '').strip()
    if not endpoint:
        return False, 'Missing endpoint'
    body = json.dumps({
        'endpoint': endpoint,
        'p256dh':   sub.get('keys', {}).get('p256dh', ''),
        'auth':     sub.get('keys', {}).get('auth',   ''),
    }).encode()
    req = urllib.request.Request(
        f'{SUPA_URL}/rest/v1/push_subscriptions', data=body, method='POST',
        headers={
            'apikey':        SUPA_KEY,
            'Authorization': f'Bearer {SUPA_KEY}',
            'Content-Type':  'application/json',
            'Prefer':        'resolution=merge-duplicates,return=minimal',
        })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return (True, '') if r.status in (200, 201, 204) else (False, f'HTTP {r.status}')
    except urllib.request.HTTPError as e:
        raw = ''
        try: raw = e.read().decode()[:300]
        except Exception: pass
        return False, f'HTTP {e.code}: {raw}'
    except Exception as e:
        return False, str(e)


def _push_get_subs() -> list:
    """Return all push subscriptions from Supabase."""
    if not SUPA_URL or not SUPA_KEY:
        return []
    req = urllib.request.Request(
        f'{SUPA_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth',
        headers={
            'apikey':        SUPA_KEY,
            'Authorization': f'Bearer {SUPA_KEY}',
            'Accept':        'application/json',
        })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        print(f'[push] fetch subs error: {e}')
        return []


def _push_send_all(title: str, body_text: str, url: str = '/') -> None:
    """Send a Web Push notification to every subscriber. Runs in background thread."""
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        print('[push] VAPID keys not configured — skipping')
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print('[push] pywebpush not installed — skipping')
        return

    subs = _push_get_subs()
    if not subs:
        print('[push] no subscribers')
        return

    pem     = _vapid_private_pem()
    payload = json.dumps({'title': title, 'body': body_text, 'url': url})
    ok_n = err_n = 0

    for sub in subs:
        parsed = urlparse(sub['endpoint'])
        aud    = f'{parsed.scheme}://{parsed.netloc}'
        sub_info = {
            'endpoint': sub['endpoint'],
            'keys':     {'p256dh': sub['p256dh'], 'auth': sub['auth']},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=pem,
                vapid_claims={'sub': VAPID_SUBJECT, 'aud': aud},
            )
            ok_n += 1
        except Exception as e:
            print(f'[push] send error: {e}')
            err_n += 1

    print(f'[push] sent {ok_n} ok / {err_n} errors')


def _start_daily_push_scheduler() -> None:
    """Background thread: fire a daily push at 8:00 am local time."""
    def _loop():
        while True:
            now   = datetime.datetime.now()
            next8 = now.replace(hour=8, minute=0, second=0, microsecond=0)
            if next8 <= now:
                next8 += datetime.timedelta(days=1)
            secs = (next8 - now).total_seconds()
            print(f'[push scheduler] next 8am push in {secs / 3600:.1f}h')
            time.sleep(secs)
            _push_send_all(
                title='Spencer OS · Good morning ☀️',
                body_text='Daily check-in reminder — log your metrics and review your tasks.',
                url='/',
            )
    threading.Thread(target=_loop, daemon=True, name='push-scheduler').start()


# ─────────────────────────────────────────────────────────────────────────────
# Supabase kv_store helpers  (server-side token persistence)
# ─────────────────────────────────────────────────────────────────────────────

def _supa_kv_get(key: str):
    """Read a value from Supabase kv_store. Returns parsed Python object or None."""
    if not SUPA_URL or not SUPA_KEY:
        return None
    url = (f'{SUPA_URL}/rest/v1/kv_store'
           f'?key=eq.{urllib.parse.quote(key)}&select=value&limit=1')
    req = urllib.request.Request(url, headers={
        'apikey':        SUPA_KEY,
        'Authorization': f'Bearer {SUPA_KEY}',
        'Accept':        'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            rows = json.loads(r.read().decode())
            if rows:
                return rows[0]['value']
    except Exception as e:
        print(f'[kv get] {key}: {e}')
    return None


def _supa_kv_set(key: str, value) -> bool:
    """Upsert a value in Supabase kv_store. Returns True on success."""
    if not SUPA_URL or not SUPA_KEY:
        return False
    body = json.dumps({
        'key':        key,
        'value':      value,
        'updated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    }).encode()
    req = urllib.request.Request(
        f'{SUPA_URL}/rest/v1/kv_store', data=body, method='POST',
        headers={
            'apikey':        SUPA_KEY,
            'Authorization': f'Bearer {SUPA_KEY}',
            'Content-Type':  'application/json',
            'Prefer':        'resolution=merge-duplicates,return=minimal',
        })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status in (200, 201, 204)
    except Exception as e:
        print(f'[kv set] {key}: {e}')
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Google Calendar OAuth helpers
# ─────────────────────────────────────────────────────────────────────────────

def _google_exchange_code(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    post_data = urllib.parse.urlencode({
        'code':          code,
        'client_id':     GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'redirect_uri':  GOOGLE_REDIRECT,
        'grant_type':    'authorization_code',
    }).encode()
    req = urllib.request.Request(
        GOOGLE_TOKEN_URL, data=post_data, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _google_refresh_access_token(refresh_token: str) -> dict:
    """Use refresh token to get a new access token."""
    post_data = urllib.parse.urlencode({
        'client_id':     GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_token,
        'grant_type':    'refresh_token',
    }).encode()
    req = urllib.request.Request(
        GOOGLE_TOKEN_URL, data=post_data, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _google_get_valid_token(force_refresh: bool = False) -> 'str | None':
    """
    Read Google tokens from Supabase kv_store; auto-refresh if expired or
    within 5 minutes of expiry (or forced).  Returns a valid access_token
    string or None if not connected. Raises ValueError if refresh fails.
    """
    tokens = _supa_kv_get('sos_gcal_tokens')
    if not tokens or not isinstance(tokens, dict):
        return None

    refresh_token = tokens.get('refresh_token')
    access_token  = tokens.get('access_token')
    expires_at    = tokens.get('expires_at', 0)

    # expires_at is stored in ms (matches client-side Date.now() convention)
    exp_sec = expires_at / 1000 if expires_at > 1e10 else float(expires_at)
    now_sec = time.time()

    if force_refresh or not access_token or (exp_sec - now_sec) < 300:
        if not refresh_token:
            return None
        print(f'[google] {"forced" if force_refresh else "proactive"} token refresh…')
        refreshed = _google_refresh_access_token(refresh_token)
        if 'error' in refreshed:
            desc = refreshed.get('error_description') or refreshed.get('error')
            raise ValueError(f'Google refresh error: {desc}')
        access_token           = refreshed['access_token']
        tokens['access_token'] = access_token
        tokens['expires_at']   = int((now_sec + refreshed.get('expires_in', 3600)) * 1000)
        _supa_kv_set('sos_gcal_tokens', tokens)
        print('[google] token refreshed and saved to Supabase')

    return access_token


# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# WHOOP token helpers — flat Supabase keys for clarity and reliability
#
# Keys used:
#   whoop_access_token   — current bearer token string
#   whoop_refresh_token  — refresh token string
#   whoop_token_expiry   — absolute UNIX epoch (int, seconds)
#   sos_whoop_token      — kept for backward compat (full dict)
# ─────────────────────────────────────────────────────────────────────────────

def _whoop_creds() -> 'tuple[str,str]':
    """Return (client_id, client_secret) from env vars → Supabase fallback."""
    cid = WHOOP_CLIENT_ID
    sec = WHOOP_CLIENT_SECRET
    if not cid:
        raw = _supa_kv_get('sos_whoop_client_id')
        cid = raw if isinstance(raw, str) else ''
    if not sec:
        raw = _supa_kv_get('sos_whoop_client_secret')
        sec = raw if isinstance(raw, str) else ''
    return cid, sec


def _whoop_save_tokens(tok: dict) -> None:
    """Persist WHOOP token response dict to all three flat Supabase keys + legacy key."""
    now           = int(time.time())
    access_token  = tok.get('access_token',  '')
    refresh_token = tok.get('refresh_token', '')
    expires_in    = int(tok.get('expires_in', 3600))
    expires_at    = now + expires_in

    _supa_kv_set('whoop_access_token',  access_token)
    _supa_kv_set('whoop_refresh_token', refresh_token)
    _supa_kv_set('whoop_token_expiry',  expires_at)

    # Legacy full-dict key — kept so old code paths still work
    tok['fetched_at'] = now * 1000
    _supa_kv_set('sos_whoop_token', tok)

    print(f'[whoop tokens] saved: access={access_token[:12]}…  '
          f'refresh={refresh_token[:12]}…  expires_in={expires_in}s  expires_at={expires_at}')


def _whoop_do_refresh() -> str:
    """
    Exchange stored refresh token for new tokens.
    Saves to Supabase. Returns new access_token string.
    If WHOOP returns 401, clears all stored tokens (user must reconnect).
    Raises ValueError on any failure.
    """
    refresh_token = _supa_kv_get('whoop_refresh_token') or ''
    if not refresh_token:
        # Backward-compat: try legacy full dict
        old = _supa_kv_get('sos_whoop_token')
        if old and isinstance(old, dict):
            refresh_token = old.get('refresh_token', '')
    if not refresh_token:
        raise ValueError('no refresh_token stored — reconnect required')

    cid, sec = _whoop_creds()
    if not cid or not sec:
        raise ValueError('WHOOP client credentials not configured')

    print(f'[whoop refresh] requesting new tokens  refresh={refresh_token[:12]}…')
    post_data = urllib.parse.urlencode({
        'grant_type':    'refresh_token',
        'refresh_token': refresh_token,
        'client_id':     cid,
        'client_secret': sec,
    }).encode()
    req = urllib.request.Request(
        WHOOP_TOKEN_URL, data=post_data, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            tok = json.loads(r.read().decode())
    except urllib.request.HTTPError as e:
        body = e.read().decode()
        print(f'[whoop refresh] HTTP {e.code}: {body[:300]}')
        if e.code == 401:
            # Refresh token revoked — clear everything so UI shows reconnect button
            for k in ('whoop_access_token', 'whoop_refresh_token',
                      'whoop_token_expiry', 'sos_whoop_token'):
                _supa_kv_set(k, None)
            print('[whoop refresh] 401 → cleared all tokens, reconnect required')
        raise ValueError(f'token refresh HTTP {e.code}: {body[:200]}')

    # WHOOP sometimes omits a new refresh_token — preserve the existing one
    if not tok.get('refresh_token'):
        tok['refresh_token'] = refresh_token

    _whoop_save_tokens(tok)
    return tok['access_token']


def _whoop_get_valid_token() -> 'str | None':
    """
    Return a valid WHOOP access token, refreshing proactively if the token
    expires within 60 seconds. Returns None if not connected.
    """
    access_token  = _supa_kv_get('whoop_access_token')  or ''
    refresh_token = _supa_kv_get('whoop_refresh_token') or ''
    expires_at    = _supa_kv_get('whoop_token_expiry')  or 0

    # Backward compat — migrate from old full-dict key on first use
    if not access_token:
        old = _supa_kv_get('sos_whoop_token')
        if old and isinstance(old, dict):
            access_token  = old.get('access_token', '')
            refresh_token = old.get('refresh_token', '') or refresh_token
            fa_ms         = old.get('fetched_at', 0)
            fa_s          = fa_ms / 1000 if fa_ms > 1e10 else fa_ms
            expires_at    = int(fa_s + old.get('expires_in', 0))
            if access_token:
                print('[whoop token] migrating from legacy sos_whoop_token key')
                _supa_kv_set('whoop_access_token',  access_token)
                _supa_kv_set('whoop_refresh_token', refresh_token)
                _supa_kv_set('whoop_token_expiry',  expires_at)

    if not access_token and not refresh_token:
        print('[whoop token] no tokens stored')
        return None

    now = int(time.time())
    ttl = expires_at - now if expires_at else None
    print(f'[whoop token] access={access_token[:12]}…  ttl={ttl}s')

    if ttl is not None and ttl < 60:
        print(f'[whoop token] expires in {ttl}s — refreshing proactively')
        access_token = _whoop_do_refresh()  # raises on failure

    return access_token or None


# ── WHOOP endpoint URL map ────────────────────────────────────────────────────
# Maps the short endpoint name (used as query param) → full request URL.
# v2 collection endpoints append ?limit=1; v1 single-resource endpoints do not.
WHOOP_ENDPOINT_URLS: dict = {}  # populated after constants are set


def _build_whoop_endpoint_urls():
    global WHOOP_ENDPOINT_URLS
    WHOOP_ENDPOINT_URLS = {
        # v2 collection endpoints (recovery, sleep, workout, cycle)
        'recovery':         f'{WHOOP_API_BASE}/recovery?limit=1',
        'activity/sleep':   f'{WHOOP_API_BASE}/activity/sleep?limit=1',
        'activity/workout': f'{WHOOP_API_BASE}/activity/workout?limit=1',
        'cycle':            f'{WHOOP_API_BASE}/cycle?limit=1',
        # v1 single-resource endpoints (body measurements, user profile)
        'body/measurement':    f'{WHOOP_API_V1}/body/measurement',
        'user/measurement':    f'{WHOOP_API_V1}/user/measurement',
        'v2/user/measurement': f'{WHOOP_API_BASE}/user/measurement',
        # v1 collection endpoints (for VO2 max probe)
        'v1/cycle':            f'{WHOOP_API_V1}/cycle/collection?limit=1',
        'v1/recovery':         f'{WHOOP_API_V1}/recovery/collection?limit=1',
    }


_build_whoop_endpoint_urls()


def _whoop_api_call(endpoint: str, access_token: str) -> bytes:
    """Make a single WHOOP API call; returns raw response bytes.
    endpoint must be a key in WHOOP_ENDPOINT_URLS."""
    url = WHOOP_ENDPOINT_URLS.get(endpoint)
    if not url:
        raise ValueError(f'Unknown WHOOP endpoint: {endpoint!r}')
    req = urllib.request.Request(
        url, headers={'Authorization': f'Bearer {access_token}', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

# ─────────────────────────────────────────────────────────────────────────────
# Stooq stock quote fetch
# ─────────────────────────────────────────────────────────────────────────────

def _stooq_fetch(sym: str) -> dict:
    for suffix in (f'{sym}.US', sym):
        url = f'https://stooq.com/q/l/?s={suffix}&f=sd2t2ohlcvp&h&e=csv'
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/csv, */*'})
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read().decode('utf-8').strip()
        lines = text.splitlines()
        if len(lines) < 2:
            continue
        parts = lines[-1].split(',')
        if len(parts) < 9 or parts[6] in ('N/D', '', 'Close'):
            continue
        try:
            close = float(parts[6])
            prev  = float(parts[8]) if parts[8] not in ('N/D', '') else close
        except ValueError:
            continue
        day_change = round(close - prev, 4)
        day_pct    = round((close - prev) / prev * 100, 4) if prev else 0.0
        return {'price': close, 'dayChange': day_change, 'dayPct': day_pct,
                'prevClose': prev, 'mktState': 'REGULAR', 'longName': sym}
    raise ValueError(f'No data for {sym!r} on Stooq')


# ─────────────────────────────────────────────────────────────────────────────
# Telegram helpers
# ─────────────────────────────────────────────────────────────────────────────

def _tg_api(method: str, data: dict = None) -> dict:
    body = json.dumps(data or {}).encode()
    req  = urllib.request.Request(f'{TG_API_BASE}/{method}', data=body,
               headers={'Content-Type': 'application/json', 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _tg_send(chat_id: int, text: str) -> None:
    try:
        _tg_api('sendMessage', {'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'})
    except Exception as e:
        print(f'[tg send] {e}')


def _tg_download_file(file_id: str) -> bytes:
    info = _tg_api('getFile', {'file_id': file_id})
    path = info['result']['file_path']
    req  = urllib.request.Request(f'{TG_FILE_BASE}/{path}', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_multipart(fields: dict, fname: str, fbytes: bytes, fmime: str):
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


def _whisper_transcribe(audio_bytes: bytes, mime: str = 'audio/ogg') -> str:
    ext = mime.split('/')[-1].split(';')[0].strip() or 'ogg'
    body, ctype = _build_multipart({'model': 'whisper-1'}, f'voice.{ext}', audio_bytes, mime)
    req = urllib.request.Request('https://api.openai.com/v1/audio/transcriptions',
              data=body, headers={'Authorization': f'Bearer {OPENAI_KEY}',
                                  'Content-Type': ctype, 'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode()).get('text', '').strip()


def _gpt_classify(text: str, source: str) -> dict:
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
# Supabase CRM insert
# ─────────────────────────────────────────────────────────────────────────────

# Columns that exist in the crm_items table — strip everything else so
# PostgREST doesn't reject the row with "column does not exist".
_CRM_FIELDS = frozenset({
    'type', 'title', 'body', 'priority', 'status',
    'due_date', 'contact_name', 'tags', 'source', 'raw_transcript',
})


def _sanitise_crm_item(item: dict) -> dict:
    """
    Coerce GPT output into the exact shape crm_items expects.

    Common GPT quirks that cause PostgREST 400 errors:
      • tags: null  → must be [] (text[] rejects null at insert)
      • due_date: "" → must be null (date column rejects empty string)
      • extra keys  → PostgREST rejects unknown column names
      • title: ""   → NOT NULL column, needs a fallback
    """
    out: dict = {}
    for k in _CRM_FIELDS:
        v = item.get(k)

        if k == 'tags':
            # Guarantee a JSON array, never null/None/string
            if v is None:
                v = []
            elif isinstance(v, str):
                v = [t.strip() for t in v.split(',') if t.strip()] if v else []

        elif k == 'due_date':
            # Postgres date rejects '' — coerce to None/null
            if not v or not isinstance(v, str) or not v.strip():
                v = None

        elif k == 'title':
            # NOT NULL — fall back to first 80 chars of body or a default
            if not v or not str(v).strip():
                v = str(item.get('body', '') or item.get('raw_transcript', '') or 'Untitled')[:80].strip() or 'Untitled'

        elif k == 'type':
            # Constrain to known values; default to 'task'
            VALID_TYPES = {'task','note','contact','meeting','follow_up','deal','reminder'}
            if v not in VALID_TYPES:
                v = 'task'

        out[k] = v

    return out


def _supa_insert_crm(item: dict) -> tuple:
    """
    Insert a CRM item.  Returns (ok: bool, error_msg: str).
    error_msg is '' on success.
    """
    if not SUPA_URL or not SUPA_KEY:
        msg = 'SUPA_URL or SUPA_KEY not configured'
        print(f'[supa crm] {msg}')
        return False, msg

    clean = _sanitise_crm_item(item)
    body  = json.dumps(clean).encode()

    print(f'[supa crm] INSERT → {json.dumps(clean, ensure_ascii=False)[:400]}')

    req = urllib.request.Request(
        f'{SUPA_URL}/rest/v1/crm_items', data=body, method='POST',
        headers={
            'apikey':        SUPA_KEY,
            'Authorization': f'Bearer {SUPA_KEY}',
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
        })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            http_status = r.status
            resp_body   = r.read().decode()[:200]
        print(f'[supa crm] response HTTP {http_status}  body={resp_body!r}')
        # PostgREST INSERT with return=minimal → 201 Created (empty body)
        # Some PostgREST versions may return 204 No Content
        if http_status in (200, 201, 204):
            return True, ''
        msg = f'Unexpected HTTP {http_status}: {resp_body}'
        print(f'[supa crm] unexpected success status: {msg}')
        return False, msg

    except urllib.request.HTTPError as e:
        raw = ''
        try:
            raw = e.read().decode()[:600]
        except Exception:
            pass
        msg = f'HTTP {e.code}: {raw}'
        print(f'[supa crm] HTTP error: {msg}')
        return False, msg

    except Exception as e:
        msg = str(e)
        print(f'[supa crm] exception: {msg}')
        return False, msg


# ─────────────────────────────────────────────────────────────────────────────
# Telegram update processor
# ─────────────────────────────────────────────────────────────────────────────

def _handle_tg_update(update: dict) -> None:
    msg = update.get('message') or update.get('edited_message')
    if not msg:
        return
    chat_id = msg['chat']['id']
    if not TG_TOKEN or not OPENAI_KEY or not SUPA_URL:
        print('[tg handler] missing TG_TOKEN / OPENAI_KEY / SUPA_URL — skipping update')
        return
    try:
        source = 'telegram_text'
        text   = msg.get('text', '').strip()

        if not text and 'voice' in msg:
            source = 'telegram_voice'
            _tg_send(chat_id, '🎙 Transcribing…')
            text = _whisper_transcribe(_tg_download_file(msg['voice']['file_id']), 'audio/ogg')
        elif not text and 'audio' in msg:
            source = 'telegram_voice'
            aud    = msg['audio']
            _tg_send(chat_id, '🎙 Transcribing…')
            text = _whisper_transcribe(_tg_download_file(aud['file_id']),
                                       aud.get('mime_type', 'audio/mpeg'))
        if not text:
            _tg_send(chat_id, '⚠️ Send text or a voice note.'); return

        _tg_send(chat_id, '🧠 Classifying…')
        item     = _gpt_classify(text, source)
        ok, err  = _supa_insert_crm(item)

        if ok:
            EMOJI = {'task':'✅','note':'📝','contact':'👤','meeting':'📅',
                     'follow_up':'🔄','deal':'💼','reminder':'⏰'}
            e = EMOJI.get(item.get('type','task'), '✅')
            reply = (f"{e} *{item.get('title','Saved')}*\n"
                     f"Type: `{item.get('type','task')}`  ·  Priority: `{item.get('priority','medium')}`")
            if item.get('due_date'):     reply += f"\nDue: `{item['due_date']}`"
            if item.get('contact_name'): reply += f"\nContact: {item['contact_name']}"
            if item.get('tags'):         reply += '\nTags: ' + '  '.join(f'`{t}`' for t in item['tags'])
            _tg_send(chat_id, reply)
            # Push notification for tasks and reminders
            if item.get('type') in ('task', 'reminder', 'follow_up'):
                push_title = f"{EMOJI.get(item['type'], '✅')} {item.get('title', 'New item')}"
                push_body  = item.get('body', '')[:120]
                threading.Thread(
                    target=_push_send_all, args=(push_title, push_body, '/'),
                    daemon=True
                ).start()
        else:
            # Send the actual error so you don't have to check server logs
            _tg_send(chat_id, f'❌ *Supabase write failed*\n`{err[:400]}`')

    except Exception as exc:
        print(f'[tg handler] {exc}')
        _tg_send(chat_id, f'❌ Error: {str(exc)[:200]}')


# ─────────────────────────────────────────────────────────────────────────────
# HTTP server
# ─────────────────────────────────────────────────────────────────────────────

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma',        'no-cache')
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def do_GET(self):
        p = self.path
        if   p.startswith('/api/quotes'):            self._proxy_quotes()
        elif p.startswith('/api/config'):            self._api_config()
        elif p.startswith('/api/debug/crm'):         self._debug_crm()
        elif p.startswith('/api/plaid/config'):      self._plaid_config()
        elif p.startswith('/api/plaid/balance'):     self._plaid_balance()
        elif p.startswith('/api/plaid/transactions'):self._plaid_transactions()
        elif p.startswith('/api/push/vapid-key'):    self._push_vapid_key()
        elif p.startswith('/whoop/auth'):            self._whoop_auth()
        elif p.startswith('/whoop/callback'):        self._whoop_callback()
        elif p.startswith('/whoop/data'):            self._whoop_data()
        elif p.startswith('/whoop/status'):          self._whoop_status()
        elif p.startswith('/whoop/refresh'):         self._whoop_refresh_endpoint()
        elif p.startswith('/whoop/debug'):           self._whoop_debug()
        elif p.startswith('/google/auth'):           self._google_auth()
        elif p.startswith('/google/callback'):       self._google_callback()
        elif p.startswith('/google/events'):         self._google_events()
        elif p.startswith('/google/status'):         self._google_status()
        elif p.startswith('/telegram/set-webhook'):  self._tg_set_webhook()
        else:                                        super().do_GET()

    def do_POST(self):
        p = self.path
        if   p.startswith('/whoop/token'):              self._whoop_token_exchange()
        elif p.startswith('/api/plaid/link-token'):     self._plaid_link_token()
        elif p.startswith('/api/plaid/exchange-token'): self._plaid_exchange_token()
        elif p.startswith('/api/push/subscribe'):       self._push_subscribe()
        elif p.startswith('/api/push/send'):            self._push_send()
        elif p.startswith('/google/disconnect'):        self._google_disconnect()
        elif p.startswith('/api/parse-workout'):        self._parse_workout()
        elif p.startswith('/telegram/webhook'):         self._telegram_webhook()
        else:                                           self.send_error(404)

    # ── /api/config ───────────────────────────────────────────────────────────

    def _api_config(self):
        """Return public client-side config. Supabase anon key is safe to expose."""
        if not SUPA_URL or not SUPA_KEY:
            self._json_error(503, 'SUPA_URL / SUPA_KEY not set — add them to .env or Fly secrets')
            return
        body = json.dumps({'supaUrl': SUPA_URL, 'supaKey': SUPA_KEY}).encode()
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── stock quotes ─────────────────────────────────────────────────────────

    def _proxy_quotes(self):
        qs      = parse_qs(urlparse(self.path).query)
        raw     = qs.get('symbols', [','.join(DEFAULT_SYMBOLS)])[0]
        cleaned = re.sub(r'[^A-Z0-9,.\-]', '', raw.upper())[:500]
        symbols = [s for s in cleaned.split(',') if s][:20] or DEFAULT_SYMBOLS

        quotes, errors = {}, {}
        with ThreadPoolExecutor(max_workers=min(len(symbols), 8)) as pool:
            fm = {pool.submit(_stooq_fetch, s): s for s in symbols}
            for fut in as_completed(fm):
                sym = fm[fut]
                try:    quotes[sym] = fut.result()
                except Exception as exc:
                    errors[sym] = str(exc); print(f'[quotes] {sym}: {exc}')

        ok   = bool(quotes)
        body = json.dumps({'ok': ok, 'quotes': quotes, 'errors': errors}).encode()
        self.send_response(200 if ok else 502)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── WHOOP OAuth ───────────────────────────────────────────────────────────

    def _whoop_auth(self):
        qs  = parse_qs(urlparse(self.path).query)
        cid = qs.get('client_id', [''])[0].strip()
        if not cid:
            self._json_error(400, 'Missing client_id'); return

        # Generate a one-time state token and store it server-side.
        state = str(uuid.uuid4())
        now   = time.time()
        with _WHOOP_STATES_LOCK:
            # Expire old entries first
            expired = [k for k, ts in _WHOOP_STATES.items() if now - ts > _WHOOP_STATE_TTL]
            for k in expired:
                del _WHOOP_STATES[k]
            _WHOOP_STATES[state] = now

        params = urllib.parse.urlencode({
            'client_id':     cid,
            'redirect_uri':  WHOOP_REDIRECT,
            'response_type': 'code',
            'scope':         WHOOP_SCOPE,
            'state':         state,
        })
        print(f'[whoop auth] redirect_uri={WHOOP_REDIRECT}  state={state[:8]}…')
        self.send_response(302)
        self.send_header('Location', f'{WHOOP_AUTH_URL}?{params}')
        self.end_headers()

    def _whoop_callback(self):
        """
        OAuth callback — does the FULL token exchange server-side.
        No localStorage, no client-side fetch. Works from Safari (PWA OAuth flow).
        Stores access_token, refresh_token, expiry to Supabase, then redirects.
        """
        qs    = parse_qs(urlparse(self.path).query)
        code  = qs.get('code',  [''])[0]
        err   = qs.get('error', [''])[0]
        state = qs.get('state', [''])[0]

        # ── State validation ──────────────────────────────────────────────────
        state_error = ''
        if err:
            state_error = f'WHOOP returned an error: {err}'
        elif not state:
            print('[whoop callback] WARNING: no state in callback (CSRF unverified)')
        else:
            with _WHOOP_STATES_LOCK:
                ts = _WHOOP_STATES.pop(state, None)
            if ts is None:
                state_error = (
                    f'OAuth state mismatch ({state[:8]}…). '
                    'The link may have expired — please start the connection again.'
                )
                print(f'[whoop callback] invalid_state: {state[:8]}…')
            elif time.time() - ts > _WHOOP_STATE_TTL:
                state_error = 'OAuth state expired — please reconnect.'
                print(f'[whoop callback] state expired for {state[:8]}…')
            else:
                print(f'[whoop callback] state OK ({state[:8]}…)')

        # ── Server-side token exchange ────────────────────────────────────────
        exchange_error = ''
        if not state_error and code:
            cid, sec = _whoop_creds()
            if not cid or not sec:
                exchange_error = (
                    'WHOOP Client ID / Secret not configured on the server. '
                    'Add WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET as Fly.io secrets, '
                    'or enter them in the Health Pulse settings first.'
                )
                print('[whoop callback] client credentials missing — cannot exchange code')
            else:
                post_data = urllib.parse.urlencode({
                    'grant_type':   'authorization_code',
                    'code':          code,
                    'redirect_uri':  WHOOP_REDIRECT,
                    'client_id':     cid,
                    'client_secret': sec,
                }).encode()
                req = urllib.request.Request(
                    WHOOP_TOKEN_URL, data=post_data, method='POST',
                    headers={'Content-Type': 'application/x-www-form-urlencoded',
                             'User-Agent': UA})
                try:
                    with urllib.request.urlopen(req, timeout=15) as r:
                        tok = json.loads(r.read().decode())
                    _whoop_save_tokens(tok)
                    print(f'[whoop callback] tokens stored ✓ '
                          f'access={tok.get("access_token","")[:12]}…')
                except urllib.request.HTTPError as e:
                    body_txt = e.read().decode()
                    exchange_error = f'Token exchange HTTP {e.code}: {body_txt[:200]}'
                    print(f'[whoop callback] exchange error: {exchange_error}')
                except Exception as e:
                    exchange_error = f'Token exchange failed: {e}'
                    print(f'[whoop callback] exchange error: {e}')

        final_error = state_error or exchange_error
        if final_error:
            html_body = (
                f'<div id="msg" style="color:#FF4D6D">Connection failed</div>'
                f'<div id="err" style="max-width:480px;text-align:center;line-height:1.6">'
                f'{final_error}<br><br><a href="/">← Back to dashboard</a></div>'
            )
        else:
            html_body = (
                '<div id="msg">✓ WHOOP Connected!</div>'
                '<div id="err">Redirecting…</div>'
                '<script>setTimeout(()=>window.location.href="/",900)</script>'
            )

        html = (
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>WHOOP</title>'
            '<style>body{background:#001218;color:#8EB8C8;font-family:monospace;font-size:13px;'
            'display:flex;flex-direction:column;align-items:center;justify-content:center;'
            'height:100vh;margin:0;gap:12px;}'
            '#msg{color:#00D4FF;letter-spacing:.08em;}'
            'a{color:#00D4FF;text-decoration:none;}</style></head><body>'
            + html_body
            + '</body></html>'
        )
        body = html.encode()
        self.send_response(200)
        self.send_header('Content-Type',   'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _whoop_token_exchange(self):
        """
        Legacy POST /whoop/token — still accepts code+credentials for backward compat
        but now also does full server-side credential lookup as fallback.
        """
        length = int(self.headers.get('Content-Length', 0))
        try:    payload = json.loads(self.rfile.read(length))
        except: self._json_error(400, 'Invalid JSON'); return
        code = payload.get('code', '')
        cid  = payload.get('client_id',     '') or WHOOP_CLIENT_ID
        sec  = payload.get('client_secret', '') or WHOOP_CLIENT_SECRET
        if not code:
            self._json_error(400, 'Missing code'); return
        if not cid or not sec:
            cid2, sec2 = _whoop_creds()
            cid = cid or cid2; sec = sec or sec2
        if not all([code, cid, sec]):
            self._json_error(400, 'Missing code/client_id/client_secret'); return
        post_data = urllib.parse.urlencode({
            'grant_type': 'authorization_code', 'code': code,
            'redirect_uri': WHOOP_REDIRECT, 'client_id': cid, 'client_secret': sec,
        }).encode()
        req = urllib.request.Request(WHOOP_TOKEN_URL, data=post_data, method='POST',
                  headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                body = r.read()
                tok  = json.loads(body.decode())
        except urllib.request.HTTPError as e:
            self._json_error(e.code, e.read().decode()); return
        except Exception as e:
            self._json_error(502, str(e)); return
        _whoop_save_tokens(tok)
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _whoop_data(self):
        qs       = parse_qs(urlparse(self.path).query)
        endpoint = qs.get('endpoint', [''])[0].strip()
        ALLOWED  = set(WHOOP_ENDPOINT_URLS.keys())
        if endpoint not in ALLOWED:
            self._json_error(400, f'endpoint must be one of {sorted(ALLOWED)}'); return

        # Get valid token — proactive refresh if expiring within 60s
        try:
            access_token = _whoop_get_valid_token()
        except Exception as e:
            self._json_error(401, f'WHOOP token error: {e}'); return

        if not access_token:
            self._json_error(401, 'WHOOP not connected — reconnect via Health Pulse'); return

        url = WHOOP_ENDPOINT_URLS[endpoint]
        print(f'[whoop data] GET {url}  token={access_token[:12]}…')

        # First attempt
        try:
            body = _whoop_api_call(endpoint, access_token)
            raw_text = body.decode('utf-8', errors='replace')
            print(f'[whoop data] {endpoint} → 200 ({len(body)}B)')
            print(f'[whoop RAW] {endpoint}: {raw_text[:3000]}')
        except urllib.request.HTTPError as e:
            if e.code == 401:
                # 401 on a supposedly valid token — force refresh and retry once
                print(f'[whoop data] 401 on {endpoint} — forcing refresh + retry')
                try:
                    new_access = _whoop_do_refresh()
                    body = _whoop_api_call(endpoint, new_access)
                    raw_text = body.decode('utf-8', errors='replace')
                    print(f'[whoop data] {endpoint} → 200 after refresh ({len(body)}B)')
                    print(f'[whoop RAW] {endpoint}: {raw_text[:3000]}')
                except Exception as ref_e:
                    self._json_error(401, f'WHOOP refresh failed: {ref_e}'); return
            else:
                err_body = e.read().decode('utf-8', errors='replace')
                print(f'[whoop data] {endpoint} → HTTP {e.code}: {err_body[:500]}')
                self._json_error(e.code, err_body); return
        except Exception as e:
            self._json_error(502, str(e)); return

        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _whoop_status(self):
        """Return WHOOP connection status and token expiry from Supabase."""
        access_token  = _supa_kv_get('whoop_access_token')  or ''
        refresh_token = _supa_kv_get('whoop_refresh_token') or ''
        expires_at    = _supa_kv_get('whoop_token_expiry')  or 0
        # Backward compat — fall back to legacy dict
        if not access_token:
            tok = _supa_kv_get('sos_whoop_token')
            if tok and isinstance(tok, dict):
                access_token  = tok.get('access_token', '')
                refresh_token = tok.get('refresh_token', '')
                fa_ms = tok.get('fetched_at', 0)
                fa_s  = fa_ms / 1000 if fa_ms > 1e10 else fa_ms
                expires_at = int(fa_s + tok.get('expires_in', 0))
        if not access_token:
            self._json({'connected': False, 'has_refresh': bool(refresh_token)}); return
        now = int(time.time())
        ttl = expires_at - now if expires_at else None
        self._json({
            'connected':    True,
            'expires_at':   expires_at * 1000,   # ms for client
            'ttl_seconds':  ttl,
            'expired':      ttl is not None and ttl < 0,
            'needs_refresh': ttl is not None and ttl < 60,
            'has_refresh':   bool(refresh_token),
        })

    def _whoop_refresh_endpoint(self):
        """GET /whoop/refresh — manually force a token refresh. Useful for debugging."""
        print('[whoop refresh endpoint] manual refresh requested')
        try:
            new_access = _whoop_do_refresh()
            expires_at = _supa_kv_get('whoop_token_expiry') or 0
            self._json({
                'ok':          True,
                'access_token': new_access[:12] + '…',
                'expires_at':   expires_at,
                'ttl_seconds':  expires_at - int(time.time()) if expires_at else None,
            })
        except Exception as e:
            self._json_error(500, f'Refresh failed: {e}')

    def _whoop_debug(self):
        """
        GET /whoop/debug — calls every relevant WHOOP endpoint and returns the
        complete raw JSON for each so you can locate weight and VO2 max fields.
        Safe to hit at any time; read-only.
        """
        try:
            access_token = _whoop_get_valid_token()
        except Exception as e:
            self._json_error(401, f'WHOOP token error: {e}'); return
        if not access_token:
            self._json_error(401, 'WHOOP not connected — reconnect via Health Pulse'); return

        # All URLs to probe — keyed by a friendly label
        probe_urls = {
            'v1/body/measurement':        f'{WHOOP_API_V1}/body/measurement',
            'v1/user/measurement':        f'{WHOOP_API_V1}/user/measurement',
            'v2/user/measurement':        f'{WHOOP_API_BASE}/user/measurement',
            'v1/recovery/collection':     f'{WHOOP_API_V1}/recovery/collection?limit=1',
            'v2/recovery':                f'{WHOOP_API_BASE}/recovery?limit=1',
            'v2/cycle':                   f'{WHOOP_API_BASE}/cycle?limit=1',
        }

        results = {}
        for label, url in probe_urls.items():
            print(f'[whoop debug] probing {url}')
            try:
                req = urllib.request.Request(
                    url,
                    headers={'Authorization': f'Bearer {access_token}',
                             'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=12) as r:
                    raw = r.read().decode('utf-8', errors='replace')
                print(f'[whoop debug] {label} → 200 ({len(raw)}B): {raw[:800]}')
                try:
                    results[label] = {'status': 200, 'data': json.loads(raw)}
                except Exception:
                    results[label] = {'status': 200, 'raw': raw}
            except urllib.request.HTTPError as e:
                err_body = ''
                try: err_body = e.read().decode('utf-8', errors='replace')
                except Exception: pass
                print(f'[whoop debug] {label} → HTTP {e.code}: {err_body[:300]}')
                results[label] = {'status': e.code, 'error': err_body[:500]}
            except Exception as exc:
                print(f'[whoop debug] {label} → exception: {exc}')
                results[label] = {'status': 0, 'error': str(exc)}

        self._json({
            'token':     access_token[:12] + '…',
            'scope':     WHOOP_SCOPE,
            'endpoints': results,
        })

    # ── Telegram webhook ──────────────────────────────────────────────────────

    def _tg_set_webhook(self):
        qs  = parse_qs(urlparse(self.path).query)
        url = qs.get('url', [''])[0].strip()
        if not url:
            self._json_error(400, 'Usage: /telegram/set-webhook?url=https://...'); return
        try:
            result = _tg_api('setWebhook', {'url': url, 'allowed_updates': ['message']})
            body   = json.dumps(result).encode()
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self._json_error(502, str(e))

    def _telegram_webhook(self):
        length = int(self.headers.get('Content-Length', 0))
        raw    = self.rfile.read(length)
        self.send_response(200)
        self.send_header('Content-Length', '0')
        self.end_headers()
        try:
            update = json.loads(raw)
            threading.Thread(target=_handle_tg_update, args=(update,), daemon=True).start()
        except Exception as e:
            print(f'[telegram webhook] {e}')

    # ── CRM debug ────────────────────────────────────────────────────────────

    def _debug_crm(self):
        """
        Smoke-test the crm_items table and try a test INSERT + DELETE.
        Hit: GET /api/debug/crm
        Returns JSON with 'ok', 'checks', and any error details.
        """
        checks = {}
        overall_ok = True

        # 1. Config present?
        checks['config'] = {
            'supa_url_set': bool(SUPA_URL),
            'supa_key_set': bool(SUPA_KEY),
        }
        if not SUPA_URL or not SUPA_KEY:
            self._json({'ok': False, 'checks': checks, 'error': 'SUPA_URL or SUPA_KEY missing'}); return

        # 2. SELECT from crm_items
        try:
            req = urllib.request.Request(
                f'{SUPA_URL}/rest/v1/crm_items?select=id,type,title&order=created_at.desc&limit=3',
                headers={'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}',
                         'Accept': 'application/json', 'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=10) as r:
                rows = json.loads(r.read().decode())
            checks['select'] = {'ok': True, 'row_count': len(rows), 'rows': rows}
        except urllib.request.HTTPError as e:
            raw = ''
            try: raw = e.read().decode()[:400]
            except: pass
            checks['select'] = {'ok': False, 'http_status': e.code, 'error': raw}
            overall_ok = False
        except Exception as e:
            checks['select'] = {'ok': False, 'error': str(e)}
            overall_ok = False

        # 3. Try a test INSERT (with __debug__=true marker) then immediately DELETE it
        test_item = {
            'type': 'note', 'title': '__debug_test__',
            'body': 'automated test insert — will be deleted immediately',
            'priority': 'low', 'status': 'open',
            'tags': ['__debug__'], 'source': 'debug',
            'due_date': None, 'contact_name': None, 'raw_transcript': '',
        }
        insert_ok, insert_err = _supa_insert_crm(test_item)
        checks['insert'] = {'ok': insert_ok, 'error': insert_err}
        if not insert_ok:
            overall_ok = False

        if insert_ok:
            # clean up test row
            try:
                del_req = urllib.request.Request(
                    f'{SUPA_URL}/rest/v1/crm_items?title=eq.__debug_test__',
                    method='DELETE',
                    headers={'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}',
                             'User-Agent': UA})
                with urllib.request.urlopen(del_req, timeout=10) as r:
                    checks['cleanup'] = {'ok': True, 'http_status': r.status}
            except Exception as e:
                checks['cleanup'] = {'ok': False, 'error': str(e)}

        self._json({'ok': overall_ok, 'checks': checks})

    # ── Web Push ──────────────────────────────────────────────────────────────

    def _push_vapid_key(self):
        if not VAPID_PUBLIC_KEY:
            self._json_error(503, 'VAPID keys not configured — set VAPID_PUBLIC_KEY env var')
            return
        self._json({'publicKey': VAPID_PUBLIC_KEY})

    def _push_subscribe(self):
        length = int(self.headers.get('Content-Length', 0))
        try:    sub = json.loads(self.rfile.read(length))
        except Exception: self._json_error(400, 'Invalid JSON'); return
        ok, err = _push_save_sub(sub)
        if ok:
            self._json({'ok': True})
        else:
            self._json_error(500, err)

    def _push_send(self):
        length = int(self.headers.get('Content-Length', 0))
        try:    payload = json.loads(self.rfile.read(length))
        except Exception: self._json_error(400, 'Invalid JSON'); return
        title     = payload.get('title', 'Spencer OS')
        body_text = payload.get('body',  '')
        url       = payload.get('url',   '/')
        threading.Thread(
            target=_push_send_all, args=(title, body_text, url), daemon=True
        ).start()
        self._json({'ok': True, 'queued': True})

    def _json(self, data: dict):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode()
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── Workout paste parser ──────────────────────────────────────────────────

    def _parse_workout(self):
        """POST /api/parse-workout  body: {text: string}
        Uses OpenAI to extract structured workout data from pasted Hevy text.
        Returns: {name, date, duration, totalVolume, exercises:[{name,sets:[{reps,weight}]}]}
        """
        length = int(self.headers.get('Content-Length', 0))
        body   = json.loads(self.rfile.read(length))
        text   = (body.get('text') or '').strip()
        if not text:
            self._json_error(400, 'No text provided'); return
        if not OPENAI_KEY:
            self._json_error(503, 'OPENAI_KEY not configured'); return

        today  = datetime.date.today().isoformat()
        system = (
            'You are a workout parser. Parse the workout text and return ONLY a raw JSON '
            'object (no markdown fences, no extra keys) with exactly these fields:\n'
            '  name        : string  — workout name (e.g. "Push Day A")\n'
            '  date        : string  — ISO date YYYY-MM-DD; use today if absent\n'
            '  duration    : string  — e.g. "62 min"; empty string if unknown\n'
            '  totalVolume : number  — total lbs lifted (sum of reps × weight for all sets; 0 if unknown)\n'
            '  exercises   : array of { name: string, sets: [ { reps: number, weight: number } ] }\n'
            'Convert kg→lbs (multiply by 2.205, round to nearest 0.5). '
            'If weight units are unclear assume lbs. '
            f'Today is {today}. Return ONLY the JSON object.'
        )
        payload = {
            'model': 'gpt-4o-mini', 'temperature': 0.1, 'max_tokens': 1500,
            'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user',   'content': text},
            ],
        }
        req = urllib.request.Request(
            'https://api.openai.com/v1/chat/completions',
            data=json.dumps(payload).encode(),
            headers={'Authorization': f'Bearer {OPENAI_KEY}',
                     'Content-Type': 'application/json', 'User-Agent': UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = json.loads(r.read().decode())['choices'][0]['message']['content'].strip()
        except Exception as e:
            self._json_error(502, f'OpenAI error: {e}'); return

        # Strip markdown fences if model wraps anyway
        if raw.startswith('```'):
            parts = raw.split('```')
            raw   = parts[1].lstrip('json\n').strip() if len(parts) > 1 else raw

        try:
            result = json.loads(raw)
        except Exception:
            self._json_error(422, f'Could not parse model response: {raw[:300]}'); return

        resp = json.dumps(result).encode()
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    # ── Plaid ─────────────────────────────────────────────────────────────────

    def _plaid_post(self, path: str, data: dict) -> bytes:
        payload = {**data, 'client_id': PLAID_CLIENT_ID, 'secret': PLAID_SECRET}
        body    = json.dumps(payload).encode()
        req     = urllib.request.Request(f'{PLAID_API_BASE}{path}', data=body,
                      headers={'Content-Type': 'application/json', 'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()

    def _plaid_config(self):
        body = json.dumps({
            'env':   PLAID_ENV,
            'ready': bool(PLAID_CLIENT_ID and PLAID_SECRET),
        }).encode()
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _plaid_link_token(self):
        if not PLAID_CLIENT_ID or not PLAID_SECRET:
            self._json_error(503, 'Plaid not configured — set PLAID_CLIENT_ID + PLAID_SECRET'); return
        try:
            body = self._plaid_post('/link/token/create', {
                'user':          {'client_user_id': 'spencer'},
                'client_name':   'Spencer OS',
                'products':      ['transactions'],
                'country_codes': ['US'],
                'language':      'en',
            })
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.request.HTTPError as e:
            self._json_error(e.code, e.read().decode())
        except Exception as e:
            self._json_error(502, str(e))

    def _plaid_exchange_token(self):
        if not PLAID_CLIENT_ID or not PLAID_SECRET:
            self._json_error(503, 'Plaid not configured'); return
        length = int(self.headers.get('Content-Length', 0))
        try:    payload = json.loads(self.rfile.read(length))
        except: self._json_error(400, 'Invalid JSON'); return
        public_token = payload.get('public_token', '')
        if not public_token:
            self._json_error(400, 'Missing public_token'); return
        try:
            body = self._plaid_post('/item/public_token/exchange',
                                    {'public_token': public_token})
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.request.HTTPError as e:
            self._json_error(e.code, e.read().decode())
        except Exception as e:
            self._json_error(502, str(e))

    def _plaid_balance(self):
        if not PLAID_CLIENT_ID or not PLAID_SECRET:
            self._json_error(503, 'Plaid not configured'); return
        qs           = parse_qs(urlparse(self.path).query)
        access_token = qs.get('access_token', [''])[0].strip()
        if not access_token:
            self._json_error(400, 'Missing access_token'); return
        try:
            body = self._plaid_post('/accounts/balance/get',
                                    {'access_token': access_token})
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.request.HTTPError as e:
            raw = e.read().decode()
            try:
                err = json.loads(raw)
                if err.get('error_code') == 'ITEM_LOGIN_REQUIRED':
                    self._json({'reconnect_required': True,
                                'error_code': 'ITEM_LOGIN_REQUIRED',
                                'error': 'Bank login expired — please reconnect'}); return
            except Exception: pass
            self._json_error(e.code, raw)
        except Exception as e:
            self._json_error(502, str(e))

    def _plaid_transactions(self):
        if not PLAID_CLIENT_ID or not PLAID_SECRET:
            self._json_error(503, 'Plaid not configured'); return
        qs           = parse_qs(urlparse(self.path).query)
        access_token = qs.get('access_token', [''])[0].strip()
        if not access_token:
            self._json_error(400, 'Missing access_token'); return
        today = datetime.date.today()
        start = (today - datetime.timedelta(days=30)).isoformat()
        end   = today.isoformat()
        try:
            body = self._plaid_post('/transactions/get', {
                'access_token': access_token,
                'start_date':   start,
                'end_date':     end,
                'count':        50,
            })
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except urllib.request.HTTPError as e:
            raw = e.read().decode()
            try:
                err = json.loads(raw)
                if err.get('error_code') == 'ITEM_LOGIN_REQUIRED':
                    self._json({'reconnect_required': True,
                                'error_code': 'ITEM_LOGIN_REQUIRED',
                                'error': 'Bank login expired — please reconnect'}); return
            except Exception: pass
            self._json_error(e.code, raw)
        except Exception as e:
            self._json_error(502, str(e))

    # ── Google Calendar ───────────────────────────────────────────────────────

    def _google_auth(self):
        if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
            self._json_error(503, (
                'Google OAuth not configured — '
                'set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Fly secrets'
            )); return
        state = str(uuid.uuid4())
        now   = time.time()
        with _GOOGLE_STATES_LOCK:
            expired = [k for k, ts in _GOOGLE_STATES.items()
                       if now - ts > _GOOGLE_STATE_TTL]
            for k in expired:
                del _GOOGLE_STATES[k]
            _GOOGLE_STATES[state] = now
        params = urllib.parse.urlencode({
            'client_id':     GOOGLE_CLIENT_ID,
            'redirect_uri':  GOOGLE_REDIRECT,
            'response_type': 'code',
            'scope':         GOOGLE_SCOPE,
            'access_type':   'offline',
            'prompt':        'consent',        # always force consent to get refresh_token
            'state':         state,
        })
        print(f'[google auth] redirect → {GOOGLE_REDIRECT}  state={state[:8]}…')
        self.send_response(302)
        self.send_header('Location', f'{GOOGLE_AUTH_URL}?{params}')
        self.end_headers()

    def _google_callback(self):
        qs    = parse_qs(urlparse(self.path).query)
        code  = qs.get('code',  [''])[0]
        err   = qs.get('error', [''])[0]
        state = qs.get('state', [''])[0]

        fail_msg = ''
        if err:
            fail_msg = f'Google returned an error: {err}'
        elif state:
            with _GOOGLE_STATES_LOCK:
                ts = _GOOGLE_STATES.pop(state, None)
            if ts is None:
                fail_msg = ('OAuth state mismatch — please try connecting again '
                            '(the link may have expired).')
                print(f'[google callback] invalid_state: {state[:8]}…')
            elif time.time() - ts > _GOOGLE_STATE_TTL:
                fail_msg = 'OAuth state expired — please reconnect.'

        if not fail_msg and not code:
            fail_msg = 'No authorization code received from Google.'

        if not fail_msg:
            try:
                tokens     = _google_exchange_code(code)
                expires_in = tokens.get('expires_in', 3600)
                tokens['expires_at'] = int((time.time() + expires_in) * 1000)  # ms
                _supa_kv_set('sos_gcal_tokens', tokens)
                print('[google callback] tokens saved to Supabase kv_store')
                success = True
            except Exception as exc:
                print(f'[google callback] token exchange failed: {exc}')
                fail_msg = str(exc)
                success  = False
        else:
            success = False

        if success:
            redirect_html = '  setTimeout(() => window.location.href = "/", 800);'
            msg_txt  = '✓ Google Calendar connected! Redirecting…'
            err_html = ''
        else:
            redirect_html = ''
            msg_txt  = 'Connection failed'
            err_html = (f'{fail_msg}<br><br>'
                        f'<a href="/">← Back to dashboard</a>')

        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Google Calendar</title>
<style>body{{background:#001218;color:#8EB8C8;font-family:monospace;font-size:13px;
display:flex;flex-direction:column;align-items:center;justify-content:center;
height:100vh;margin:0;gap:12px;}}
#msg{{color:#00D4FF;letter-spacing:.08em;}}
#err{{color:#FF4D6D;max-width:480px;text-align:center;line-height:1.6;}}
a{{color:#00D4FF;text-decoration:none;}}</style></head><body>
<div id="msg">{msg_txt}</div>
<div id="err">{err_html}</div>
<script>{redirect_html}</script>
</body></html>"""
        body = html.encode()
        self.send_response(200)
        self.send_header('Content-Type',   'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _google_events(self):
        """Proxy Google Calendar events with automatic token refresh."""
        try:
            access_token = _google_get_valid_token()
        except Exception as e:
            self._json_error(401, str(e)); return
        if not access_token:
            self._json_error(401, 'Not connected to Google Calendar'); return

        qs      = parse_qs(urlparse(self.path).query)
        now_iso = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        max_iso = (datetime.datetime.utcnow() +
                   datetime.timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
        cal_params = urllib.parse.urlencode({
            'timeMin':      qs.get('timeMin',     [now_iso])[0],
            'timeMax':      qs.get('timeMax',     [max_iso])[0],
            'singleEvents': 'true',
            'orderBy':      'startTime',
            'maxResults':   qs.get('maxResults',  ['25'])[0],
        })

        def _fetch(tok):
            r = urllib.request.Request(
                f'https://www.googleapis.com/calendar/v3/calendars/primary/events?{cal_params}',
                headers={'Authorization': f'Bearer {tok}', 'User-Agent': UA})
            with urllib.request.urlopen(r, timeout=15) as resp:
                return resp.read()

        try:
            body = _fetch(access_token)
        except urllib.request.HTTPError as e:
            if e.code == 401:
                # Force refresh and retry once
                try:
                    access_token = _google_get_valid_token(force_refresh=True)
                    body = _fetch(access_token)
                except Exception as ref_e:
                    self._json_error(401, f'Google Calendar reconnection required: {ref_e}')
                    return
            else:
                self._json_error(e.code, e.read().decode()); return
        except Exception as e:
            self._json_error(502, str(e)); return

        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _google_status(self):
        """Return Google Calendar connection status."""
        tokens = _supa_kv_get('sos_gcal_tokens')
        if not tokens or not isinstance(tokens, dict) or not tokens.get('access_token'):
            self._json({'connected': False}); return
        expires_at  = tokens.get('expires_at', 0)
        exp_sec     = expires_at / 1000 if expires_at > 1e10 else float(expires_at)
        has_refresh = bool(tokens.get('refresh_token'))
        self._json({
            'connected':   True,
            'has_refresh': has_refresh,
            'expires_at':  expires_at,
            'will_refresh': has_refresh,          # always auto-refreshes if refresh_token present
        })

    def _google_disconnect(self):
        """Clear Google tokens from Supabase kv_store."""
        _supa_kv_set('sos_gcal_tokens', None)
        self._json({'ok': True})

    # ── helper ───────────────────────────────────────────────────────────────

    def _json_error(self, code: int, msg: str):
        body = json.dumps({'error': msg}).encode()
        self.send_response(code)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f'Spencer OS  →  http://localhost:{PORT}')
    print(f'Config      →  http://localhost:{PORT}/api/config')
    print(f'Telegram    →  python3 telegram_poll.py  (local polling)')
    print(f'             or set-webhook: http://localhost:{PORT}/telegram/set-webhook?url=<https-url>')
    if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
        print(f'Push        →  VAPID configured  ·  daily 8am push enabled')
        _start_daily_push_scheduler()
    else:
        print(f'Push        →  VAPID keys not set — push notifications disabled')
    ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
