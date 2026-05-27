/* global React, Icon */
const { useState: useStateSidebar } = React;

const SIDEBAR_ITEMS = [
  { id: 'checklist', name: 'CHECKLIST', icon: 'list-checks' },
  { id: 'crm',       name: 'CRM',       icon: 'users' },
  { id: 'journal',   name: 'JOURNAL',   icon: 'notebook-pen' },
  { id: 'finance',   name: 'FINANCE',   icon: 'line-chart' },
  { id: 'health',    name: 'HEALTH',    icon: 'activity' },
  { id: 'goals',     name: 'GOALS',     icon: 'flag' },
  { id: 'calendar',  name: 'CALENDAR',  icon: 'calendar-days' },
  { id: 'sat',       name: 'SAT PREP',  icon: 'graduation-cap' },
];

/* Items shown in the mobile bottom tab bar (max 5 to avoid crowding) */
const MOBILE_TABS = [
  { id: 'dashboard', name: 'HOME',      icon: 'layout-dashboard' },
  { id: 'checklist', name: 'TASKS',     icon: 'list-checks' },
  { id: 'finance',   name: 'FINANCE',   icon: 'line-chart' },
  { id: 'health',    name: 'HEALTH',    icon: 'activity' },
  { id: 'settings',  name: 'SETTINGS',  icon: 'settings' },
];

function SidebarItem({ item, active, onClick }) {
  const [hover, setHover] = useStateSidebar(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, cursor: 'pointer',
        color: active ? 'var(--accent)' : (hover ? 'var(--fg-1)' : 'var(--fg-3)'),
        background: hover && !active ? 'var(--bg-2)' : 'transparent',
        transition: 'color 120ms, background 120ms',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', left: -10, top: 8, bottom: 8,
          width: 2, background: 'var(--accent)', borderRadius: 1,
        }} />
      )}
      <Icon name={item.icon} size={18} />
      {hover && (
        <div style={{
          position: 'absolute', left: 44, top: '50%', transform: 'translateY(-50%)',
          background: 'var(--bg-4)', border: '1px solid var(--border-strong)',
          borderRadius: 4, padding: '4px 8px',
          fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-1)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 100,
        }}>
          {item.name}
        </div>
      )}
    </div>
  );
}

function Sidebar({ activeId, onSelect, onHome }) {
  return (
    <>
      {/* ── Desktop sidebar ────────────────────── */}
      <nav className="sos-sidebar" style={{
        width: 56, background: 'var(--bg-0)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0', gap: 4, flexShrink: 0,
      }}>
        {/* logo mark */}
        <div
          onClick={onHome}
          title="DASHBOARD"
          style={{
            width: 32, height: 32, borderRadius: 6,
            background: activeId === 'dashboard' ? 'var(--bg-3)' : 'var(--bg-2)',
            border: '1px solid ' + (activeId === 'dashboard' ? 'var(--accent)' : 'var(--border)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14,
            color: 'var(--accent)', letterSpacing: '-0.02em',
            marginBottom: 12, position: 'relative', flexShrink: 0,
            cursor: 'pointer',
            transition: 'background 120ms, border-color 120ms',
          }}>
          S
          <div style={{
            position: 'absolute', right: 3, bottom: 3,
            width: 4, height: 4, background: 'var(--accent)', borderRadius: '50%',
            boxShadow: '0 0 6px var(--accent)',
          }} />
        </div>

        {SIDEBAR_ITEMS.map(it => (
          <SidebarItem key={it.id} item={it} active={it.id === activeId} onClick={() => onSelect(it.id)} />
        ))}

        <div style={{ flex: 1 }} />
        <SidebarItem
          item={{ id: 'settings', name: 'SETTINGS', icon: 'settings' }}
          active={activeId === 'settings'}
          onClick={() => onSelect('settings')}
        />
      </nav>

      {/* ── Mobile bottom tab bar ───────────────── */}
      <nav className="sos-bottom-nav">
        {MOBILE_TABS.map(tab => {
          const isActive = activeId === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => tab.id === 'dashboard' ? onHome() : onSelect(tab.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, flex: 1, cursor: 'pointer',
                color: isActive ? '#00D4FF' : '#3A3A45',
                transition: 'color 100ms ease',
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none',
              }}>
              <Icon name={tab.icon} size={24} />
              <span style={{
                fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                lineHeight: 1,
                color: isActive ? '#00D4FF' : '#3A3A45',
              }}>
                {tab.name}
              </span>
            </div>
          );
        })}
      </nav>
    </>
  );
}

window.Sidebar = Sidebar;
