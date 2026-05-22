/* global React, Sidebar, TopBar, Cash, Investments, HealthPulse, DailyChecklist, Calendar, Workouts, Journal, Goals, CRM, CommandPalette */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
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
};

/* ── full dashboard grid (default view) ───────────────── */
function DashboardGrid() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: 12,
      gridAutoRows: 'minmax(min-content, auto)',
    }}>
      {/* row 1 */}
      <div style={{ gridColumn: 'span 4' }}><Cash /></div>
      <div style={{ gridColumn: 'span 5' }}><Investments /></div>
      <div style={{ gridColumn: 'span 3' }}><HealthPulse /></div>

      {/* row 2 */}
      <div style={{ gridColumn: 'span 8' }}><Workouts /></div>
      <div style={{ gridColumn: 'span 4' }}><DailyChecklist /></div>

      {/* row 3 */}
      <div style={{ gridColumn: 'span 4' }}><Calendar /></div>
      <div style={{ gridColumn: 'span 4' }}><Journal /></div>
      <div style={{ gridColumn: 'span 4' }}><Goals /></div>
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
function ModuleView({ id }) {
  if (id === 'finance') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 12 }}>
      <div style={{ gridColumn: 'span 5' }}><Cash /></div>
      <div style={{ gridColumn: 'span 7' }}><Investments /></div>
    </div>
  );
  if (id === 'health') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 12 }}>
      <div style={{ gridColumn: 'span 4' }}><HealthPulse /></div>
      <div style={{ gridColumn: 'span 8' }}><Workouts /></div>
    </div>
  );
  if (id === 'checklist') return <div style={{ maxWidth: 560 }}><DailyChecklist /></div>;
  if (id === 'crm')       return <CRM />;
  if (id === 'journal')   return <div style={{ maxWidth: 680 }}><Journal /></div>;
  if (id === 'goals')     return <div style={{ maxWidth: 560 }}><Goals /></div>;
  if (id === 'calendar')  return <div style={{ maxWidth: 560 }}><Calendar /></div>;
  return null;
}

/* ── root app ─────────────────────────────────────────── */
function App() {
  const [active, setActive] = useStateApp('dashboard');
  const [cmdOpen, setCmdOpen] = useStateApp(false);

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
  const pageLabel = VIEWS[active]?.label ?? active;

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
        />

        <main style={{
          flex: 1, overflowY: 'auto',
          padding: 12,
          backgroundColor: 'var(--bg-1)',
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}>
          {/* page title strip */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '8px 4px 16px', flexWrap: 'wrap', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
                {pageLabel}
              </h1>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {todayStamp()}
              </span>
            </div>
          </div>

          {isDashboard ? <DashboardGrid /> : <ModuleView id={active} />}

          {/* footer status strip */}
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
