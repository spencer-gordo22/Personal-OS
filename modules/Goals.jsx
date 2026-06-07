/* global React, Card, ProgressBar, Icon, useLocalStorage */
const { useState: useStateGoals } = React;

const GOAL_TONES = ['var(--accent)', 'var(--pos)', 'var(--warn)', '#7B9DFF', 'var(--neg)'];

const INITIAL_GOALS = [];

const baseInput = {
  background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
  padding: '2px 5px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
  fontSize: 11, outline: 'none',
};
const iStyle  = (w) => ({ ...baseInput, width: w });
const iStyleFlex = { ...baseInput, flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12 };

function Goals() {
  const [goals, setGoals]     = useLocalStorage('sos_goals_v2', INITIAL_GOALS);
  const [editMode, setEditMode] = useStateGoals(false);
  const [editing, setEditing]  = useStateGoals(null);   // index for pct inline edit
  const [editVal, setEditVal]  = useStateGoals('');
  const [newName, setNewName]  = useStateGoals('');
  const [newDue, setNewDue]    = useStateGoals('');

  /* ── pct click-to-edit (always available) ── */
  const startEdit = (i) => { setEditing(i); setEditVal(String(goals[i].pct)); };
  const commitEdit = () => {
    const num = parseInt(editVal);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setGoals(g => g.map((x, i) => i === editing ? { ...x, pct: num } : x));
    }
    setEditing(null);
  };
  const onPctKey = (e) => {
    if (e.key === 'Enter')  commitEdit();
    if (e.key === 'Escape') setEditing(null);
  };

  /* ── field edits in edit mode ── */
  const updateField = (i, field, val) =>
    setGoals(g => g.map((x, idx) => idx === i ? { ...x, [field]: val } : x));

  /* ── delete ── */
  const remove = (i) => setGoals(g => g.filter((_, idx) => idx !== i));

  /* ── add ── */
  const addGoal = () => {
    const name = newName.trim();
    if (!name) return;
    const tone = GOAL_TONES[goals.length % GOAL_TONES.length];
    setGoals(g => [...g, { name, pct: 0, due: newDue.trim() || 'EOY', tone }]);
    setNewName(''); setNewDue('');
  };

  return (
    <Card icon="flag" label="goals · 2026" meta="Q3 ACTIVE"
      action={
        <span onClick={() => setEditMode(m => !m)}
          title={editMode ? 'Done editing' : 'Edit goals'}
          style={{ cursor: 'pointer', color: editMode ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
          <Icon name={editMode ? 'check' : 'pencil'} size={13} />
        </span>
      }>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {goals.map((g, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* name row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              {editMode ? (
                <input
                  value={g.name}
                  onChange={e => updateField(i, 'name', e.target.value)}
                  style={iStyleFlex}
                />
              ) : (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-1)' }}>{g.name}</span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {editMode ? (
                  <input
                    value={g.due}
                    onChange={e => updateField(i, 'due', e.target.value)}
                    placeholder="due"
                    style={iStyle(60)}
                  />
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.due}</span>
                )}
                {editMode && (
                  <span onClick={() => remove(i)}
                    style={{ color: 'var(--neg)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Icon name="x" size={11} />
                  </span>
                )}
              </div>
            </div>

            {/* progress row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}><ProgressBar value={g.pct} color={g.tone} height={4} /></div>
              {editing === i ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onPctKey}
                  style={{
                    width: 44, background: 'var(--bg-3)', border: '1px solid var(--accent)',
                    borderRadius: 2, padding: '2px 4px', color: 'var(--fg-1)',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
                    textAlign: 'right', outline: 'none',
                  }}
                />
              ) : (
                <span
                  onClick={() => startEdit(i)}
                  title="Click to edit %"
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
                    color: g.tone, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right',
                    cursor: 'pointer',
                  }}>{g.pct}%</span>
              )}
            </div>
          </div>
        ))}

        {/* add goal row — visible in edit mode */}
        {editMode && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
            <Icon name="plus" size={11} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="goal name"
              style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-1)', padding: '2px 0' }}
            />
            <input
              value={newDue}
              onChange={e => setNewDue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="due"
              style={{ width: 50, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', padding: '2px 0' }}
            />
            <span onClick={addGoal} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}>ADD</span>
          </div>
        )}
      </div>
    </Card>
  );
}

window.Goals = Goals;
