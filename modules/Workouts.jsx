/* global React, ReactDOM, Card, Icon, toISO, useLocalStorage */
const { useState: useStateWkt } = React;

const WORKOUT_TYPES = ['PUSH', 'PULL', 'LEGS', 'SHARMS', 'REST'];

const TYPE_COLOR = {
  PUSH:   'var(--accent)',
  PULL:   '#7B9DFF',
  LEGS:   'var(--warn)',
  SHARMS: 'var(--pos)',
  REST:   'var(--fg-3)',
};

const DEFAULT_SCHEDULE = ['PUSH', 'PULL', 'LEGS', 'SHARMS', 'REST', 'PUSH', 'PULL'];
const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Labels derived from JS getDay() value — never from a positional array.
const JS_DAY_NAME = ['SUN','MON','TUE','WED','THU','FRI','SAT']; // index = getDay()

/* Recomputed fresh every render.
   Label is derived FROM the Date object itself so it can never mismatch the date. */
function getWeekDays() {
  const today    = new Date();
  const todayISO = toISO(today);
  const y  = today.getFullYear();
  const m  = today.getMonth();
  const d  = today.getDate();

  // getDay(): 0=Sun … 6=Sat.  Convert to distance from Monday (Mon=0 … Sun=6).
  const dow            = today.getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt  = new Date(y, m, d - daysSinceMonday + i); // handles month rollover
    const iso = toISO(dt);
    days.push({
      day:     JS_DAY_NAME[dt.getDay()], // ← derived FROM the date, never from a fixed array index
      date:    dt.getDate(),
      month:   dt.getMonth(),
      iso,
      isToday: iso === todayISO,
      defType: DEFAULT_SCHEDULE[i],      // schedule slot 0=Mon … 6=Sun
    });
  }
  return days;
}

/* streak: count consecutive done days going backward from yesterday */
function calcStreak(historyMap, key = 'done') {
  let s = 0;
  const today = new Date();
  for (let i = 1; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const entry = (historyMap || {})[toISO(d)];
    if (entry && entry[key]) s++;
    else break;
  }
  return s;
}

function Workouts() {
  const week      = getWeekDays();   // fresh every render
  const todayISO  = toISO(new Date());
  const weekStart = week[0], weekEnd = week[6];
  const wkLabel   = `${MONTH_ABBR[weekStart.month]} ${weekStart.date} → ${weekEnd.date}`;

  /* ── workout history ── */
  const [workouts, setWorkouts] = useLocalStorage('sos_workouts_v4', () => {
    const init = {};
    week.forEach(d => { init[d.iso] = { type: d.defType, done: false }; });
    return init;
  });

  /* ── BJJ history ── */
  const [bjj, setBjj] = useLocalStorage('sos_bjj', {});

  /* ── Hevy manual log ── */
  const [hevySessions, setHevySessions] = useLocalStorage('sos_hevy_sessions', []);
  const [showHevy,   setShowHevy]   = useStateWkt(false);
  const [hevyDate,   setHevyDate]   = useStateWkt(todayISO);
  const [hevyType,   setHevyType]   = useStateWkt('PUSH');
  const [hevyNotes,  setHevyNotes]  = useStateWkt('');

  /* ── workout type picker ── */
  const [picking,  setPicking]  = useStateWkt(null);
  const [pickPos,  setPickPos]  = useStateWkt(null);

  /* ── derived ── */
  const todayWkt    = workouts[todayISO] || { type: 'PUSH', done: false };
  const wktDone     = week.filter(d => workouts[d.iso] && workouts[d.iso].done).length;
  const bjjDone     = week.filter(d => bjj[d.iso] && bjj[d.iso].done).length;
  const wktStreak   = calcStreak(workouts, 'done');
  const bjjStreak   = calcStreak(bjj, 'done');

  /* ── handlers ── */
  const openPick = (iso, e) => {
    if (picking === iso) { setPicking(null); setPickPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPickPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    setPicking(iso);
  };

  const setType = (iso, type) => {
    setWorkouts(w => ({ ...w, [iso]: { ...(w[iso] || {}), type } }));
    setPicking(null); setPickPos(null);
  };

  const toggleWktDone = (iso) =>
    setWorkouts(w => ({ ...w, [iso]: { ...(w[iso] || {}), done: !(w[iso] && w[iso].done) } }));

  const toggleBjj = (iso) =>
    setBjj(b => ({ ...b, [iso]: { done: !(b[iso] && b[iso].done) } }));

  const addHevySession = () => {
    if (!hevyNotes.trim() && !hevyDate) return;
    setHevySessions(s => [
      { id: Date.now(), date: hevyDate, type: hevyType, notes: hevyNotes.trim() },
      ...s,
    ]);
    setHevyNotes(''); setShowHevy(false);
  };

  const deleteHevySession = (id) =>
    setHevySessions(s => s.filter(x => x.id !== id));

  /* ════════════════════════════════════ render */
  return (
    <Card icon="dumbbell" label="workouts · week" meta={wkLabel}
      action={
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
          {wktDone}/7 ✓
        </span>
      }>

      {/* ── workout week strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 10 }}>
        {week.map(d => {
          const wkt = workouts[d.iso] || { type: d.defType, done: false };
          const typeColor = TYPE_COLOR[wkt.type] || 'var(--fg-3)';
          return (
            <div key={d.iso} style={{ position: 'relative' }}>
              <div
                onClick={(e) => openPick(d.iso, e)}
                style={{
                  background: d.isToday ? 'var(--bg-3)' : 'var(--bg-1)',
                  border: '1px solid ' + (d.isToday ? 'var(--accent)' : picking === d.iso ? 'var(--border-strong)' : 'var(--border)'),
                  borderRadius: 4, padding: '8px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer',
                  boxShadow: d.isToday ? 'inset 0 0 0 1px rgba(0,212,255,0.30)' : 'none',
                  opacity: wkt.done && !d.isToday ? 0.6 : 1,
                  transition: 'border-color 120ms, opacity 120ms',
                  userSelect: 'none',
                }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: d.isToday ? 'var(--accent)' : 'var(--fg-3)', letterSpacing: '0.08em' }}>{d.day}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500, color: d.isToday ? 'var(--fg-1)' : 'var(--fg-2)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
                  padding: '2px 4px', borderRadius: 1,
                  color: typeColor, border: `1px solid ${typeColor}40`, letterSpacing: '0.04em',
                }}>{wkt.type}</span>
                {/* done dot */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleWktDone(d.iso); }}
                  title={wkt.done ? 'Mark incomplete' : 'Mark done'}
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: wkt.done ? 'var(--pos)' : (d.isToday ? 'var(--accent)' : 'var(--bg-3)'),
                    border: !wkt.done && !d.isToday ? '1px solid var(--border-strong)' : 'none',
                    marginTop: 2, cursor: 'pointer', transition: 'background 120ms',
                  }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── BJJ strip ── */}
      <div style={{ marginBottom: 10 }}>
        <span className="label-micro" style={{ display: 'block', color: 'var(--fg-4)', marginBottom: 5, letterSpacing: '0.08em' }}>
          BJJ / COMBAT · {bjjDone}/7 this week{bjjStreak > 0 ? ` · ${bjjStreak}d streak` : ''}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {week.map(d => {
            const went = bjj[d.iso] && bjj[d.iso].done;
            return (
              <div
                key={d.iso}
                onClick={() => toggleBjj(d.iso)}
                title={went ? 'Mark absent' : 'Mark attended'}
                style={{
                  background: went ? 'rgba(255,181,71,0.15)' : 'var(--bg-1)',
                  border: `1px solid ${went ? 'var(--warn)' : d.isToday ? 'var(--border-strong)' : 'var(--border)'}`,
                  borderRadius: 4, padding: '6px 4px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  cursor: 'pointer', userSelect: 'none', transition: 'background 120ms, border-color 120ms',
                }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: d.isToday ? 'var(--accent)' : 'var(--fg-4)', letterSpacing: '0.06em' }}>{d.day}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: went ? 'var(--warn)' : 'var(--fg-3)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
                <span style={{ fontSize: 10, lineHeight: 1 }}>{went ? '🥋' : '·'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)', marginBottom: 10 }}>
        <WktStat label="wkt this wk"  value={`${wktDone} / 7`}         tone="pos"    />
        <WktStat label="bjj this wk"  value={`${bjjDone} / 7`}         tone="warn"   />
        <WktStat label="wkt streak"   value={wktStreak > 0 ? `${wktStreak}d` : '—'} tone={wktStreak >= 7 ? 'accent' : wktStreak >= 3 ? 'pos' : null} />
        <WktStat label="bjj streak"   value={bjjStreak > 0 ? `${bjjStreak}d` : '—'} tone={bjjStreak >= 7 ? 'accent' : bjjStreak >= 3 ? 'warn' : null} />
      </div>

      {/* ── Hevy manual log ── */}
      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="label-micro" style={{ color: 'var(--fg-4)' }}>session log · hevy</span>
          <span
            onClick={() => setShowHevy(s => !s)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: showHevy ? 'var(--accent)' : 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
            {showHevy ? '✕ CANCEL' : '+ ADD'}
          </span>
        </div>

        {showHevy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, padding: '8px', background: 'var(--bg-1)', borderRadius: 4, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="date"
                value={hevyDate}
                onChange={e => setHevyDate(e.target.value)}
                style={{
                  flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2,
                  padding: '3px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
                  colorScheme: 'dark',
                }}
              />
              <select
                value={hevyType}
                onChange={e => setHevyType(e.target.value)}
                style={{
                  background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2,
                  padding: '3px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', cursor: 'pointer',
                }}>
                {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <textarea
              value={hevyNotes}
              onChange={e => setHevyNotes(e.target.value)}
              placeholder="exercises, sets/reps/load, or paste Hevy CSV…"
              rows={3}
              style={{
                background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 2,
                padding: '4px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 10,
                resize: 'vertical', outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <span
              onClick={addHevySession}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em', alignSelf: 'flex-end' }}>
              SAVE SESSION
            </span>
          </div>
        )}

        {hevySessions.length === 0 && !showHevy && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', padding: '4px 0' }}>
            No sessions logged yet
          </div>
        )}

        {hevySessions.slice(0, 5).map(s => (
          <HevyRow key={s.id} session={s} onDelete={() => deleteHevySession(s.id)} />
        ))}
        {hevySessions.length > 5 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.06em', paddingTop: 4 }}>
            +{hevySessions.length - 5} more sessions
          </div>
        )}
      </div>

      {/* ── type picker portal ── */}
      {picking && pickPos && ReactDOM.createPortal(
        <>
          <div
            onClick={() => { setPicking(null); setPickPos(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          />
          <div style={{
            position: 'fixed',
            top: pickPos.top, left: pickPos.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--bg-4)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4, padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90,
          }}>
            {WORKOUT_TYPES.map(t => (
              <button key={t}
                onClick={() => setType(picking, t)}
                style={{
                  background: (workouts[picking]?.type === t) ? 'var(--bg-3)' : 'transparent',
                  border: 'none', borderRadius: 3, padding: '6px 10px',
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: TYPE_COLOR[t],
                  letterSpacing: '0.06em', cursor: 'pointer', textAlign: 'left',
                }}>{t}</button>
            ))}
          </div>
        </>,
        document.body
      )}
    </Card>
  );
}

/* ── Hevy row ── */
function HevyRow({ session, onDelete }) {
  const [hover, setHover] = useStateWkt(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto 18px', alignItems: 'flex-start', gap: 8,
        padding: '5px 0', borderBottom: '1px solid var(--border)',
      }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginBottom: 2 }}>
          {session.date} · <span style={{ color: TYPE_COLOR[session.type] || 'var(--fg-2)' }}>{session.type}</span>
        </div>
        {session.notes && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
            {session.notes.slice(0, 120)}{session.notes.length > 120 ? '…' : ''}
          </div>
        )}
      </div>
      <span />
      <span onClick={onDelete} style={{
        opacity: hover ? 1 : 0, transition: 'opacity 100ms',
        color: 'var(--neg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="x" size={11} />
      </span>
    </div>
  );
}

/* ── stat tile ── */
function WktStat({ label, value, tone }) {
  const colors = { pos: 'var(--pos)', neg: 'var(--neg)', warn: 'var(--warn)', accent: 'var(--accent)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label-micro" style={{ color: 'var(--fg-3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500, color: tone ? colors[tone] : 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

window.Workouts = Workouts;
