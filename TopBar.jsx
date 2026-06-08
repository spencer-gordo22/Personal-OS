/* global React, Icon */
const { useState: useStateTop, useEffect: useEffectTop } = React;

function Clock({ timeOnly = false }) {
  const [now, setNow] = useStateTop(new Date());
  useEffectTop(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()} · ${pad(now.getMonth() + 1)} · ${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)',
      letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
    }}>
      {timeOnly ? time : `${date}  ·  ${time}`}
    </span>
  );
}

/* Desktop top-nav items (center). Home → dashboard, Tasks → checklist. */
const TOPNAV_ITEMS = [
  { id: 'dashboard', label: 'Home' },
  { id: 'checklist', label: 'Tasks' },
  { id: 'finance',   label: 'Finance' },
  { id: 'health',    label: 'Health' },
  { id: 'settings',  label: 'Settings' },
];

/* Height of the fixed desktop top nav — keep in sync with .sos-main padding-top */
const DESKTOP_NAV_H = 48;

function TopBar({ onOpenCommand, activePage = 'Dashboard', isMobile, activeId, onSelect, onHome }) {

  /* ── Mobile layout: fixed top bar, logo left, time right ── */
  if (isMobile) {
    return (
      <header style={{
        /* Fixed so the bar stays pinned and the background
           fills flush behind the iPhone status bar / Dynamic Island */
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 600,
        background: 'var(--bg-0)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column',
        margin: 0,
      }}>
        {/* ── Safe-area spacer ──────────────────────────────────
            Fills the notch / Dynamic Island zone with the app
            background colour. Collapses to 0px everywhere else. */}
        <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

        {/* ── 52px content row ─────────────────────────────── */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center',
          padding: '0 20px', flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
            color: 'var(--fg-1)', letterSpacing: '-0.02em', whiteSpace: 'nowrap',
          }}>
            Spencer<span style={{ color: 'var(--accent)' }}>_OS</span>
          </span>
          <div style={{ flex: 1 }} />
          {/* Time only — no date */}
          <Clock timeOnly />
        </div>
      </header>
    );
  }

  /* ── Desktop layout: fixed full-width TOP NAV ──
     logo left · nav items centered · time+date right */
  const go = (id) => (id === 'dashboard' ? (onHome ? onHome() : onSelect && onSelect('dashboard')) : onSelect && onSelect(id));

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 600,
      height: DESKTOP_NAV_H,
      background: '#0A0A0F',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
    }}>

      {/* Left: brand */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <span
          onClick={() => go('dashboard')}
          style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14,
            color: 'var(--fg-1)', letterSpacing: '-0.02em', whiteSpace: 'nowrap', cursor: 'pointer',
          }}>
          Spencer<span style={{ color: 'var(--accent)' }}>_OS</span>
        </span>
      </div>

      {/* Center: nav items */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {TOPNAV_ITEMS.map(it => {
          const active = it.id === 'dashboard'
            ? (activeId === 'dashboard')
            : (activeId === it.id);
          return (
            <span
              key={it.id}
              onClick={() => go(it.id)}
              className="sos-tap"
              style={{
                fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '6px 12px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
                color: active ? 'var(--accent)' : 'var(--fg-3)',
                background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg-1)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--fg-3)'; }}
            >
              {it.label}
            </span>
          );
        })}
      </nav>

      {/* Right: command shortcut + clock */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minWidth: 0 }}>
        <span
          onClick={onOpenCommand}
          title="Command palette (⌘K)"
          className="sos-tap"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            color: 'var(--fg-3)', flexShrink: 0,
          }}>
          <Icon name="terminal" size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, border: '1px solid var(--border-strong)', borderRadius: 2, padding: '1px 4px' }}>⌘K</span>
        </span>
        <Clock />
      </div>

    </header>
  );
}

window.TopBar = TopBar;
