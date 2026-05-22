/* global React, Card, Icon, useLocalStorage */
const { useState: useStateCal, useEffect: useEffectCal } = React;

/* ── Google Calendar config ───────────────────── */
const GCAL_SCOPE      = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_DEFAULT_ID = '573874320221-npgs5l5reilr5mop4s7ugk3hes69gsap.apps.googleusercontent.com';

/* Google Calendar colorId → display color */
const GCAL_COLORS = {
  1: '#7986CB',         // lavender
  2: '#33B679',         // sage
  3: '#8E24AA',         // grape
  4: '#E67C73',         // flamingo
  5: '#F6BF26',         // banana
  6: '#F4511E',         // tangerine
  7: 'var(--accent)',   // peacock → cyan
  8: 'var(--fg-3)',     // graphite
  9: '#3F51B5',         // blueberry
  10: 'var(--pos)',     // basil → green
  11: 'var(--neg)',     // tomato → red
};

const DAYS_ABBR  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/* ── helpers ──────────────────────────────────── */
function todayMetaStr() {
  const d = new Date();
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/* Format event start for time column */
function fmtStart(start, allDay) {
  if (!start) return '';
  if (allDay) return 'ALL DAY';
  const d = new Date(start);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return isToday ? `${h}:${m}` : `${DAYS_ABBR[d.getDay()]} ${h}:${m}`;
}

/* Day group header label */
function dayLabel(start, allDay) {
  const d = allDay ? new Date(start + 'T12:00:00') : new Date(start);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((d0 - t0) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return `${DAYS_ABBR[d.getDay()]} · ${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

function isHappening(start, end) {
  const now = Date.now();
  if (!start) return false;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 3600000;
  return s <= now && now < e;
}

function isPast(end, allDay) {
  if (!end) return false;
  const e = allDay ? new Date(end + 'T12:00:00').getTime() : new Date(end).getTime();
  return e < Date.now();
}

function evColor(ev) {
  return ev.colorId ? (GCAL_COLORS[Number(ev.colorId)] || 'var(--accent)') : 'var(--accent)';
}

/* Load Google Identity Services script lazily */
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Could not load Google Identity Services'));
    document.head.appendChild(s);
  });
}

/* ════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════ */
function Calendar() {
  /* ── persistent state ── */
  const [clientId, setClientId] = useLocalStorage('sos_gcal_client_id', GCAL_DEFAULT_ID);
  const [token,    setToken]    = useLocalStorage('sos_gcal_token',     null);
  const [events,   setEvents]   = useLocalStorage('sos_gcal_events',    []);

  /* ── transient state ── */
  const [status,    setStatus]    = useStateCal('idle');   // idle|connecting|loading|live|error
  const [errMsg,    setErrMsg]    = useStateCal('');
  const [idInput,   setIdInput]   = useStateCal('');
  const [showSetup, setShowSetup] = useStateCal(false);

  const isConnected = Boolean(token && token.expires_at > Date.now());
  const isExpired   = Boolean(token && token.expires_at <= Date.now());

  /* ── fetch events ──────────────────────────── */
  async function fetchEvents(accessToken) {
    setStatus('loading');
    setErrMsg('');
    try {
      const now  = new Date().toISOString();
      const maxT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams({
        timeMin: now, timeMax: maxT,
        singleEvents: 'true', orderBy: 'startTime', maxResults: '25',
      });
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (r.status === 401) {
        setToken(null);
        setStatus('idle');
        setErrMsg('Session expired — please reconnect');
        return;
      }
      if (!r.ok) throw new Error(`Google API returned HTTP ${r.status}`);
      const data = await r.json();
      const mapped = (data.items || []).map(ev => ({
        id:      ev.id,
        name:    ev.summary || '(no title)',
        start:   ev.start?.dateTime || ev.start?.date || null,
        end:     ev.end?.dateTime   || ev.end?.date   || null,
        allDay:  !ev.start?.dateTime,
        colorId: ev.colorId || null,
      }));
      setEvents(mapped);
      setStatus('live');
    } catch (e) {
      setErrMsg(e.message);
      setStatus('error');
    }
  }

  /* ── on mount: auto-load if token valid ── */
  useEffectCal(() => {
    if (isConnected) {
      fetchEvents(token.access_token);
    }
  }, []); // intentionally run once on mount

  /* effective client ID — always falls back to the hardcoded default */
  const effectiveId = (clientId || GCAL_DEFAULT_ID).trim();

  /* ── OAuth connect ─────────────────────────── */
  async function connect() {
    const id = effectiveId;
    if (!id) { setShowSetup(true); return; }
    setStatus('connecting');
    setErrMsg('');
    try {
      await loadGIS();
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: GCAL_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            const msg =
              resp.error === 'popup_closed_by_user' ? 'Popup closed — try again' :
              resp.error === 'access_denied'         ? 'Access denied' :
              resp.error_description || resp.error;
            setErrMsg(msg);
            setStatus('idle');
            return;
          }
          const tok = {
            access_token: resp.access_token,
            expires_at:   Date.now() + resp.expires_in * 1000,
          };
          setToken(tok);
          fetchEvents(resp.access_token);
        },
      });
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      setErrMsg(e.message);
      setStatus('idle');
    }
  }

  function disconnect() {
    setToken(null);
    setEvents([]);
    setStatus('idle');
    setErrMsg('');
  }

  function saveClientId() {
    const id = idInput.trim();
    if (!id) return;
    setClientId(id);
    setIdInput('');
    setShowSetup(false);
  }

  /* ── group events by day for rendering ── */
  const grouped = [];
  let lastDay = null;
  events.forEach(ev => {
    const dl = ev.start ? dayLabel(ev.start, ev.allDay) : 'UNKNOWN';
    if (dl !== lastDay) {
      grouped.push({ type: 'header', label: dl });
      lastDay = dl;
    }
    grouped.push({ type: 'event', ...ev });
  });

  /* ── meta text ── */
  const metaTxt = {
    idle:       todayMetaStr(),
    connecting: 'CONNECTING…',
    loading:    'LOADING…',
    live:       todayMetaStr(),
    error:      todayMetaStr(),
  }[status] ?? todayMetaStr();

  /* ════════════════════════════════ render */
  return (
    <Card icon="calendar-days" label="calendar · today" meta={metaTxt}
      action={
        isConnected ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* live dot */}
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: status === 'live' ? 'var(--pos)' : status === 'loading' ? 'var(--accent)' : 'var(--warn)',
              boxShadow: status === 'live' ? '0 0 6px var(--pos)' : 'none',
              display: 'inline-block', transition: 'background 400ms',
            }} />
            {/* refresh */}
            <span onClick={() => fetchEvents(token.access_token)} title="Refresh events"
              style={{ cursor: 'pointer', color: 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
              <Icon name="refresh-cw" size={12} />
            </span>
            {/* disconnect */}
            <span onClick={disconnect} title="Disconnect Google Calendar"
              style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex', alignItems: 'center' }}>
              <Icon name="unplug" size={12} />
            </span>
          </div>
        ) : null
      }>

      {/* ══ NOT CONNECTED ══════════════════════════════════ */}
      {!isConnected && (
        <div>

          {/* setup instructions panel */}
          {showSetup && (
            <div style={{
              marginBottom: 14, padding: '12px 14px',
              background: 'var(--bg-0)', border: '1px solid var(--border)',
              borderRadius: 4,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                letterSpacing: '0.1em', marginBottom: 10,
              }}>
                GOOGLE CALENDAR SETUP
              </div>
              <ol style={{ margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  <>Go to <span style={{ color: 'var(--accent)' }}>console.cloud.google.com</span> → New Project</>,
                  <>APIs & Services → Library → enable <strong>Google Calendar API</strong></>,
                  <>Credentials → Create OAuth 2.0 Client ID → type: <strong>Web Application</strong></>,
                  <>Authorized JavaScript origins: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--warn)', fontSize: 10 }}>http://localhost:8765</span></>,
                  <>Copy the Client ID and paste it below</>,
                ].map((step, i) => (
                  <li key={i} style={{
                    fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)',
                    lineHeight: 1.55,
                  }}>
                    {step}
                  </li>
                ))}
              </ol>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={idInput}
                  onChange={e => setIdInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveClientId(); if (e.key === 'Escape') setShowSetup(false); }}
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  style={{
                    flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
                    borderRadius: 2, padding: '4px 8px', color: 'var(--fg-1)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none',
                  }}
                />
                <span onClick={saveClientId}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                    cursor: 'pointer', letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                  SAVE
                </span>
              </div>
            </div>
          )}

          {/* connect button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 0' }}>
            {isExpired && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                Session expired — please reconnect
              </div>
            )}
            <button
              onClick={connect}
              disabled={status === 'connecting'}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
                borderRadius: 4, padding: '9px 18px', cursor: status === 'connecting' ? 'default' : 'pointer',
                color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => { if (status !== 'connecting') e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
            >
              <Icon name="calendar-days" size={15} />
              {status === 'connecting' ? 'Connecting…' : 'Connect Google Calendar'}
            </button>

            <span
              onClick={() => setShowSetup(s => !s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)',
                cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
              {showSetup ? 'HIDE' : `ID: ${effectiveId.slice(0, 16)}…`}
            </span>
          </div>

          {errMsg && (
            <div style={{
              marginTop: 4, padding: '5px 8px',
              background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.35)',
              borderRadius: 3, color: 'var(--neg)', fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              ⚠ {errMsg}
            </div>
          )}

        </div>
      )}

      {/* ══ LOADING ════════════════════════════════════════ */}
      {isConnected && status === 'loading' && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
          padding: '20px 0', letterSpacing: '0.08em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          Fetching your events…
        </div>
      )}

      {/* ══ EVENTS LIST ════════════════════════════════════ */}
      {isConnected && (status === 'live' || status === 'error') && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {grouped.map((item, i) => item.type === 'header' ? (
            <div key={`h-${i}`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: item.label === 'TODAY' ? 'var(--accent)' : 'var(--fg-4)',
              padding: i === 0 ? '0 0 5px' : '10px 0 5px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              {item.label}
            </div>
          ) : (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: '4px 76px 1fr',
              alignItems: 'center', gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid var(--border)',
              opacity: isPast(item.end, item.allDay) ? 0.4 : 1,
            }}>
              {/* color bar */}
              <div style={{
                width: 3, height: '100%', minHeight: 14,
                background: evColor(item), borderRadius: 1,
                boxShadow: isHappening(item.start, item.end) ? `0 0 8px ${evColor(item)}` : 'none',
              }} />
              {/* time */}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: isHappening(item.start, item.end) ? 'var(--accent)' : 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', whiteSpace: 'nowrap',
              }}>
                {fmtStart(item.start, item.allDay)}
              </span>
              {/* name */}
              <span style={{
                fontFamily: 'var(--font-sans)', fontSize: 13,
                color: 'var(--fg-1)',
                fontWeight: isHappening(item.start, item.end) ? 500 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* no events */}
      {isConnected && status === 'live' && events.length === 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
          padding: '20px 0', letterSpacing: '0.06em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          No events in the next 7 days
        </div>
      )}

      {/* ══ ERROR ══════════════════════════════════════════ */}
      {isConnected && status === 'error' && (
        <div style={{ marginTop: events.length ? 10 : 0 }}>
          <div style={{
            padding: '6px 8px', background: 'rgba(255,77,109,0.1)',
            border: '1px solid rgba(255,77,109,0.35)', borderRadius: 3,
            color: 'var(--neg)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>
            ⚠ {errMsg}
          </div>
          <span
            onClick={() => fetchEvents(token.access_token)}
            style={{
              display: 'inline-block', marginTop: 8,
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em',
            }}>
            RETRY
          </span>
        </div>
      )}

    </Card>
  );
}

window.Calendar = Calendar;
