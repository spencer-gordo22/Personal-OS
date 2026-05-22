/* global React, Card, Icon, toISO, useLocalStorage */
const { useState: useStateHabits } = React;

const INITIAL_HABITS = [];

function Habits() {
  const today = toISO(new Date());
  const [store, setStore] = useLocalStorage('sos_habits_v2', { date: '', habits: INITIAL_HABITS });
  const [hover, setHover]       = useStateHabits(null);
  const [newHabit, setNewHabit] = useStateHabits('');

  // Reset 'done' each new day, preserve streaks
  const habits = store.date === today
    ? store.habits
    : store.habits.map(h => ({ ...h, done: false }));

  const toggle = (id) => {
    const next = habits.map(x => x.id === id
      ? { ...x, done: !x.done, streak: x.done ? Math.max(0, x.streak - 1) : x.streak + 1 }
      : x);
    setStore({ date: today, habits: next });
  };

  const remove = (id) => {
    setStore({ date: today, habits: habits.filter(x => x.id !== id) });
  };

  const addHabit = () => {
    const name = newHabit.trim();
    if (!name) return;
    const maxId = habits.reduce((m, h) => Math.max(m, h.id), 0);
    setStore({ date: today, habits: [...habits, { id: maxId + 1, name, streak: 0, done: false }] });
    setNewHabit('');
  };

  const done = habits.filter(h => h.done).length;

  return (
    <Card icon="target" label="habits" meta={`${done} / ${habits.length}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

        {habits.map(h => (
          <div key={h.id}
            onMouseEnter={() => setHover(h.id)}
            onMouseLeave={() => setHover(null)}
            style={{ display: 'grid', gridTemplateColumns: '16px 1fr 56px 16px', alignItems: 'center', gap: 8, padding: '2px 0' }}>

            {/* checkbox */}
            <span onClick={() => toggle(h.id)} style={{
              width: 14, height: 14, borderRadius: 2, flexShrink: 0,
              border: h.done ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
              background: h.done ? 'var(--accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              {h.done && <Icon name="check" size={10} style={{ color: '#001218' }} />}
            </span>

            {/* name */}
            <span onClick={() => toggle(h.id)}
              style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: h.done ? 'var(--fg-1)' : 'var(--fg-2)', cursor: 'pointer' }}>
              {h.name}
            </span>

            {/* streak */}
            <span onClick={() => toggle(h.id)} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: h.streak > 30 ? 'var(--accent)' : (h.streak > 0 ? 'var(--fg-2)' : 'var(--fg-3)'),
              textAlign: 'right', fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
            }}>
              {h.streak > 0 ? `${h.streak}d ◆` : '— · —'}
            </span>

            {/* delete — fades in on hover */}
            <span onClick={() => remove(h.id)} style={{
              color: 'var(--neg)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: hover === h.id ? 1 : 0, transition: 'opacity 120ms',
            }}>
              <Icon name="x" size={11} />
            </span>
          </div>
        ))}

        {/* add habit input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px dashed var(--border)', marginTop: 2 }}>
          <Icon name="plus" size={11} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
          <input
            value={newHabit}
            onChange={e => setNewHabit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addHabit()}
            placeholder="add habit…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border)', outline: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 12,
              color: 'var(--fg-1)', padding: '2px 0',
            }}
          />
          <span onClick={addHabit} style={{
            color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0,
          }}>ADD</span>
        </div>

      </div>
    </Card>
  );
}

window.Habits = Habits;
