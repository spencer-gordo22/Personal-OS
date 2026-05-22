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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
