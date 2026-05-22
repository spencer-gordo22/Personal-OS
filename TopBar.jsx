/* global React, Icon */
const { useState: useStateTop, useEffect: useEffectTop } = React;

function Clock() {
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
      {date}  ·  {time}
    </span>
  );
}

function TopBar({ onOpenCommand, activePage = 'Dashboard' }) {
  return (
    <header style={{
      height: 44, background: 'var(--bg-0)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

      <button
        onClick={onOpenCommand}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 28, padding: '0 12px',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 4, color: 'var(--fg-3)',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          cursor: 'pointer', minWidth: 280,
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

      <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span className="pill pos" style={{ height: 18 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--pos)' }} />
          SYNC
        </span>
        <Clock />
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-1)',
          fontWeight: 600,
        }}>
          SP
        </div>
      </div>
    </header>
  );
}

window.TopBar = TopBar;
