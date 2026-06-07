/* global React, Card, Icon, Skeleton */
const { useState: useStateSAT, useEffect: useEffectSAT } = React;

const SAT_TARGET    = 1500;
const SAT_TEST_DATE = '2026-08-15';
const SAT_TEST_LABEL = 'August 15 2026';

/* ── helpers ── */
function satDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}
const satToday = () => new Date().toISOString().slice(0, 10);
function satFmtShort(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-');
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${MON[+m - 1]} ${+d}`;
}

/* ── SQL shown if the Supabase tables don't exist yet ── */
const SAT_SETUP_SQL = `CREATE TABLE IF NOT EXISTS sat_scores (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date            date    NOT NULL,
  total           int     NOT NULL,
  math            int,
  reading_writing int,
  created_at      timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sat_sessions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date        date    NOT NULL,
  minutes     int     NOT NULL,
  topics      text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE sat_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon rw sat_scores"   ON sat_scores   USING (true) WITH CHECK (true);
CREATE POLICY "anon rw sat_sessions" ON sat_sessions USING (true) WITH CHECK (true);`;

/* ════════════════════════════════════════════════
   Line chart — pure SVG, no external libraries
   Plots total score over time with a target line.
   ════════════════════════════════════════════════ */
function SATChart({ scores }) {
  const W = 300, H = 96, PAD_L = 4, PAD_R = 4, PAD_T = 10, PAD_B = 4;
  const pts = [...scores]
    .filter(s => s.total != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (pts.length === 0) {
    return (
      <div style={{
        height: H, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em',
      }}>
        no practice tests logged yet
      </div>
    );
  }

  // Y domain: pad around data + always include the 1500 target
  const vals = pts.map(p => p.total).concat([SAT_TARGET]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 100) { lo -= 50; hi += 50; }
  lo = Math.max(200, lo - 30);
  hi = Math.min(1600, hi + 30);
  const span = hi - lo || 1;

  const x = (i) => pts.length === 1
    ? W / 2
    : PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const targetY = y(SAT_TARGET);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      {/* target line at 1500 */}
      {targetY > PAD_T && targetY < H - PAD_B && (
        <g>
          <line x1={PAD_L} y1={targetY} x2={W - PAD_R} y2={targetY}
            stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45" />
          <text x={W - PAD_R} y={targetY - 3} textAnchor="end"
            fontFamily="var(--font-mono)" fontSize="7" fill="var(--accent)" opacity="0.7">1500</text>
        </g>
      )}
      {/* score line */}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {/* dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.total)} r="2.4" fill="var(--accent)" />
      ))}
    </svg>
  );
}

/* ════════════════════════════════════════════════
   Stat cell
   ════════════════════════════════════════════════ */
function SATStat({ label, value, unit, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{
        fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500,
        color: color || 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {value}
        {unit && value !== '—' && <span style={{ fontSize: 9, color: 'var(--fg-3)', marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

/* shared input style */
const satInp = {
  width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border-strong)',
  borderRadius: 3, padding: '6px 8px', color: 'var(--fg-1)',
  fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
};
const satLbl = {
  fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-4)',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3, display: 'block',
};

/* ════════════════════════════════════════════════
   Main module
   ════════════════════════════════════════════════ */
function SAT() {
  const [scores,   setScores]   = useStateSAT([]);
  const [sessions, setSessions] = useStateSAT([]);
  const [loading,  setLoading]  = useStateSAT(true);
  const [needSetup, setNeedSetup] = useStateSAT(false);   // tables missing
  const [sqlCopied, setSqlCopied] = useStateSAT(false);

  /* form visibility */
  const [showScore,   setShowScore]   = useStateSAT(false);
  const [showSession, setShowSession] = useStateSAT(false);
  const [saving,      setSaving]      = useStateSAT(false);
  const [formErr,     setFormErr]     = useStateSAT('');

  /* score form fields */
  const [sDate,  setSDate]  = useStateSAT(satToday);
  const [sTotal, setSTotal] = useStateSAT('');
  const [sMath,  setSMath]  = useStateSAT('');
  const [sRW,    setSRW]    = useStateSAT('');

  /* session form fields */
  const [seDate,  setSeDate]  = useStateSAT(satToday);
  const [seMin,   setSeMin]   = useStateSAT('');
  const [seTopic, setSeTopic] = useStateSAT('');

  const days = satDaysUntil(SAT_TEST_DATE);

  /* ── load both tables ── */
  async function loadAll() {
    setLoading(true);
    const db = await (window._supaReady || Promise.resolve(window._supa || null));
    if (!db) { setLoading(false); return; }

    const [scoreRes, sessRes] = await Promise.all([
      db.from('sat_scores').select('*').order('date', { ascending: false }),
      db.from('sat_sessions').select('*').order('date', { ascending: false }),
    ]);

    // PGRST205 = table missing → show setup banner
    const missing = (e) => e && (e.code === 'PGRST205' ||
      /could not find the table/i.test(e.message || ''));
    if (missing(scoreRes.error) || missing(sessRes.error)) {
      console.warn('[SAT] tables missing — showing setup banner', scoreRes.error, sessRes.error);
      setNeedSetup(true);
      setLoading(false);
      return;
    }

    setNeedSetup(false);
    if (scoreRes.data) setScores(scoreRes.data);
    if (sessRes.data)  setSessions(sessRes.data);
    setLoading(false);
  }

  useEffectSAT(() => { loadAll(); }, []);

  /* ── add practice-test score ── */
  const addScore = async () => {
    setFormErr('');
    const total = parseInt(sTotal, 10);
    const math  = sMath ? parseInt(sMath, 10) : null;
    const rw    = sRW   ? parseInt(sRW,   10) : null;
    if (isNaN(total) || total < 200 || total > 1600) { setFormErr('Total must be 200–1600'); return; }
    if (math !== null && (math < 200 || math > 800))  { setFormErr('Math must be 200–800'); return; }
    if (rw   !== null && (rw   < 200 || rw   > 800))  { setFormErr('R/W must be 200–800'); return; }

    setSaving(true);
    const db = await (window._supaReady || Promise.resolve(window._supa || null));
    const row = { date: sDate || satToday(), total, math, reading_writing: rw };
    console.log('[SAT] insert sat_scores:', row);
    const { data, error } = await db.from('sat_scores').insert(row).select().single();
    console.log('[SAT] sat_scores response → data:', data, ' error:', error);
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setScores(prev => [data, ...prev]);
    setSTotal(''); setSMath(''); setSRW(''); setSDate(satToday());
    setShowScore(false);
  };

  /* ── add study session ── */
  const addSession = async () => {
    setFormErr('');
    const minutes = parseInt(seMin, 10);
    if (isNaN(minutes) || minutes <= 0) { setFormErr('Minutes must be a positive number'); return; }

    setSaving(true);
    const db = await (window._supaReady || Promise.resolve(window._supa || null));
    const row = { date: seDate || satToday(), minutes, topics: seTopic.trim() || null };
    console.log('[SAT] insert sat_sessions:', row);
    const { data, error } = await db.from('sat_sessions').insert(row).select().single();
    console.log('[SAT] sat_sessions response → data:', data, ' error:', error);
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setSessions(prev => [data, ...prev]);
    setSeMin(''); setSeTopic(''); setSeDate(satToday());
    setShowSession(false);
  };

  const copySql = () => {
    navigator.clipboard?.writeText(SAT_SETUP_SQL).then(() => {
      setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000);
    }).catch(() => {});
  };

  /* ── computed stats ── */
  const best = scores.length ? Math.max(...scores.map(s => s.total)) : null;
  const lastScore = scores.length
    ? [...scores].sort((a, b) => (a.date < b.date ? 1 : -1))[0].total
    : null;
  const gap = best !== null ? Math.max(0, SAT_TARGET - best) : null;

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const minutesThisWeek = sessions
    .filter(s => s.date >= weekAgoStr)
    .reduce((sum, s) => sum + (s.minutes || 0), 0);
  const hoursThisWeek = (minutesThisWeek / 60).toFixed(1);

  const bestColor = best !== null && best >= SAT_TARGET ? 'var(--pos)' : 'var(--accent)';

  return (
    <Card
      icon="graduation-cap"
      label="sat prep"
      meta={<span style={{ color: 'var(--accent)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>{days}d left</span>}
    >
      {/* ── countdown + target ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)',
            letterSpacing: '0.02em', fontWeight: 500,
          }}>
            {days} days
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.04em', marginTop: 1 }}>
            until {SAT_TEST_LABEL}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 8, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            target
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: 'var(--fg-1)', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {SAT_TARGET}
          </div>
        </div>
      </div>

      {/* ── setup banner (tables missing) ── */}
      {needSetup && (
        <div style={{
          background: 'rgba(255,178,0,0.08)', border: '1px solid var(--warn)',
          borderRadius: 4, padding: '9px 10px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name="alert-triangle" size={12} style={{ color: 'var(--warn)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn)', letterSpacing: '0.04em' }}>
              One-time setup: run this SQL in Supabase
            </span>
          </div>
          <pre style={{
            margin: 0, padding: '8px 9px', background: 'var(--bg-1)', border: '1px solid var(--border)',
            borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-2)',
            lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 130, overflow: 'auto',
          }}>{SAT_SETUP_SQL}</pre>
          <div style={{ display: 'flex', gap: 12, marginTop: 7 }}>
            <span onClick={copySql} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: sqlCopied ? 'var(--pos)' : 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>
              {sqlCopied ? '✓ COPIED' : '⎘ COPY SQL'}
            </span>
            <span onClick={loadAll} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
              ↻ RECHECK
            </span>
          </div>
        </div>
      )}

      {/* ── score chart (compact one-liner when no tests yet) ── */}
      {loading ? (
        <div style={{ marginBottom: 12 }}>
          <Skeleton width="100%" height={96} radius={6} />
        </div>
      ) : scores.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.04em', marginBottom: 12 }}>
          No tests logged yet
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            score history
          </div>
          <SATChart scores={scores} />
        </div>
      )}

      {/* ── stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 8px',
        paddingTop: 12, borderTop: '1px solid var(--border)', marginBottom: 12,
      }}>
        {loading ? (
          [0,1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Skeleton width="60%" height={8} />
              <Skeleton width="45%" height={15} />
            </div>
          ))
        ) : (
          <>
            <SATStat label="best"        value={best ?? '—'}      color={bestColor} />
            <SATStat label="last"        value={lastScore ?? '—'} />
            <SATStat label="gap to 1500" value={gap ?? '—'}       color={gap === 0 ? 'var(--pos)' : 'var(--warn)'} />
            <SATStat label="hrs / week"  value={hoursThisWeek}    unit="h" />
            <SATStat label="sessions"    value={sessions.length} />
            <SATStat label="tests"       value={scores.length} />
          </>
        )}
      </div>

      {/* ── action buttons ── */}
      {!showScore && !showSession && (
        <div style={{ display: 'flex', gap: 8 }}>
          <span
            onClick={() => { setShowScore(true); setShowSession(false); setFormErr(''); }}
            style={{
              flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
              background: 'var(--accent)', color: '#001218',
            }}>
            ＋ LOG TEST
          </span>
          <span
            onClick={() => { setShowSession(true); setShowScore(false); setFormErr(''); }}
            style={{
              flex: 1, textAlign: 'center', padding: '7px 0', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
              background: 'var(--bg-3)', color: 'var(--accent)', border: '1px solid var(--accent)',
            }}>
            ＋ LOG SESSION
          </span>
        </div>
      )}

      {/* ── score form ── */}
      {showScore && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>LOG PRACTICE TEST</span>
            <span onClick={() => setShowScore(false)} style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex' }}>
              <Icon name="x" size={13} />
            </span>
          </div>
          <div>
            <span style={satLbl}>Date</span>
            <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} style={satInp} />
          </div>
          <div>
            <span style={satLbl}>Total score (200–1600)</span>
            <input type="number" value={sTotal} onChange={e => setSTotal(e.target.value)} placeholder="1480" style={satInp} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={satLbl}>Math (200–800)</span>
              <input type="number" value={sMath} onChange={e => setSMath(e.target.value)} placeholder="760" style={satInp} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={satLbl}>Reading / Writing</span>
              <input type="number" value={sRW} onChange={e => setSRW(e.target.value)} placeholder="720" style={satInp} />
            </div>
          </div>
          {formErr && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)' }}>{formErr}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <span onClick={() => setShowScore(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', cursor: 'pointer', padding: '6px 8px', letterSpacing: '0.06em' }}>CANCEL</span>
            <span onClick={addScore} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
              background: (sTotal && !saving) ? 'var(--accent)' : 'var(--bg-3)',
              color:      (sTotal && !saving) ? '#001218'        : 'var(--fg-4)',
            }}>{saving ? 'SAVING…' : 'SAVE'}</span>
          </div>
        </div>
      )}

      {/* ── session form ── */}
      {showSession && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>LOG STUDY SESSION</span>
            <span onClick={() => setShowSession(false)} style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex' }}>
              <Icon name="x" size={13} />
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={satLbl}>Date</span>
              <input type="date" value={seDate} onChange={e => setSeDate(e.target.value)} style={satInp} />
            </div>
            <div style={{ width: 90 }}>
              <span style={satLbl}>Minutes</span>
              <input type="number" value={seMin} onChange={e => setSeMin(e.target.value)} placeholder="45" style={satInp} />
            </div>
          </div>
          <div>
            <span style={satLbl}>Topics covered</span>
            <input value={seTopic} onChange={e => setSeTopic(e.target.value)} placeholder="algebra · grammar rules" style={satInp} />
          </div>
          {formErr && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)' }}>{formErr}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <span onClick={() => setShowSession(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', cursor: 'pointer', padding: '6px 8px', letterSpacing: '0.06em' }}>CANCEL</span>
            <span onClick={addSession} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
              background: (seMin && !saving) ? 'var(--accent)' : 'var(--bg-3)',
              color:      (seMin && !saving) ? '#001218'        : 'var(--fg-4)',
            }}>{saving ? 'SAVING…' : 'SAVE'}</span>
          </div>
        </div>
      )}

      {/* ── recent sessions (compact) ── */}
      {!showScore && !showSession && sessions.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            recent sessions
          </div>
          {sessions.slice(0, 3).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', width: 46, flexShrink: 0 }}>{satFmtShort(s.date)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', width: 42, flexShrink: 0 }}>{s.minutes}m</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topics || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

window.SAT = SAT;
