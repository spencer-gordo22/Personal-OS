/* global React, Card, Icon, useLocalStorage */
const { useState: useStateCal, useEffect: useEffectCal } = React;

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

/* ════════════════════════════════════════════════
   Main component — server-side OAuth flow
   ════════════════════════════════════════════════ */
function Calendar() {
  /* ── persistent cache ── */
  const [events, setEvents] = useLocalStorage('sos_gcal_events', []);

  /* ── transient state ── */
  const [connected,  setConnected]  = useStateCal(false);
  const [status,     setStatus]     = useStateCal('checking');  // checking|idle|loading|live|error
  const [errMsg,     setErrMsg]     = useStateCal('');
  const [showSteps,  setShowSteps]  = useStateCal(false);
  const [indicator,  setIndicator]  = useStateCal('gray');      // green|yellow|red|gray

  /* ── on mount: check server-side connection status ── */
  useEffectCal(() => {
    (async () => {
      try {
        const r = await fetch('/google/status');
        const d = await r.json();
        if (d.connected) {
          setConnected(true);
          setIndicator('green');
          fetchEvents();
        } else {
          setConnected(false);
          setStatus('idle');
          setIndicator('gray');
        }
      } catch (_) {
        setConnected(false);
        setStatus('idle');
        setIndicator('gray');
      }
    })();
  }, []);

  /* ── fetch events via server proxy ── */
  async function fetchEvents() {
    setStatus('loading');
    setErrMsg('');
    setIndicator('yellow');
    try {
      const now  = new Date().toISOString();
      const maxT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const params = new URLSearchParams({
        timeMin: now, timeMax: maxT, maxResults: '25',
      });
      const r = await fetch(`/google/events?${params}`);
      if (r.status === 401) {
        // Server says not connected (refresh token invalid)
        setConnected(false);
        setStatus('idle');
        setIndicator('red');
        setErrMsg('Session expired — please reconnect');
        return;
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const data   = await r.json();
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
      setIndicator('green');
    } catch (e) {
      setErrMsg(e.message);
      setStatus('error');
      setIndicator('red');
    }
  }

  /* ── connect: redirect to server-side Google OAuth ── */
  function connect() {
    window.location.href = '/google/auth';
  }

  /* ── disconnect ── */
  async function disconnect() {
    try {
      await fetch('/google/disconnect', { method: 'POST' });
    } catch (_) {}
    setConnected(false);
    setEvents([]);
    setStatus('idle');
    setErrMsg('');
    setIndicator('gray');
  }

  /* ── group events by day ── */
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
    checking: 'CHECKING…',
    idle:     todayMetaStr(),
    loading:  'LOADING…',
    live:     todayMetaStr(),
    error:    todayMetaStr(),
  }[status] ?? todayMetaStr();

  /* ── indicator color ── */
  const dotColor = {
    green:  'var(--pos)',
    yellow: 'var(--warn)',
    red:    'var(--neg)',
    gray:   'var(--fg-4)',
  }[indicator] ?? 'var(--fg-4)';

  const dotGlow = indicator === 'green' ? '0 0 6px var(--pos)' : 'none';

  /* ════════════════════════════════ render */
  return (
    <Card icon="calendar-days" label="calendar · today" meta={metaTxt}
      action={
        connected ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* status dot */}
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: dotColor,
              boxShadow: dotGlow,
              display: 'inline-block', transition: 'background 400ms',
            }} />
            <span onClick={fetchEvents} title="Refresh events"
              style={{ cursor: 'pointer', color: 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
              <Icon name="refresh-cw" size={12} />
            </span>
            <span onClick={disconnect} title="Disconnect Google Calendar"
              style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex', alignItems: 'center' }}>
              <Icon name="unplug" size={12} />
            </span>
          </div>
        ) : null
      }>

      {/* ══ CHECKING / NOT CONNECTED ═══════════════════════════════════════ */}
      {!connected && status !== 'checking' && (
        <div>

          {/* ── reconnect error (refresh token revoked) ── */}
          {indicator === 'red' && errMsg && (
            <div style={{
              marginBottom: 10, padding: '8px 10px',
              background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.35)',
              borderRadius: 3, color: 'var(--neg)',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}>
              ⚠ {errMsg}
            </div>
          )}

          {/* ── connect button ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 8px' }}>
            <button
              onClick={connect}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
                borderRadius: 4, padding: '9px 18px',
                cursor: 'pointer',
                color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
            >
              <Icon name="calendar-days" size={15} />
              Connect Google Calendar
            </button>

            <span
              onClick={() => setShowSteps(s => !s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)',
                cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
              {showSteps ? 'HIDE SETUP STEPS' : 'SHOW SETUP STEPS'}
            </span>
          </div>

          {/* ── setup steps ── */}
          {showSteps && (
            <div style={{
              marginTop: 4, marginBottom: 10, padding: '10px 12px',
              background: 'var(--bg-0)', border: '1px solid var(--border)',
              borderRadius: 4,
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)',
                letterSpacing: '0.1em', marginBottom: 8,
              }}>
                ONE-TIME SERVER SETUP
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  <>Go to <span style={{ color: 'var(--accent)' }}>console.cloud.google.com</span> → your project</>,
                  <>APIs & Services → Library → enable <strong>Google Calendar API</strong></>,
                  <>Credentials → your OAuth 2.0 Client ID → Edit</>,
                  <>Under <strong>Authorized redirect URIs</strong> add:<br/>
                    <code style={{ color: 'var(--accent)', fontSize: 10 }}>https://spencer-os.fly.dev/google/callback</code></>,
                  <>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></>,
                  <><code style={{ fontSize: 9, background: 'var(--bg-3)', padding: '2px 5px', borderRadius: 2, color: 'var(--fg-1)' }}>
                    flyctl secrets set GOOGLE_CLIENT_ID="…" GOOGLE_CLIENT_SECRET="…"
                  </code></>,
                  <>Redeploy, then click <strong>Connect Google Calendar</strong> above</>,
                ].map((step, i) => (
                  <li key={i} style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.55 }}>
                    {step}
                  </li>
                ))}
              </ol>
              <div style={{
                marginTop: 10, padding: '6px 8px',
                background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)',
                borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)',
                lineHeight: 1.5,
              }}>
                ✓ Tokens are stored server-side in Supabase and auto-refresh silently — you only connect once.
              </div>
            </div>
          )}

        </div>
      )}

      {/* ══ CHECKING ═══════════════════════════════════════════════════════ */}
      {status === 'checking' && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
          padding: '20px 0', letterSpacing: '0.08em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          Checking connection…
        </div>
      )}

      {/* ══ LOADING ════════════════════════════════════════════════════════ */}
      {connected && status === 'loading' && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
          padding: '20px 0', letterSpacing: '0.08em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          Fetching your events…
        </div>
      )}

      {/* ══ EVENTS LIST ════════════════════════════════════════════════════ */}
      {connected && (status === 'live' || status === 'error') && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {grouped.map((item, i) => item.type === 'header' ? (
            <div key={`h-${i}`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
              color: item.label === 'TODAY' ? 'var(--accent)' : 'var(--fg-4)',
              padding: i === 0 ? '0 0 5px' : '10px 0 5px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              {item.label}
            </div>
          ) : (
            <div key={item.id} style={{
              display: 'grid', gridTemplateColumns: '4px 76px 1fr',
              alignItems: 'center', gap: 10, padding: '7px 0',
              borderBottom: '1px solid var(--border)',
              opacity: isPast(item.end, item.allDay) ? 0.4 : 1,
            }}>
              <div style={{
                width: 3, height: '100%', minHeight: 14,
                background: evColor(item), borderRadius: 1,
                boxShadow: isHappening(item.start, item.end) ? `0 0 8px ${evColor(item)}` : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: isHappening(item.start, item.end) ? 'var(--accent)' : 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', whiteSpace: 'nowrap',
              }}>
                {fmtStart(item.start, item.allDay)}
              </span>
              <span style={{
                fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-1)',
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
      {connected && status === 'live' && events.length === 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
          padding: '20px 0', letterSpacing: '0.06em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          No events in the next 7 days
        </div>
      )}

      {/* ══ ERROR ══════════════════════════════════════════════════════════ */}
      {connected && status === 'error' && (
        <div style={{ marginTop: events.length ? 10 : 0 }}>
          <div style={{
            padding: '6px 8px', background: 'rgba(255,77,109,0.1)',
            border: '1px solid rgba(255,77,109,0.35)', borderRadius: 3,
            color: 'var(--neg)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>
            ⚠ {errMsg}
          </div>
          <span
            onClick={fetchEvents}
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
