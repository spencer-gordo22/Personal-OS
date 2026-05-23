/* global React, Card, Icon */
const { useState: useStateCRM, useEffect: useEffectCRM, useCallback: useCallbackCRM } = React;

const TYPE_META = {
  task:      { label: 'TASK',      color: 'var(--accent)',  icon: 'check-square' },
  note:      { label: 'NOTE',      color: 'var(--fg-3)',    icon: 'file-text'    },
  contact:   { label: 'CONTACT',   color: '#7B9DFF',        icon: 'user'         },
  meeting:   { label: 'MEETING',   color: 'var(--pos)',     icon: 'calendar'     },
  follow_up: { label: 'FOLLOW UP', color: 'var(--warn)',    icon: 'refresh-cw'   },
  deal:      { label: 'DEAL',      color: '#C084FC',        icon: 'briefcase'    },
  reminder:  { label: 'REMINDER',  color: 'var(--neg)',     icon: 'bell'         },
};

const PRIORITY_COLOR = { high: 'var(--neg)', medium: 'var(--warn)', low: 'var(--fg-4)' };

const SOURCE_ICON = {
  telegram_voice: '🎙',
  telegram_text:  '💬',
  manual:         '✏️',
};

const FILTERS = ['all', 'task', 'follow_up', 'meeting', 'deal', 'note', 'reminder', 'contact'];

function CRM() {
  const [items,      setItems]      = useStateCRM([]);
  const [loading,    setLoading]    = useStateCRM(true);
  const [error,      setError]      = useStateCRM('');
  const [filter,     setFilter]     = useStateCRM('all');
  const [showClosed, setShowClosed] = useStateCRM(false);

  /* ── Format a Supabase error into a readable string ── */
  function fmtErr(err) {
    if (!err) return 'Unknown error';
    const parts = [];
    if (err.message) parts.push(err.message);
    if (err.code)    parts.push(`code=${err.code}`);
    if (err.hint)    parts.push(`hint: ${err.hint}`);
    if (err.details) parts.push(`details: ${err.details}`);
    return parts.join(' · ') || String(err);
  }

  const loadItems = useCallbackCRM(async () => {
    setLoading(true);
    setError('');

    /* Always await _supaReady — never read window._supa directly.
       On a cold Fly.io start, /api/config may not have returned yet
       when this effect fires, so window._supa is still undefined.
       Awaiting _supaReady guarantees the client is fully initialised. */
    const db = await (window._supaReady || Promise.resolve(window._supa || null));

    if (!db) {
      setError('Supabase not connected — check that SUPA_URL and SUPA_KEY are set on Fly.io (flyctl secrets list)');
      setLoading(false);
      return;
    }

    const { data, error: err } = await db
      .from('crm_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (err) {
      setError(fmtErr(err));
      console.error('[CRM] Supabase query error:', err);
    } else {
      setItems(data || []);
      setError('');
    }
    setLoading(false);
  }, []);

  useEffectCRM(() => { loadItems(); }, [loadItems]);

  const toggleStatus = async (id, current) => {
    const next = current === 'open' ? 'closed' : 'open';
    setItems(prev => prev.map(it => it.id === id ? { ...it, status: next } : it));
    const db = window._supa;
    if (db) {
      await db.from('crm_items').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id);
    }
  };

  const deleteItem = async (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
    const db = window._supa;
    if (db) await db.from('crm_items').delete().eq('id', id);
  };

  const displayed = items.filter(it => {
    if (!showClosed && it.status === 'closed') return false;
    if (filter !== 'all' && it.type !== filter) return false;
    return true;
  });

  const openCount   = items.filter(it => it.status === 'open').length;
  const closedCount = items.filter(it => it.status === 'closed').length;

  return (
    <Card icon="users" label="crm"
      meta={`${openCount} open`}
      action={
        <span onClick={loadItems} title="Refresh" style={{ cursor:'pointer', color:'var(--fg-3)', display:'flex', alignItems:'center' }}>
          <Icon name="refresh-cw" size={13} />
        </span>
      }>

      {/* ── filter strip ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTERS.map(f => (
          <span
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase',
              background: filter === f ? 'var(--accent)' : 'var(--bg-3)',
              color:      filter === f ? '#001218'       : 'var(--fg-3)',
              border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            {f === 'all' ? `ALL (${openCount})` : f.replace('_', ' ')}
          </span>
        ))}
        {closedCount > 0 && (
          <span
            onClick={() => setShowClosed(s => !s)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 2, cursor: 'pointer',
              color: showClosed ? 'var(--pos)' : 'var(--fg-4)',
              border: `1px solid ${showClosed ? 'var(--pos)' : 'var(--border)'}`,
            }}>
            {showClosed ? `HIDE CLOSED` : `+ ${closedCount} CLOSED`}
          </span>
        )}
      </div>

      {/* ── body ── */}
      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', padding: '8px 0' }}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--neg)', padding: '8px 0' }}>
          {error}
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', padding: '8px 0', letterSpacing: '0.06em' }}>
          No items{filter !== 'all' ? ` of type "${filter}"` : ''} · send a voice note or text to your Telegram bot
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {displayed.map(item => (
          <CRMRow
            key={item.id}
            item={item}
            onToggle={() => toggleStatus(item.id, item.status)}
            onDelete={() => deleteItem(item.id)}
          />
        ))}
      </div>
    </Card>
  );
}

/* ── single row ── */
function CRMRow({ item, onToggle, onDelete }) {
  const [hover,    setHover]    = useStateCRM(false);
  const [expanded, setExpanded] = useStateCRM(false);

  const meta   = TYPE_META[item.type] || TYPE_META.task;
  const closed = item.status === 'closed';
  const src    = SOURCE_ICON[item.source] || '✏️';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--bg-2)' : 'transparent',
        borderRadius: 3, padding: '5px 4px',
        opacity: closed ? 0.5 : 1, transition: 'opacity 120ms, background 80ms',
      }}>

      <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto auto auto 18px', alignItems: 'center', gap: 6 }}>

        {/* done toggle */}
        <span onClick={onToggle} style={{
          width: 13, height: 13, borderRadius: 2, cursor: 'pointer', flexShrink: 0,
          border: closed ? `1px solid ${meta.color}` : '1px solid var(--border-strong)',
          background: closed ? meta.color : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {closed && <Icon name="check" size={9} style={{ color: '#001218' }} />}
        </span>

        {/* title */}
        <span
          onClick={() => setExpanded(e => !e)}
          style={{
            fontFamily: 'var(--font-sans)', fontSize: 12, cursor: 'pointer',
            color: closed ? 'var(--fg-4)' : 'var(--fg-1)',
            textDecoration: closed ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap',
          }}>
          {item.title}
        </span>

        {/* type badge */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 7, padding: '1px 4px', borderRadius: 2,
          color: meta.color, border: `1px solid ${meta.color}40`, letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}>{meta.label}</span>

        {/* priority dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: PRIORITY_COLOR[item.priority] || 'var(--fg-4)',
        }} title={item.priority} />

        {/* source */}
        <span style={{ fontSize: 11 }} title={item.source}>{src}</span>

        {/* delete */}
        <span onClick={onDelete} style={{
          opacity: hover ? 1 : 0, transition: 'opacity 100ms',
          color: 'var(--neg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="x" size={11} />
        </span>
      </div>

      {/* expanded body */}
      {expanded && (
        <div style={{ marginTop: 4, marginLeft: 22, paddingBottom: 2 }}>
          {item.body && (
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.5, marginBottom: 4 }}>
              {item.body}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {item.due_date && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn)' }}>
                📅 {item.due_date}
              </span>
            )}
            {item.contact_name && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#7B9DFF' }}>
                👤 {item.contact_name}
              </span>
            )}
            {(item.tags || []).map(t => (
              <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'var(--bg-3)', color: 'var(--fg-3)', border: '1px solid var(--border)' }}>
                {t}
              </span>
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-4)' }}>
              {new Date(item.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

window.CRM = CRM;
