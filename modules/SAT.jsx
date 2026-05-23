/* global React, Card, Icon, useLocalStorage */
const { useState: useStateSAT } = React;

const SAT_TARGET    = 1500;
const SAT_TEST_DATE = '2026-08-15';

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}

function SAT() {
  const [scores,  setScores]  = useLocalStorage('sos_sat_scores', []);
  const [showAdd, setShowAdd] = useStateSAT(false);
  const [scoreIn, setScoreIn] = useStateSAT('');
  const [dateIn,  setDateIn]  = useStateSAT(() => new Date().toISOString().slice(0, 10));
  const [noteIn,  setNoteIn]  = useStateSAT('');

  const days   = daysUntil(SAT_TEST_DATE);
  const best   = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : null;
  const gap    = best !== null ? SAT_TARGET - best : null;
  /* progress bar: map 400–1500 range to 0–100% */
  const pct    = best !== null ? Math.min(100, Math.round(((best - 400) / (SAT_TARGET - 400)) * 100)) : 0;

  const addScore = () => {
    const n = parseInt(scoreIn);
    if (isNaN(n) || n < 400 || n > 1600) return;
    setScores(s => [{ id: Date.now(), date: dateIn, score: n, note: noteIn.trim() }, ...s]);
    setScoreIn(''); setNoteIn(''); setShowAdd(false);
  };
  const del = (id) => setScores(s => s.filter(x => x.id !== id));

  const inputSt = { background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '3px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' };

  return (
    <Card icon="graduation-cap" label="sat prep" meta={`${days}d to exam`}>

      {/* ── top stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <SATStat label="target"     value="1500"  tone="accent" />
        <SATStat label="best score" value={best !== null ? String(best) : '—'}
          tone={best !== null && best >= SAT_TARGET ? 'pos' : null} />
        <SATStat label="gap to go"
          value={gap !== null ? (gap <= 0 ? '✓ hit' : `${gap} pts`) : '—'}
          tone={gap !== null && gap <= 0 ? 'pos' : gap !== null && gap <= 50 ? 'warn' : null} />
      </div>

      {/* ── progress bar ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: pct >= 100 ? 'var(--pos)' : 'var(--accent)',
            borderRadius: 2, transition: 'width 400ms',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>400</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: pct >= 100 ? 'var(--pos)' : 'var(--accent)' }}>
            {pct}% to 1500
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>1600</span>
        </div>
      </div>

      {/* ── countdown chip ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 4,
        border: '1px solid var(--border)', marginBottom: 12,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          test date · aug 15 2026
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: days <= 30 ? 'var(--neg)' : days <= 90 ? 'var(--warn)' : 'var(--fg-1)',
        }}>
          {days}d
        </span>
      </div>

      {/* ── score log ── */}
      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            practice tests · {scores.length}
          </span>
          <span onClick={() => setShowAdd(s => !s)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: showAdd ? 'var(--accent)' : 'var(--fg-3)', cursor: 'pointer', letterSpacing: '0.06em' }}>
            {showAdd ? '✕ CANCEL' : '+ LOG SCORE'}
          </span>
        </div>

        {showAdd && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, padding: 8, background: 'var(--bg-1)', borderRadius: 4, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input autoFocus type="number" value={scoreIn}
                onChange={e => setScoreIn(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addScore()}
                placeholder="score (400–1600)"
                style={{ ...inputSt, flex: 1 }}
              />
              <input type="date" value={dateIn} onChange={e => setDateIn(e.target.value)}
                style={{ ...inputSt, colorScheme: 'dark' }}
              />
            </div>
            <input value={noteIn} onChange={e => setNoteIn(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addScore()}
              placeholder="notes (optional)"
              style={{ ...inputSt, fontSize: 10 }}
            />
            <span onClick={addScore}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em', alignSelf: 'flex-end' }}>
              SAVE
            </span>
          </div>
        )}

        {scores.length === 0 && !showAdd && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', padding: '4px 0' }}>
            no practice scores logged yet
          </div>
        )}

        {scores.map(s => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '72px 1fr auto 18px',
            alignItems: 'center', gap: 8,
            padding: '5px 0', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{s.date}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: s.score >= SAT_TARGET ? 'var(--pos)' : s.score >= 1400 ? 'var(--accent)' : 'var(--fg-1)',
            }}>
              {s.score}
              {s.score === best && scores.length > 1 && (
                <span style={{ fontSize: 8, marginLeft: 5, color: 'var(--pos)', letterSpacing: '0.08em' }}>BEST</span>
              )}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.note || ''}
            </span>
            <span onClick={() => del(s.id)}
              style={{ opacity: 0.3, cursor: 'pointer', color: 'var(--neg)', display: 'flex', justifyContent: 'center', transition: 'opacity 120ms' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}>
              <Icon name="x" size={11} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SATStat({ label, value, tone }) {
  const c = { pos: 'var(--pos)', neg: 'var(--neg)', accent: 'var(--accent)', warn: 'var(--warn)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: tone ? c[tone] : 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

window.SAT = SAT;
