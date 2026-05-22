/* global React, Card, ProgressBar, Icon, toISO, useLocalStorage */
const { useState: useStateDC } = React;

const DOW_CHARS = ['S','M','T','W','T','F','S'];

/* one example pre-loaded as requested */
const INITIAL_STORE = {
  recurring: [
    { id: 1, name: 'SAT studying · 1 hr', freq: 'daily', days: [0,1,2,3,4,5,6] },
  ],
  daily: {},
};

/* ── streak for a single recurring item ── */
function itemStreak(id, daily) {
  let s = 0;
  const today = new Date();
  for (let i = 1; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if ((daily || {})[toISO(d)]?.checks?.[id]) s++;
    else break;
  }
  return s;
}

/* ═══════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════ */
function DailyChecklist() {
  const todayISO = toISO(new Date());
  const todayDow = new Date().getDay();          // 0=Sun

  const [store, setStore] = useLocalStorage('sos_checklist_v2', INITIAL_STORE);

  /* add-task form */
  const [newTask,  setNewTask]  = useStateDC('');

  /* add-recurring form */
  const [showRec,  setShowRec]  = useStateDC(false);
  const [recName,  setRecName]  = useStateDC('');
  const [recFreq,  setRecFreq]  = useStateDC('daily');
  const [recDays,  setRecDays]  = useStateDC([]);

  /* ── derived ── */
  const todayRecurring = (store.recurring || []).filter(r => {
    if (r.freq === 'daily')  return true;
    return (r.days || []).includes(todayDow); // weekly or custom
  });

  const todayEntry  = (store.daily || {})[todayISO] || { oneoff: [], checks: {} };
  const todayTasks  = todayEntry.oneoff  || [];
  const todayChecks = todayEntry.checks  || {};

  const totalItems = todayRecurring.length + todayTasks.length;
  const doneItems  =
    todayRecurring.filter(r => todayChecks[r.id]).length +
    todayTasks.filter(t => t.done).length;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  /* ── state helpers ── */
  const updToday = fn =>
    setStore(s => {
      const e = (s.daily || {})[todayISO] || { oneoff: [], checks: {} };
      return { ...s, daily: { ...(s.daily || {}), [todayISO]: fn(e) } };
    });

  const toggleRec  = id  => updToday(e => ({ ...e, checks: { ...e.checks, [id]: !e.checks[id] } }));
  const toggleTask = tid => updToday(e => ({ ...e, oneoff: e.oneoff.map(t => t.id === tid ? { ...t, done: !t.done } : t) }));
  const deleteTask = tid => updToday(e => ({ ...e, oneoff: e.oneoff.filter(t => t.id !== tid) }));
  const deleteRec  = id  => setStore(s => ({ ...s, recurring: (s.recurring || []).filter(r => r.id !== id) }));

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    updToday(e => ({ ...e, oneoff: [...(e.oneoff || []), { id: Date.now(), title, done: false }] }));
    setNewTask('');
  };

  const addRecurring = () => {
    const name = recName.trim();
    if (!name) return;
    const maxId = (store.recurring || []).reduce((m, r) => Math.max(m, r.id), 0);
    const days  = recFreq === 'daily' ? [0,1,2,3,4,5,6] : recDays;
    setStore(s => ({ ...s, recurring: [...(s.recurring || []), { id: maxId + 1, name, freq: recFreq, days }] }));
    setRecName(''); setRecDays([]); setShowRec(false);
  };

  const toggleRecDay = i =>
    setRecDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  /* ════════════════════════════════════ render */
  return (
    <Card icon="list-checks" label="daily checklist" meta={`${doneItems} / ${totalItems}`}>

      {/* completion bar */}
      <div style={{ marginBottom: 12 }}>
        <ProgressBar value={pct} max={100} color={pct === 100 ? 'var(--pos)' : 'var(--accent)'} height={3} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 5,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.04em',
        }}>
          <span>{pct}% complete</span>
          <span style={{ color: pct === 100 ? 'var(--pos)' : 'var(--fg-3)' }}>
            {pct === 100 ? '● all done' : `${totalItems - doneItems} remaining`}
          </span>
        </div>
      </div>

      {/* recurring section */}
      {todayRecurring.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span className="label-micro" style={{ display: 'block', color: 'var(--fg-4)', marginBottom: 5 }}>recurring</span>
          {todayRecurring.map(r => {
            const s = itemStreak(r.id, store.daily);
            return (
              <DCRow
                key={r.id}
                done={!!todayChecks[r.id]}
                label={r.name}
                badge={r.freq === 'daily' ? 'DAILY' : r.freq === 'weekly' ? 'WKLY' : 'CUSTOM'}
                streak={s}
                onToggle={() => toggleRec(r.id)}
                onDelete={() => deleteRec(r.id)}
              />
            );
          })}
        </div>
      )}

      {/* one-off tasks */}
      {todayTasks.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span className="label-micro" style={{ display: 'block', color: 'var(--fg-4)', marginBottom: 5 }}>tasks · today</span>
          {todayTasks.map(t => (
            <DCRow
              key={t.id}
              done={t.done}
              label={t.title}
              onToggle={() => toggleTask(t.id)}
              onDelete={() => deleteTask(t.id)}
            />
          ))}
        </div>
      )}

      {totalItems === 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
          letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 0 10px',
        }}>
          Nothing scheduled · add a task below
        </div>
      )}

      {/* ── add row ── */}
      <div style={{ paddingTop: 8, borderTop: '1px dashed var(--border)' }}>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: showRec ? 8 : 0 }}>
          <Icon name="plus" size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
          <input
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="add task for today…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)', outline: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-1)', padding: '2px 0',
            }}
          />
          {newTask.trim() && (
            <span onClick={addTask} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>ADD</span>
          )}
          {/* recurring toggle */}
          <span
            onClick={() => { setShowRec(s => !s); setRecName(''); setRecDays([]); setRecFreq('daily'); }}
            title="Add recurring item"
            style={{ cursor: 'pointer', color: showRec ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
            <Icon name={showRec ? 'x' : 'repeat'} size={12} />
          </span>
        </div>

        {/* add recurring form */}
        {showRec && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6 }}>
            <input
              autoFocus
              value={recName}
              onChange={e => setRecName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addRecurring(); if (e.key === 'Escape') setShowRec(false); }}
              placeholder="habit or recurring task…"
              style={{
                flex: 1, minWidth: 100,
                background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
                padding: '3px 7px', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 12, outline: 'none',
              }}
            />
            <select
              value={recFreq}
              onChange={e => { setRecFreq(e.target.value); setRecDays([]); }}
              style={{
                background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2,
                padding: '3px 5px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 10,
                outline: 'none', cursor: 'pointer',
              }}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="custom">custom days</option>
            </select>
            {(recFreq === 'weekly' || recFreq === 'custom') && (
              <div style={{ display: 'flex', gap: 2 }}>
                {DOW_CHARS.map((c, i) => (
                  <span
                    key={i}
                    onClick={() => toggleRecDay(i)}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 4px', borderRadius: 2, cursor: 'pointer',
                      background: recDays.includes(i) ? 'var(--accent)' : 'var(--bg-3)',
                      color: recDays.includes(i) ? '#001218' : 'var(--fg-3)',
                      border: `1px solid ${recDays.includes(i) ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {c}
                  </span>
                ))}
              </div>
            )}
            <span onClick={addRecurring} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em', flexShrink: 0 }}>ADD</span>
          </div>
        )}
      </div>

    </Card>
  );
}

/* ── row component ─────────────────────────────── */
function DCRow({ done, label, badge, streak, onToggle, onDelete }) {
  const [hover, setHover] = useStateDC(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto auto 18px', alignItems: 'center', gap: 7, padding: '4px 0' }}>

      {/* checkbox */}
      <span onClick={onToggle} style={{
        width: 14, height: 14, borderRadius: 2, flexShrink: 0, cursor: 'pointer',
        border: done ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
        background: done ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <Icon name="check" size={10} style={{ color: '#001218' }} />}
      </span>

      {/* label */}
      <span onClick={onToggle} style={{
        fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer',
        color: done ? 'var(--fg-3)' : 'var(--fg-1)',
        textDecoration: done ? 'line-through' : 'none',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>

      {/* freq badge */}
      {badge && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-4)',
          background: 'var(--bg-3)', padding: '1px 4px', borderRadius: 2, letterSpacing: '0.06em',
        }}>{badge}</span>
      )}

      {/* streak */}
      {streak > 0 ? (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap',
          color: streak >= 7 ? 'var(--accent)' : streak >= 3 ? 'var(--pos)' : 'var(--fg-3)',
        }}>
          {streak}d ◆
        </span>
      ) : <span />}

      {/* delete */}
      <span onClick={onDelete} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: hover ? 1 : 0, transition: 'opacity 100ms',
        color: 'var(--neg)', cursor: 'pointer',
      }}>
        <Icon name="x" size={11} />
      </span>
    </div>
  );
}

window.DailyChecklist = DailyChecklist;
