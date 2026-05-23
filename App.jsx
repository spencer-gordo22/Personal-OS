/* global React, Sidebar, TopBar, Cash, Investments, HealthPulse, DailyChecklist, Calendar, Workouts, Journal, Goals, CRM, CommandPalette, SAT, useLocalStorage, useIsMobile */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const DAYS   = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function todayStamp() {
  const d = new Date();
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()} · ${d.getFullYear()}`;
}

/* ── per-view routing config ──────────────────────────── */
const VIEWS = {
  dashboard: { label: 'Dashboard' },
  checklist: { label: 'Checklist' },
  crm:       { label: 'CRM' },
  journal:   { label: 'Journal' },
  finance:   { label: 'Finance' },
  health:    { label: 'Health' },
  goals:     { label: 'Goals' },
  calendar:  { label: 'Calendar' },
  sat:       { label: 'SAT Prep' },
  settings:  { label: 'Settings' },
};

/* ── full dashboard grid (default view) ───────────────── */
function DashboardGrid({ isMobile }) {
  return (
    <div className="sos-dashboard-grid" style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)',
      gap: 12,
      gridAutoRows: 'minmax(min-content, auto)',
    }}>
      {/* row 1 */}
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><Cash /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 5' }}><Investments /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 3' }}><HealthPulse /></div>

      {/* row 2 */}
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 8' }}><Workouts /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><DailyChecklist /></div>

      {/* row 3 */}
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><Calendar /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><Journal /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><Goals /></div>

      {/* row 4 */}
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><SAT /></div>
    </div>
  );
}

/* ── empty state for modules without a dedicated view ─── */
function EmptyState({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 200, border: '1px solid var(--border)', borderRadius: 6,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label} · no entries logged
      </span>
    </div>
  );
}

/* ── per-module focused layouts ───────────────────────── */
function ModuleView({ id, isMobile }) {
  const cols = isMobile ? '1fr' : 'repeat(12,1fr)';
  if (id === 'finance') return (
    <div className="sos-module-view" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12 }}>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 5' }}><Cash /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 7' }}><Investments /></div>
    </div>
  );
  if (id === 'health') return (
    <div className="sos-module-view" style={{ display: 'grid', gridTemplateColumns: cols, gap: 12 }}>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 4' }}><HealthPulse /></div>
      <div style={{ gridColumn: isMobile ? 'span 1' : 'span 8' }}><Workouts /></div>
    </div>
  );
  if (id === 'checklist') return <div style={{ maxWidth: isMobile ? '100%' : 560 }}><DailyChecklist /></div>;
  if (id === 'crm')       return <CRM />;
  if (id === 'journal')   return <div style={{ maxWidth: isMobile ? '100%' : 680 }}><Journal /></div>;
  if (id === 'goals')     return <div style={{ maxWidth: isMobile ? '100%' : 560 }}><Goals /></div>;
  if (id === 'calendar')  return <div style={{ maxWidth: isMobile ? '100%' : 560 }}><Calendar /></div>;
  if (id === 'sat')       return <div style={{ maxWidth: isMobile ? '100%' : 480 }}><SAT /></div>;
  if (id === 'settings')  return <Settings />;
  return null;
}

/* ── Settings view ────────────────────────────────────── */
const DEFAULT_MEMORY = `You are assisting Spencer Gordon. Use this context for all interactions.

## Identity
- Name: Spencer Gordon
- Age: 17
- Location: Englewood, CO
- Education: Graduated early from Cherry Creek High School

## Languages
- English (native)
- Mandarin Chinese (near-native fluency)

## Current Plans & Goals
- Gap year in China (upcoming)
- SAT prep — targeting 1500+, test date August 15, 2026

## Sports & Training
- BJJ — trains at Easton Denver (active, competitive)
- Hockey
- Surfing
- Skateboarding
- Lifting split: Push / Pull / Legs / Sharms

## Investments
Portfolio: QQQ, GLD, VOO, ETN

## Banking
- Chase (primary checking)

## Context
- 17 years old, highly motivated, self-directed learner
- Building a personal OS dashboard to track and optimize daily life
- Direct communication style; prefers specific, actionable advice`;

function Settings() {
  const [memory,    setMemory]    = useLocalStorage('sos_memory_prompt', DEFAULT_MEMORY);
  const [copied,    setCopied]    = useStateApp(false);
  const [editMemory, setEditMemory] = useStateApp(false);
  const [draft,     setDraft]     = useStateApp('');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(memory).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* fallback for non-HTTPS */
      const ta = document.createElement('textarea');
      ta.value = memory;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const startEdit = () => { setDraft(memory); setEditMemory(true); };
  const saveEdit  = () => { setMemory(draft); setEditMemory(false); };
  const cancelEdit = () => setEditMemory(false);

  const resetToDefault = () => {
    if (confirm('Reset memory prompt to default?')) { setMemory(DEFAULT_MEMORY); setEditMemory(false); }
  };

  return (
    <div style={{ maxWidth: 720 }}>

      {/* ── Memory Prompt ── */}
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
        overflow: 'hidden', marginBottom: 16,
      }}>
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
              AI Memory Prompt
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
              · paste into any AI chat for instant context
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {!editMemory ? (
              <>
                <span onClick={startEdit}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                  EDIT
                </span>
                <button
                  onClick={copyToClipboard}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: copied ? 'rgba(61,220,151,0.1)' : 'var(--bg-3)',
                    border: `1px solid ${copied ? 'var(--pos)' : 'var(--border-strong)'}`,
                    borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                    color: copied ? 'var(--pos)' : 'var(--accent)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                    transition: 'all 120ms',
                  }}>
                  {copied ? '✓ COPIED' : '⎘ COPY'}
                </button>
              </>
            ) : (
              <>
                <span onClick={cancelEdit}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                  CANCEL
                </span>
                <span onClick={resetToDefault}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                  RESET
                </span>
                <button onClick={saveEdit}
                  style={{
                    background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '4px 10px',
                    cursor: 'pointer', color: '#001218', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                  }}>
                  SAVE
                </button>
              </>
            )}
          </div>
        </div>

        {/* body */}
        <div style={{ padding: 12 }}>
          {editMemory ? (
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{
                width: '100%', minHeight: 320, background: 'var(--bg-1)',
                border: '1px solid var(--border-strong)', borderRadius: 4,
                padding: '10px 12px', color: 'var(--fg-1)',
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          ) : (
            <pre style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)',
              lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: 0, padding: 0,
            }}>
              {memory}
            </pre>
          )}
        </div>
      </div>

      {/* ── App Info ── */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
            System Info
          </span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Version',    'Spencer OS v4.3.0'],
            ['Backend',    'Python 3 · serve.py'],
            ['Persistence','Supabase kv_store + crm_items'],
            ['Auth',       'localStorage sos_auth_v1'],
            ['Daily Brief','python3 daily_briefing.py'],
            ['Telegram',   'python3 telegram_poll.py  (or webhook)'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{k}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span
              onClick={() => {
                localStorage.removeItem('sos_auth_v1');
                window.location.reload();
              }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--neg)', cursor: 'pointer', letterSpacing: '0.06em' }}>
              LOG OUT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── root app ─────────────────────────────────────────── */
function App() {
  const [active, setActive] = useStateApp('dashboard');
  const [cmdOpen, setCmdOpen] = useStateApp(false);
  const isMobile = useIsMobile();

  useEffectApp(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isDashboard = active === 'dashboard';
  const pageLabel   = VIEWS[active]?.label ?? active;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-1)', overflow: 'hidden' }}>
      <Sidebar
        activeId={active}
        onSelect={setActive}
        onHome={() => setActive('dashboard')}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar
          onOpenCommand={() => setCmdOpen(true)}
          activePage={pageLabel}
          isMobile={isMobile}
        />

        <main className="sos-main" style={{
          flex: 1, overflowY: 'auto',
          padding: isMobile ? 8 : 12,
          backgroundColor: 'var(--bg-1)',
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}>
          {/* page title strip */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: isMobile ? '6px 2px 12px' : '8px 4px 16px',
            flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <h1 className="sos-page-title" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
                {pageLabel}
              </h1>
              {!isMobile && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {todayStamp()}
                </span>
              )}
            </div>
          </div>

          {isDashboard
            ? <DashboardGrid isMobile={isMobile} />
            : <ModuleView id={active} isMobile={isMobile} />
          }

          {/* footer status strip */}
          {!isMobile && (
            <div style={{
              marginTop: 16, padding: '10px 4px',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              <span>spencer_os · v 4.3.0 · build d2e9f</span>
              <span style={{ display: 'flex', gap: 14 }}>
                <span>uptime · 14d 06h</span>
                <span>sync · ok</span>
                <span>latency · 12 ms</span>
                <span style={{ color: 'var(--pos)' }}>● all systems nominal</span>
              </span>
            </div>
          )}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Auth gate — shown before the dashboard if not logged in
   ══════════════════════════════════════════════════════════ */

const AUTH_LS_KEY = 'sos_auth_v1';
const CORRECT_PW  = '1994';

function AuthGate({ children }) {
  const [authed, setAuthed] = useStateApp(
    () => localStorage.getItem(AUTH_LS_KEY) === '1'
  );
  const [pw,    setPw]    = useStateApp('');
  const [error, setError] = useStateApp(false);
  const [shake, setShake] = useStateApp(false);

  /* inject shake keyframe once */
  useEffectApp(() => {
    if (document.getElementById('sos-auth-kf')) return;
    const s = document.createElement('style');
    s.id = 'sos-auth-kf';
    s.textContent = [
      '@keyframes sos-shake{',
      '0%,100%{transform:translateX(0)}',
      '18%,54%{transform:translateX(-9px)}',
      '36%,72%{transform:translateX(9px)}',
      '}',
    ].join('');
    document.head.appendChild(s);
  }, []);

  if (authed) return children;

  const submit = () => {
    if (pw === CORRECT_PW) {
      localStorage.setItem(AUTH_LS_KEY, '1');
      setAuthed(true);
    } else {
      setError(true);
      setPw('');
      setShake(true);
      setTimeout(() => setShake(false), 420);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 0,
    }}>

      {/* logo mark */}
      <div style={{ marginBottom: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--bg-2)',
          border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 20, color: 'var(--accent)', letterSpacing: '-0.02em' }}>S</span>
          <div style={{
            position: 'absolute', right: 5, bottom: 5,
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--accent)', boxShadow: '0 0 7px var(--accent)',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--fg-4)', letterSpacing: '0.35em',
          textTransform: 'uppercase',
        }}>SPENCER OS</span>
      </div>

      {/* form */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10, width: 260,
        animation: shake ? 'sos-shake 0.42s ease' : 'none',
      }}>
        <input
          type="password"
          value={pw}
          autoFocus
          placeholder="password"
          onChange={e => { setPw(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{
            background: 'var(--bg-2)',
            border: `1px solid ${error ? 'var(--neg)' : 'var(--border-strong)'}`,
            borderRadius: 4, padding: '10px 14px',
            color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
            fontSize: 15, letterSpacing: '0.18em', textAlign: 'center',
            outline: 'none', transition: 'border-color 120ms',
            width: '100%', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={submit}
          style={{
            background: 'transparent',
            border: '1px solid var(--accent)',
            borderRadius: 4, padding: '9px 0',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'background 120ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          ENTER
        </button>

        {error && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--neg)', letterSpacing: '0.1em',
            textAlign: 'center', textTransform: 'uppercase',
          }}>
            incorrect password
          </span>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthGate><App /></AuthGate>);
