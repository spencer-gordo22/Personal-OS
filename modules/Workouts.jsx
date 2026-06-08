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

/* Count consecutive prior days with an entry (for BJJ streak) */
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
  if (/push|chest|bench|shoulder|tricep|press/.test(t))     return 'PUSH';
  if (/pull|back|row|lat|bicep|curl|deadlift/.test(t))      return 'PULL';
  if (/leg|squat|lunge|quad|hamstring|glute|lower/.test(t)) return 'LEGS';
  if (/shar|arm|lateral/.test(t))                           return 'SHARMS';
  if (/rest|off|yoga|mobility|stretch/.test(t))             return 'REST';
  const enames = exercises.map(e => (e.name || '').toLowerCase()).join(' ');
  if (/bench|chest|press|shoulder|tricep/.test(enames))     return 'PUSH';
  if (/row|lat|bicep|curl|deadlift/.test(enames))           return 'PULL';
  if (/squat|lunge|leg press|hamstring/.test(enames))       return 'LEGS';
  return 'PUSH';
}

/* Format total volume nicely */
function fmtVol(lbs) {
  if (!lbs || lbs <= 0) return '—';
  if (lbs >= 1000) return `${(lbs / 1000).toFixed(1)}k lbs`;
  return `${Math.round(lbs).toLocaleString()} lbs`;
}

/* ════════════════════════════════════════════════════════════ main component */
function Workouts() {
  const isMobile  = useIsMobile();
  const week      = getWeekDays();
  const todayISO  = toISO(new Date());
  const weekStart = week[0], weekEnd = week[6];
  const wkLabel   = `${MONTH_ABBR[weekStart.month]} ${weekStart.date} → ${weekEnd.date}`;

  /* ── workout week strip (done / type state) ── */
  const [workouts, setWorkouts] = useLocalStorage('sos_workouts_v4', () => {
    const init = {};
    week.forEach(d => { init[d.iso] = { type: d.defType, done: false }; });
    return init;
  });

  /* ── BJJ / combat attendance (inline strip, same localStorage key as before) ── */
  const [bjj, setBjj] = useLocalStorage('sos_bjj', {});
  const bjjDone   = week.filter(d => bjj[d.iso] && bjj[d.iso].done).length;
  const bjjStreak = calcStreak(bjj, 'done');
  const toggleBjj = (iso) =>
    setBjj(b => ({ ...b, [iso]: { done: !(b[iso] && b[iso].done) } }));

  /* ── week-strip type picker ── */
  const [picking, setPicking] = useStateWkt(null);
  const [pickPos, setPickPos] = useStateWkt(null);

  /* ── paste / parse / confirm flow ── */
  const [pasteText, setPasteText] = useStateWkt('');
  const [parsing,   setParsing]   = useStateWkt(false);
  const [parseErr,  setParseErr]  = useStateWkt('');
  const [parsed,    setParsed]    = useStateWkt(null);   // confirmation card data
  const [saving,    setSaving]    = useStateWkt(false);

  const wktDone = week.filter(d => workouts[d.iso] && workouts[d.iso].done).length;

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

  /* ── parse pasted text → confirmation card (does NOT save yet) ── */
  async function parseWorkout() {
    const text = pasteText.trim();
    if (!text || parsing) return;
    setParsing(true); setParseErr('');
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
      setParsed({
        name:          data.name        || 'Workout',
        date:          data.date        || todayISO,
        totalVolume:   data.totalVolume || 0,
        exerciseCount: (data.exercises || []).length,
        type:          guessType(data.name || '', data.exercises || []),
      });
    } catch (e) {
      setParseErr('Could not parse — check the text and try again');
      console.warn('[Workouts] parse error:', e);
    } finally {
      setParsing(false);
    }
  }

  /* ── confirm → save to Supabase, mark week strip, reset ── */
  async function confirmSave() {
    if (!parsed || saving) return;
    setSaving(true);
    const row = {
      name:           parsed.name,
      date:           parsed.date,
      type:           parsed.type,
      total_volume:   parsed.totalVolume,
      exercise_count: parsed.exerciseCount,
    };
    try {
      const db = await (window._supaReady || Promise.resolve(window._supa || null));
      if (db) {
        const { error } = await db.from('workout_sessions').insert(row);
        if (error) {
          // table may not exist yet — keep a local copy so confirm never fails
          console.warn('[Workouts] Supabase insert failed, caching locally:', error.message);
          const cache = JSON.parse(localStorage.getItem('sos_workout_sessions_cache') || '[]');
          cache.unshift({ ...row, id: `wkt_${Date.now()}` });
          localStorage.setItem('sos_workout_sessions_cache', JSON.stringify(cache));
        } else {
          console.log('[Workouts] saved to Supabase ✓', row);
        }
      }
    } catch (e) {
      console.warn('[Workouts] save error:', e);
    }

    /* auto-mark the matching week-strip day done */
    setWorkouts(w => {
      if (!week.some(d => d.iso === parsed.date)) return w;
      return { ...w, [parsed.date]: { ...(w[parsed.date] || {}), type: parsed.type, done: true } };
    });

    /* reset everything */
    setParsed(null);
    setPasteText('');
    setSaving(false);
  }

  const discardParsed = () => { setParsed(null); };

  /* ════════════════════════════════════════════════════════════ render */
  return (
    <Card icon="dumbbell" label="workouts · week" meta={wkLabel}
      action={
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
          {wktDone}/7 ✓
        </span>
      }>

      {/* ══ workout week strip ══ */}
      <div className="sos-week-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 14 }}>
        {week.map(d => {
          const wkt = workouts[d.iso] || { type: d.defType, done: false };
          const typeColor = TYPE_COLOR[wkt.type] || 'var(--fg-3)';
          return (
            <div key={d.iso} style={{ position: 'relative' }}>
              <div
                onClick={(e) => openPick(d.iso, e)}
                className="sos-tap"
                style={{
                  background: d.isToday ? 'var(--bg-3)' : 'var(--bg-1)',
                  border: '1px solid ' + (d.isToday ? 'var(--accent)' : picking === d.iso ? 'var(--border-strong)' : 'var(--border)'),
                  borderRadius: 4, padding: '8px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer',
                  boxShadow: d.isToday ? 'inset 0 0 0 1px rgba(0,212,255,0.30)' : 'none',
                  opacity: wkt.done && !d.isToday ? 0.6 : 1,
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
                  className="sos-tap"
                  title={wkt.done ? 'Mark incomplete' : 'Mark done'}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: wkt.done ? 'var(--pos)' : (d.isToday ? 'var(--accent)' : 'var(--bg-3)'),
                    border: !wkt.done && !d.isToday ? '1px solid var(--border-strong)' : 'none',
                    marginTop: 2, cursor: 'pointer',
                  }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ══ parse / confirm zone ══ */}
      {!parsed ? (
        /* ── paste area + Parse button ── */
        <div>
          <textarea
            value={pasteText}
            onChange={e => { setPasteText(e.target.value); if (parseErr) setParseErr(''); }}
            placeholder="Paste your Hevy workout summary here"
            rows={isMobile ? 7 : 6}
            style={{
              width: '100%', background: 'var(--bg-1)',
              border: `1px solid ${parseErr ? 'var(--neg)' : 'var(--border-strong)'}`,
              borderRadius: 6, padding: '11px 12px',
              color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 11,
              resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.55,
              WebkitOverflowScrolling: 'touch',
            }}
          />
          {parseErr && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)', marginTop: 6 }}>
              ⚠ {parseErr}
            </div>
          )}
          <button
            onClick={parseWorkout}
            disabled={!pasteText.trim() || parsing}
            className="sos-tap"
            style={{
              width: '100%', marginTop: 10, minHeight: 44,
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              color:      (!pasteText.trim() || parsing) ? 'var(--fg-4)' : '#001218',
              background: (!pasteText.trim() || parsing) ? 'var(--bg-3)' : 'var(--accent)',
              border: 'none', borderRadius: 6,
              cursor: (!pasteText.trim() || parsing) ? 'default' : 'pointer',
            }}>
            {parsing ? 'PARSING…' : 'Parse Workout'}
          </button>
        </div>
      ) : (
        /* ── clean confirmation card ── */
        <div style={{
          background: 'var(--bg-1)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '14px 14px 12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: 'var(--fg-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{parsed.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
                {parsed.date}
                <span style={{ color: TYPE_COLOR[parsed.type] || 'var(--fg-3)', marginLeft: 8 }}>{parsed.type}</span>
              </div>
            </div>
            <span onClick={discardParsed} className="sos-tap" style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex', padding: 4 }}>
              <Icon name="x" size={14} />
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>total volume</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 500, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(parsed.totalVolume)}</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>exercises</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 500, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{parsed.exerciseCount}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={discardParsed} className="sos-tap" style={{
              flex: 1, minHeight: 44, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
              color: 'var(--fg-3)', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer',
            }}>DISCARD</button>
            <button onClick={confirmSave} disabled={saving} className="sos-tap" style={{
              flex: 2, minHeight: 44, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              color: '#001218', background: 'var(--accent)', border: 'none',
              borderRadius: 6, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'SAVING…' : 'Confirm & Save'}</button>
          </div>
        </div>
      )}

      {/* ══ BJJ / combat strip — inline, below the paste/parse area ══ */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
        <span className="label-micro" style={{ display: 'block', color: 'var(--fg-4)', marginBottom: 6, letterSpacing: '0.08em' }}>
          BJJ / COMBAT · {bjjDone}/7 this week{bjjStreak > 0 ? ` · ${bjjStreak}d streak` : ''}
        </span>
        <div className="sos-bjj-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {week.map(d => {
            const went = bjj[d.iso] && bjj[d.iso].done;
            return (
              <div
                key={d.iso}
                onClick={() => toggleBjj(d.iso)}
                className="sos-tap"
                title={went ? 'Mark absent' : 'Mark attended'}
                style={{
                  background: went ? 'rgba(255,181,71,0.15)' : 'var(--bg-1)',
                  border: `1px solid ${went ? 'var(--warn)' : d.isToday ? 'var(--border-strong)' : 'var(--border)'}`,
                  borderRadius: 4, padding: '6px 4px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  cursor: 'pointer', userSelect: 'none',
                }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: d.isToday ? 'var(--accent)' : 'var(--fg-4)', letterSpacing: '0.06em' }}>{d.day}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: went ? 'var(--warn)' : 'var(--fg-3)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
                <span style={{ fontSize: 10, lineHeight: 1 }}>{went ? '🥋' : '·'}</span>
              </div>
            );
          })}
        </div>
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
                className="sos-tap"
                style={{
                  background: (workouts[picking]?.type === t) ? 'var(--bg-3)' : 'transparent',
                  border: 'none', borderRadius: 3, padding: '8px 10px', minHeight: 36,
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
