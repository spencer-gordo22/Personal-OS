/* global React, ReactDOM, Card, Icon, toISO, useLocalStorage, useIsMobile */
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
const JS_DAY_NAME = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function getWeekDays() {
  const today    = new Date();
  const todayISO = toISO(today);
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const dow = today.getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt  = new Date(y, m, d - daysSinceMonday + i);
    const iso = toISO(dt);
    days.push({
      day:     JS_DAY_NAME[dt.getDay()],
      date:    dt.getDate(),
      month:   dt.getMonth(),
      iso,
      isToday: iso === todayISO,
      defType: DEFAULT_SCHEDULE[i],
    });
  }
  return days;
}

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

/* Guess workout type from name or exercise list */
function guessType(title = '', exercises = []) {
  const t = title.toLowerCase();
  if (/push|chest|bench|shoulder|tricep|press/.test(t))  return 'PUSH';
  if (/pull|back|row|lat|bicep|curl|deadlift/.test(t))   return 'PULL';
  if (/leg|squat|lunge|quad|hamstring|glute|lower/.test(t)) return 'LEGS';
  if (/shar|arm|lateral/.test(t))                         return 'SHARMS';
  if (/rest|off|yoga|mobility|stretch/.test(t))           return 'REST';
  const enames = exercises.map(e => (e.name || '').toLowerCase()).join(' ');
  if (/bench|chest|press|shoulder|tricep/.test(enames))  return 'PUSH';
  if (/row|lat|bicep|curl|deadlift/.test(enames))        return 'PULL';
  if (/squat|lunge|leg press|hamstring/.test(enames))    return 'LEGS';
  return 'PUSH';
}

/* Format total volume nicely */
function fmtVol(lbs) {
  if (!lbs || lbs <= 0) return null;
  if (lbs >= 1000) return `${(lbs / 1000).toFixed(1)}k lbs`;
  return `${Math.round(lbs).toLocaleString()} lbs`;
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

/* ── Session row — collapses / expands exercise detail ── */
function SessionRow({ session, onDelete }) {
  const [expanded, setExpanded] = useStateWkt(false);
  const isMobile = useIsMobile();
  const typeColor = TYPE_COLOR[session.type] || 'var(--fg-2)';
  const hasExercises = session.exercises && session.exercises.length > 0;
  const vol = fmtVol(session.totalVolume);

  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      {/* ── header ── */}
      <div
        onClick={() => hasExercises && setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: hasExercises ? 'pointer' : 'default' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            color: 'var(--fg-1)', marginBottom: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {session.name || 'Workout'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
            <span>{session.date}</span>
            <span style={{ color: typeColor }}>{session.type}</span>
            {session.duration && <span>{session.duration}</span>}
            {vol && <span style={{ color: 'var(--fg-2)' }}>{vol}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hasExercises && (
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={11} style={{ color: 'var(--fg-4)' }} />
          )}
          <span
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ color: 'var(--neg)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Icon name="x" size={11} />
          </span>
        </div>
      </div>

      {/* ── exercise detail ── */}
      {expanded && hasExercises && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {session.exercises.map((ex, i) => {
            const sets = ex.sets || [];
            const exVol = sets.reduce((sum, s) => sum + ((s.reps || 0) * (s.weight || 0)), 0);
            return (
              <div key={i} style={{ padding: '6px 8px', background: 'var(--bg-1)', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--fg-2)' }}>
                    {ex.name}
                  </span>
                  {exVol > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                      {fmtVol(exVol)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
                  {sets.map((s, j) => (
                    <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)' }}>
                      {s.reps}r × {s.weight}lb
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── legacy notes fallback (backward compat with old sessions) ── */}
      {!hasExercises && session.notes && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {session.notes.slice(0, 200)}{session.notes.length > 200 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ main component */
function Workouts() {
  const isMobile  = useIsMobile();
  const week      = getWeekDays();
  const todayISO  = toISO(new Date());
  const weekStart = week[0], weekEnd = week[6];
  const wkLabel   = `${MONTH_ABBR[weekStart.month]} ${weekStart.date} → ${weekEnd.date}`;

  /* ── workout history (week strip done/type state) ── */
  const [workouts, setWorkouts] = useLocalStorage('sos_workouts_v4', () => {
    const init = {};
    week.forEach(d => { init[d.iso] = { type: d.defType, done: false }; });
    return init;
  });

  /* ── BJJ history ── */
  const [bjj, setBjj] = useLocalStorage('sos_bjj', {});

  /* ── Session log (parsed workouts) ── */
  const [sessions, setSessions] = useLocalStorage('sos_workout_sessions_v2', []);

  /* ── Week-strip type picker ── */
  const [picking, setPicking]   = useStateWkt(null);
  const [pickPos, setPickPos]   = useStateWkt(null);

  /* ── Paste form ── */
  const [showPaste,  setShowPaste]  = useStateWkt(false);
  const [pasteText,  setPasteText]  = useStateWkt('');
  const [parsStatus, setParsStatus] = useStateWkt('idle');  // idle | parsing | error
  const [parsError,  setParsError]  = useStateWkt('');

  /* ── derived ── */
  const todayWkt  = workouts[todayISO] || { type: 'PUSH', done: false };
  const wktDone   = week.filter(d => workouts[d.iso] && workouts[d.iso].done).length;
  const bjjDone   = week.filter(d => bjj[d.iso] && bjj[d.iso].done).length;
  const wktStreak = calcStreak(workouts, 'done');
  const bjjStreak = calcStreak(bjj, 'done');

  /* ── week strip handlers ── */
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

  /* ── parse + save workout ── */
  async function parsePaste() {
    const text = pasteText.trim();
    if (!text || parsStatus === 'parsing') return;
    setParsStatus('parsing'); setParsError('');
    try {
      const r = await fetch('/api/parse-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = await r.json();

      const session = {
        id:          `wkt_${Date.now()}`,
        date:        data.date        || todayISO,
        name:        data.name        || 'Workout',
        duration:    data.duration    || '',
        totalVolume: data.totalVolume || 0,
        exercises:   data.exercises   || [],
        type:        guessType(data.name || '', data.exercises || []),
        source:      'paste',
      };

      /* Save session */
      setSessions(prev => [session, ...(prev || [])]);

      /* Auto-mark week strip day as done */
      setWorkouts(w => {
        if (!week.some(d => d.iso === session.date)) return w;
        return { ...w, [session.date]: { ...(w[session.date] || {}), type: session.type, done: true } };
      });

      setPasteText(''); setShowPaste(false); setParsStatus('idle');
    } catch (e) {
      setParsStatus('error'); setParsError(e.message);
    }
  }

  const deleteSession = id => setSessions(s => s.filter(x => x.id !== id));

  /* ════════════════════════════════════════════════════════════ render */
  return (
    <Card icon="dumbbell" label="workouts · week" meta={wkLabel}
      action={
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
          {wktDone}/7 ✓
        </span>
      }>

      {/* ══ workout week strip ══ */}
      <div className="sos-week-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 10 }}>
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

      {/* ══ BJJ strip ══ */}
      <div style={{ marginBottom: 10 }}>
        <span className="label-micro" style={{ display: 'block', color: 'var(--fg-4)', marginBottom: 5, letterSpacing: '0.08em' }}>
          BJJ / COMBAT · {bjjDone}/7 this week{bjjStreak > 0 ? ` · ${bjjStreak}d streak` : ''}
        </span>
        <div className="sos-bjj-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
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

      {/* ══ stats row ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingTop: 10, borderTop: '1px solid var(--border)', marginBottom: 10 }}>
        <WktStat label="wkt this wk"  value={`${wktDone} / 7`}         tone="pos"    />
        <WktStat label="bjj this wk"  value={`${bjjDone} / 7`}         tone="warn"   />
        <WktStat label="wkt streak"   value={wktStreak > 0 ? `${wktStreak}d` : '—'} tone={wktStreak >= 7 ? 'accent' : wktStreak >= 3 ? 'pos' : null} />
        <WktStat label="bjj streak"   value={bjjStreak > 0 ? `${bjjStreak}d` : '—'} tone={bjjStreak >= 7 ? 'accent' : bjjStreak >= 3 ? 'warn' : null} />
      </div>

      {/* ══ session log ══ */}
      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="label-micro" style={{ color: 'var(--fg-4)' }}>
            session log
            {sessions.length > 0 && <span style={{ marginLeft: 6, color: 'var(--fg-3)' }}>{sessions.length} workouts</span>}
          </span>
          <span
            onClick={() => { setShowPaste(s => !s); setParsStatus('idle'); setParsError(''); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: showPaste ? 'var(--accent)' : 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
            {showPaste ? '✕ CANCEL' : '+ PASTE WORKOUT'}
          </span>
        </div>

        {/* paste form */}
        {showPaste && (
          <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg-1)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', lineHeight: 1.6, marginBottom: 7 }}>
              Copy your workout from the Hevy app and paste it below.<br/>
              OpenAI will extract exercises, sets, reps, weight, and volume.
            </div>
            <textarea
              autoFocus
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); if (parsStatus === 'error') setParsStatus('idle'); }}
              placeholder={'Paste Hevy workout summary here…\n\nE.g.:\nPush Day A · May 27 · 62 min\nBench Press\n  Set 1: 185lb × 8 reps\n  Set 2: 185lb × 8 reps\nOHP\n  Set 1: 115lb × 10 reps'}
              rows={isMobile ? 8 : 6}
              style={{
                width: '100%', background: 'var(--bg-3)',
                border: `1px solid ${parsStatus === 'error' ? 'var(--neg)' : 'var(--border-strong)'}`,
                borderRadius: 3, padding: '7px 9px',
                color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 10,
                resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
              }}
            />
            {parsError && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)', marginTop: 5 }}>
                ⚠ {parsError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 7 }}>
              <button
                onClick={parsePaste}
                disabled={!pasteText.trim() || parsStatus === 'parsing'}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                  color: (!pasteText.trim() || parsStatus === 'parsing') ? 'var(--fg-4)' : 'var(--bg-0)',
                  background: (!pasteText.trim() || parsStatus === 'parsing') ? 'var(--bg-3)' : 'var(--accent)',
                  border: 'none', borderRadius: 3, padding: '6px 14px', cursor: (!pasteText.trim() || parsStatus === 'parsing') ? 'default' : 'pointer',
                  transition: 'background 120ms, color 120ms',
                }}>
                {parsStatus === 'parsing' ? '⏳ PARSING…' : 'PARSE + SAVE →'}
              </button>
            </div>
          </div>
        )}

        {/* empty state */}
        {sessions.length === 0 && !showPaste && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', padding: '4px 0' }}>
            No sessions yet — paste a Hevy workout to get started
          </div>
        )}

        {/* session list */}
        {sessions.slice(0, 8).map(s => (
          <SessionRow key={s.id} session={s} onDelete={() => deleteSession(s.id)} />
        ))}
        {sessions.length > 8 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.06em', paddingTop: 6 }}>
            +{sessions.length - 8} older sessions
          </div>
        )}
      </div>

      {/* ══ type picker portal ══ */}
      {picking && pickPos && ReactDOM.createPortal(
        <>
          <div onClick={() => { setPicking(null); setPickPos(null); }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: pickPos.top, left: pickPos.left,
            transform: 'translateX(-50%)', zIndex: 9999,
            background: 'var(--bg-4)', border: '1px solid var(--border-strong)',
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

window.Workouts = Workouts;
