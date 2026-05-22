/* global React, Card, Pill, Icon, useLocalStorage */
const { useState: useStateTasks } = React;

const INITIAL_TASKS = [];

function Tasks() {
  const [tasks, setTasks] = useLocalStorage('sos_tasks_v2', INITIAL_TASKS);
  const [input, setInput] = useStateTasks('');
  const [hovering, setHovering] = useStateTasks(null);
  const open = tasks.filter(t => !t.done).length;

  const toggle = (id) => setTasks(t => t.map(x => x.id === id
    ? { ...x, done: !x.done, tag: !x.done ? 'DONE' : 'P2', tone: !x.done ? 'pos' : '' }
    : x));

  const deleteTask = (id) => setTasks(t => t.filter(x => x.id !== id));

  const addTask = () => {
    const title = input.trim();
    if (!title) return;
    setTasks(t => [...t, { id: Date.now(), title, tag: 'P2', tone: '', time: 'today', done: false }]);
    setInput('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') addTask();
  };

  return (
    <Card icon="check-square" label="tasks · today" meta={`${open} OPEN`}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tasks.map((t, i) => (
          <div key={t.id}
            onMouseEnter={() => setHovering(t.id)}
            onMouseLeave={() => setHovering(null)}
            style={{
              display: 'grid', gridTemplateColumns: '20px 1fr 70px 70px 20px',
              alignItems: 'center', gap: 8,
              padding: '0 4px', height: 32,
              borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
            }}
          >
            <span
              onClick={() => toggle(t.id)}
              style={{
                width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                border: t.done ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
                background: t.done ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              {t.done && <Icon name="check" size={10} style={{ color: '#001218' }} />}
            </span>
            <span style={{
              fontFamily: 'var(--font-sans)', fontSize: 13,
              color: t.done ? 'var(--fg-3)' : 'var(--fg-1)',
              textDecoration: t.done ? 'line-through' : 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{t.title}</span>
            <span style={{ justifySelf: 'end' }}><Pill tone={t.tone}>{t.tag}</Pill></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.time}</span>
            <span
              onClick={() => deleteTask(t.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: hovering === t.id ? 1 : 0, transition: 'opacity 100ms',
                color: 'var(--neg)', cursor: 'pointer',
              }}
            >
              <Icon name="x" size={12} />
            </span>
          </div>
        ))}
      </div>

      {/* add task input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <Icon name="plus" size={13} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="add task · press enter"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-1)',
          }}
        />
        {input.trim() && (
          <span
            onClick={addTask}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>
            ADD
          </span>
        )}
      </div>
    </Card>
  );
}

window.Tasks = Tasks;
