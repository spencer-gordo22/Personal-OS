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

function TopBar({ onOpenCommand, activePage = 'Dashboard', isMobile }) {

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

  /* ── Desktop layout: full topbar ── */
  return (
    <header style={{
      height: 52, background: 'var(--bg-0)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      flexShrink: 0,
      overflow: 'hidden', minWidth: 0, maxWidth: '100vw',
    }}>

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13,
          color: 'var(--fg-1)', letterSpacing: '-0.02em', whiteSpace: 'nowrap',
        }}>
          Spencer<span style={{ color: 'var(--accent)' }}>_OS</span>
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
          letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          v 4.2.1
        </span>
      </div>

      {/* Breadcrumb */}
      <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
      <div style={{
        fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
      }}>
        <span>HOME</span>
        <Icon name="chevron-right" size={12} style={{ color: 'var(--fg-4)' }} />
        <span style={{ color: 'var(--fg-1)' }}>{activePage.toUpperCase()}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Command search */}
      <button
        onClick={onOpenCommand}
        className="sos-topbar-cmd"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 28, padding: '0 12px',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 4, color: 'var(--fg-3)',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          cursor: 'pointer', width: 280, flexShrink: 0,
        }}
      >
        <Icon name="terminal" size={13} style={{ color: 'var(--accent)' }} />
        <span>run command · jump to…</span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 10, padding: '2px 5px', border: '1px solid var(--border-strong)',
          borderRadius: 2, color: 'var(--fg-2)',
        }}>⌘ K</span>
      </button>

      {/* Status + clock */}
      <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span className="pill pos" style={{ height: 18 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--pos)' }} />
          SYNC
        </span>
        <Clock />
      </div>

      {/* Avatar */}
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-1)', fontWeight: 600,
      }}>
        SP
      </div>

    </header>
  );
}

window.TopBar = TopBar;
