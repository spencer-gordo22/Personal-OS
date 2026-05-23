/* global React, Icon */
const { useState: useStateCmd, useEffect: useEffectCmd } = React;

const COMMANDS = [
  { group: 'COMMANDS', icon: 'activity',     name: 'log workout — push day', shortcut: '⏎'   },
  { group: 'COMMANDS', icon: 'notebook-pen', name: 'log journal entry',      shortcut: '⌘ J' },
  { group: 'COMMANDS', icon: 'check-square', name: 'new task · today',       shortcut: '⌘ T' },
  { group: 'JUMP TO',  icon: 'flag',         name: 'goals · q3 2026',        shortcut: '↗'   },
  { group: 'JUMP TO',  icon: 'line-chart',   name: 'finance · ledger',       shortcut: '↗'   },
  { group: 'JUMP TO',  icon: 'apple',        name: 'nutrition · today',      shortcut: '↗'   },
];

function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useStateCmd('');
  const [sel, setSel] = useStateCmd(0);

  useEffectCmd(() => {
    if (open) { setQuery(''); setSel(0); }
  }, [open]);

  useEffectCmd(() => {
    if (!open) return;
    const filtered = COMMANDS.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  const filtered = COMMANDS.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(filtered.map(c => c.group))];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,7,11,0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: 140,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, calc(100vw - 24px))', background: 'var(--bg-4)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.10)',
          overflow: 'hidden',
        }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <Icon name="terminal" size={16} style={{ color: 'var(--accent)' }} />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setSel(0); }}
            placeholder="run command · jump to…"
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 0,
              color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 14,
            }}
          />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
            padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 2,
          }}>ESC</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: 24, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-3)', textAlign: 'center' }}>
            no matches
          </div>
        )}

        {groups.map(g => (
          <div key={g}>
            <div style={{
              fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-3)',
              padding: '10px 14px 6px',
            }}>{g}</div>
            {filtered.filter(c => c.group === g).map((c) => {
              const idx = filtered.indexOf(c);
              const active = idx === sel;
              return (
                <div
                  key={c.name}
                  onMouseEnter={() => setSel(idx)}
                  onClick={onClose}
                  style={{
                    display: 'grid', gridTemplateColumns: '18px 1fr auto',
                    alignItems: 'center', gap: 10,
                    padding: '8px 14px', cursor: 'pointer',
                    background: active ? 'var(--bg-3)' : 'transparent',
                    position: 'relative',
                  }}
                >
                  {active && <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2, background: 'var(--accent)' }} />}
                  <Icon name={c.icon} size={14} style={{ color: active ? 'var(--accent)' : 'var(--fg-2)' }} />
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-1)' }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{c.shortcut}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
