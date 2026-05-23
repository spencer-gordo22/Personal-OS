/* global React, Card, Icon, useLocalStorage */
const { useState: useStateSAT } = React;

const SAT_DEFAULT_TARGET = 1500;
const SAT_DEFAULT_DATE   = '2026-08-15';

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function SAT() {
  /* ── persistent state ── */
  const [scores,   setScores]   = useLocalStorage('sos_sat_scores',    []);
  const [target,   setTarget]   = useLocalStorage('sos_sat_target',    SAT_DEFAULT_TARGET);
  const [testDate, setTestDate] = useLocalStorage('sos_sat_test_date', SAT_DEFAULT_DATE);

  /* ── transient state ── */
  /* showAdd starts true so the score form is always visible on first render */
  const [showAdd,    setShowAdd]    = useStateSAT(true);
  const [editGoals,  setEditGoals]  = useStateSAT(false);
  const [scoreIn,    setScoreIn]    = useStateSAT('');
  const [dateIn,     setDateIn]     = useStateSAT(() => new Date().toISOString().slice(0, 10));
  const [noteIn,     setNoteIn]     = useStateSAT('');
  const [scoreSaved, setScoreSaved] = useStateSAT(false);
  const [targetDraft,setTargetDraft]= useStateSAT('');
  const [dateDraft,  setDateDraft]  = useStateSAT('');

  /* Coerce target to number (useLocalStorage parses JSON, so it should be number, but guard) */
  const tgt  = Number(target) || SAT_DEFAULT_TARGET;
  const days = daysUntil(testDate || SAT_DEFAULT_DATE);
  const best = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : null;
  const gap  = best !== null ? tgt - best : null;
  /* progress bar: map 400–tgt range to 0–100% */
  const pct  = best !== null ? Math.min(100, Math.round(((best - 400) / (tgt - 400)) * 100)) : 0;

  /* ── score log ── */
  const addScore = () => {
    const n = parseInt(scoreIn);
    if (isNaN(n) || n < 400 || n > 1600) return;
    setScores(s => [{ id: Date.now(), date: dateIn, score: n, note: noteIn.trim() }, ...s]);
    setScoreIn('');
    setNoteIn('');
    /* keep form open — just flash a saved indicator */
    setScoreSaved(true);
    setTimeout(() => setScoreSaved(false), 1500);
  };
  const del = (id) => setScores(s => s.filter(x => x.id !== id));

  /* ── goal editing ── */
  const startEditGoals = () => {
    setTargetDraft(String(tgt));
    setDateDraft(testDate || SAT_DEFAULT_DATE);
    setEditGoals(true);
  };
  const saveGoals = () => {
    const n = parseInt(targetDraft);
    if (!isNaN(n) && n >= 400 && n <= 1600) setTarget(n);
    if (dateDraft) setTestDate(dateDraft);
    setEditGoals(false);
  };
  const cancelGoals = () => setEditGoals(false);

  const inputSt = {
    background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
    borderRadius: 2, padding: '3px 6px', color: 'var(--fg-1)',
    fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
  };

  return (
    <Card icon="graduation-cap" label="sat prep" meta={`${days}d to exam`}>

      {/* ── top stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <SATStat label="target"     value={String(tgt)}  tone="accent" />
        <SATStat label="best score" value={best !== null ? String(best) : '—'}
          tone={best !== null && best >= tgt ? 'pos' : null} />
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
            {pct}% to {tgt}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)' }}>1600</span>
        </div>
      </div>

      {/* ── countdown chip + edit button ── */}
      {!editGoals ? (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 4,
          border: '1px solid var(--border)', marginBottom: 12,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {fmtDate(testDate)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: days <= 30 ? 'var(--neg)' : days <= 90 ? 'var(--warn)' : 'var(--fg-1)',
            }}>
              {days}d
            </span>
            <span
              onClick={startEditGoals}
              title="Edit target score and test date"
              style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex', alignItems: 'center', transition: 'color 100ms' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-4)'}
            >
              <Icon name="pencil" size={12} />
            </span>
          </div>
        </div>
      ) : (
        /* ── edit goals panel ── */
        <div style={{
          marginBottom: 12, padding: '10px 12px',
          background: 'var(--bg-1)', border: '1px solid var(--accent)',
          borderRadius: 4,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            EDIT GOALS
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', marginBottom: 3 }}>
                TARGET SCORE (400–1600)
              </div>
              <input
                autoFocus
                type="number"
                value={targetDraft}
                onChange={e => setTargetDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveGoals()}
                min="400" max="1600" step="10"
                style={{ ...inputSt, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', marginBottom: 3 }}>
                TEST DATE
              </div>
              <input
                type="date"
                value={dateDraft}
                onChange={e => setDateDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveGoals()}
                style={{ ...inputSt, width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span
              onClick={saveGoals}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: '#001218',
                background: 'var(--accent)', padding: '3px 10px', borderRadius: 3,
                cursor: 'pointer', letterSpacing: '0.06em',
              }}>
              SAVE
            </span>
            <span
              onClick={cancelGoals}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)',
                cursor: 'pointer', letterSpacing: '0.06em',
              }}>
              CANCEL
            </span>
          </div>
        </div>
      )}

      {/* ── score log ── */}
      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            practice tests · {scores.length}
          </span>
          {scores.length > 0 && (
            <span
              onClick={() => setShowAdd(s => !s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--fg-4)', cursor: 'pointer', letterSpacing: '0.06em',
              }}>
              {showAdd ? 'HIDE FORM' : 'SHOW FORM'}
            </span>
          )}
        </div>

        {/* Score entry form — visible by default, collapsible once scores exist */}
        {showAdd && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10,
            padding: '10px 10px 8px', background: 'var(--bg-1)', borderRadius: 4,
            border: `1px solid ${scoreSaved ? 'var(--pos)' : 'var(--border)'}`,
            transition: 'border-color 300ms',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              LOG PRACTICE SCORE
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number" value={scoreIn}
                onChange={e => setScoreIn(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addScore()}
                placeholder="score (400–1600)"
                style={{ ...inputSt, flex: 1 }}
              />
              <input
                type="date" value={dateIn} onChange={e => setDateIn(e.target.value)}
                style={{ ...inputSt, colorScheme: 'dark' }}
              />
            </div>
            <input
              value={noteIn} onChange={e => setNoteIn(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addScore()}
              placeholder="notes — e.g. Khan Academy full practice, weak in reading"
              style={{ ...inputSt, fontSize: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.06em' }}>
                {scoreIn && (parseInt(scoreIn) < 400 || parseInt(scoreIn) > 1600)
                  ? '⚠ score must be 400–1600'
                  : ''}
              </span>
              <span
                onClick={addScore}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: scoreSaved ? 'var(--pos)' : 'var(--accent)',
                  cursor: 'pointer', letterSpacing: '0.06em', transition: 'color 300ms',
                }}>
                {scoreSaved ? '✓ SAVED' : 'SAVE SCORE'}
              </span>
            </div>
          </div>
        )}

        {scores.length === 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
            letterSpacing: '0.06em', padding: '2px 0 6px',
          }}>
            no practice scores logged yet — use the form above
          </div>
        )}

        {[...scores].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => (
          <div key={s.id} style={{
            display: 'grid', gridTemplateColumns: '72px 1fr auto 18px',
            alignItems: 'center', gap: 8, padding: '5px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{s.date}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: s.score >= tgt ? 'var(--pos)' : s.score >= tgt - 100 ? 'var(--accent)' : 'var(--fg-1)',
            }}>
              {s.score}
              {s.score === best && scores.length > 1 && (
                <span style={{ fontSize: 8, marginLeft: 5, color: 'var(--accent)', letterSpacing: '0.08em' }}>BEST</span>
              )}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.note || ''}
            </span>
            <span
              onClick={() => del(s.id)}
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
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600,
        color: tone ? c[tone] : 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

window.SAT = SAT;
