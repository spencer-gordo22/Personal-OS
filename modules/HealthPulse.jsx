/* global React, Card, Kpi, Delta, Sparkline, Bars, Icon, useLocalStorage, useIsMobile */
const { useState: useStateHP, useEffect: useEffectHP } = React;

const HR_DATA    = [58, 60, 59, 62, 61, 60, 58, 59, 57, 58, 59, 58];
const SLEEP_BARS = [6.8, 7.2, 6.4, 7.8, 8.1, 6.9, 7.4];

const INITIAL_HEALTH = {
  hr:         0,
  hrv:        0,
  sleep:      0,
  sleep_perf: 0,   // sleep performance % from WHOOP
  strain:     0,   // day strain from WHOOP cycle
  steps:      0,
  weight:     0,   // stored in lbs
  vo2:        0,
  recovery:   0,
};

/* ── WHOOP color scale ──────────────────────────────────────
   Returns a CSS color var string matching WHOOP's own palette.
   Pass value=0 (or falsy) to get null (no color override).
   ─────────────────────────────────────────────────────────── */
function whoopColor(metric, value) {
  if (!value && value !== 0) return null;
  if (value === 0) return null;
  switch (metric) {
    case 'recovery':
    case 'hrv':        // hrv treated on 0-100 scale like recovery
      if (value >= 67) return 'var(--pos)';
      if (value >= 34) return 'var(--warn)';
      return 'var(--neg)';
    case 'hr':
      if (value <= 60) return 'var(--pos)';
      if (value <= 75) return 'var(--warn)';
      return 'var(--neg)';
    case 'sleep_perf':
      if (value >= 85) return 'var(--pos)';
      if (value >= 70) return 'var(--warn)';
      return 'var(--neg)';
    default:
      return null;
  }
}

const inp = (full) => ({
  background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
  padding: '3px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
  fontSize: 13, fontWeight: 500, outline: 'none',
  width: full ? '100%' : 62, boxSizing: 'border-box',
});

function HealthPulse() {
  const isMobile = useIsMobile();
  const [health, setHealth] = useLocalStorage('sos_health_v2', INITIAL_HEALTH);
  const [editMode, setEditMode] = useStateHP(false);
  const [drafts,   setDrafts]   = useStateHP(null);

  /* ── WHOOP creds + token ── */
  const [whoopClientId,     setWhoopClientId]     = useLocalStorage('sos_whoop_client_id', '');
  const [whoopClientSecret, setWhoopClientSecret] = useLocalStorage('sos_whoop_client_secret', '');
  const [whoopToken,        setWhoopToken]         = useLocalStorage('sos_whoop_token', null);
  const [showWhoop,    setShowWhoop]    = useStateHP(false);
  const [showSecret,   setShowSecret]   = useStateHP(false);
  const [whoopStatus,  setWhoopStatus]  = useStateHP('idle');  // idle | syncing | live | error
  const [whoopError,   setWhoopError]   = useStateHP('');
  const [lastSync,     setLastSync]     = useStateHP('');
  const [needsReconnect, setNeedsReconnect] = useStateHP(false); // scope/sleep banner
  const [whoop401,        setWhoop401]      = useStateHP(false); // token expired → clean reconnect

  /* ── manual-field inline editing (weight + vo2) ── */
  const [inlineEdit,  setInlineEdit]  = useStateHP(null);   // 'weight' | 'vo2' | null
  const [inlineDraft, setInlineDraft] = useStateHP('');

  /* ── auto-sync once on mount ──
     Always attempt — the server holds the token in Supabase, so we no longer
     gate on localStorage. A 401 just leaves persisted data untouched. */
  useEffectHP(() => {
    syncWhoop();
  }, []);

  /* syncWhoop — pulls recovery, HRV, resting HR, sleep, sleep performance, and
     day strain from the WHOOP v2 API. Weight and VO2 are manual fields.

     Note: WHOOP v2 sleep nests the duration under score.stage_summary, so the
     in-bed time is score.stage_summary.total_in_bed_time_milli (NOT score.*). */
  async function syncWhoop() {
    setWhoopStatus('syncing');
    setWhoopError('');
    try {
      const [recRes, sleepRes, cycleRes] = await Promise.all([
        fetch('/whoop/data?endpoint=recovery'),
        fetch('/whoop/data?endpoint=activity/sleep'),
        fetch('/whoop/data?endpoint=cycle'),
      ]);

      // 401 anywhere → token is dead. Show ONLY a clean "Reconnect Whoop"
      // button — no status codes, no technical text. Keep last cached metrics.
      if ([recRes, sleepRes, cycleRes].some(r => r.status === 401)) {
        setWhoop401(true);
        setWhoopStatus('idle');
        setWhoopError('');
        return;
      }
      setWhoop401(false);

      // If every endpoint failed for another reason, keep cached data silently.
      if (!recRes.ok && !sleepRes.ok && !cycleRes.ok) {
        throw new Error(`WHOOP HTTP ${recRes.status}/${sleepRes.status}/${cycleRes.status}`);
      }

      const recJson   = recRes.ok   ? await recRes.json()   : null;
      const sleepJson = sleepRes.ok ? await sleepRes.json() : null;
      const cycleJson = cycleRes.ok ? await cycleRes.json() : null;

      console.log('[WHOOP] recovery:', JSON.stringify(recJson).slice(0, 400));
      console.log('[WHOOP] sleep:',    JSON.stringify(sleepJson).slice(0, 700));
      console.log('[WHOOP] cycle:',    JSON.stringify(cycleJson).slice(0, 400));

      const rec        = recJson?.records?.[0];
      const sleepScore = sleepJson?.records?.[0]?.score;
      const cycleScore = cycleJson?.records?.[0]?.score;

      /* sleep hours — stage_summary nesting first, fall back to flat */
      const inBedMilli =
        sleepScore?.stage_summary?.total_in_bed_time_milli ??
        sleepScore?.total_in_bed_time_milli ?? null;
      const sleepHours = inBedMilli != null
        ? parseFloat((inBedMilli / 3600000).toFixed(1)) : null;
      const sleepPerf = sleepScore?.sleep_performance_percentage != null
        ? Math.round(sleepScore.sleep_performance_percentage) : null;
      const strain = cycleScore?.strain != null
        ? parseFloat(Number(cycleScore.strain).toFixed(1)) : null;

      /* reconnect banner: connection works (recovery present) but sleep empty
         → almost always a missing read:sleep scope, so prompt a reconnect. */
      const gotRecovery = rec?.score?.recovery_score != null;
      const sleepEmpty  = sleepHours == null || sleepHours === 0;
      setNeedsReconnect(gotRecovery && sleepEmpty);

      setHealth(h => ({
        ...h,
        recovery:   rec?.score?.recovery_score ?? h.recovery,
        hrv:        rec?.score?.hrv_rmssd_milli != null
                      ? Math.round(rec.score.hrv_rmssd_milli) : h.hrv,
        hr:         rec?.score?.resting_heart_rate ?? h.hr,
        sleep:      sleepHours ?? h.sleep,
        sleep_perf: sleepPerf  ?? h.sleep_perf,
        strain:     strain     ?? h.strain,
        // weight and vo2 intentionally omitted — manual fields
      }));

      setLastSync(new Date().toLocaleTimeString());
      setWhoopStatus('live');
    } catch (err) {
      setWhoopStatus('error');
      setWhoopError(err.message);
    }
  }

  const startInlineEdit = (field) => {
    setInlineEdit(field);
    setInlineDraft(String(health[field] > 0 ? health[field] : ''));
  };
  const cancelInlineEdit = () => { setInlineEdit(null); setInlineDraft(''); };
  const saveInlineEdit = () => {
    if (!inlineEdit) return;
    const n = parseFloat(inlineDraft);
    if (!isNaN(n) && n >= 0) {
      setHealth(h => ({ ...h, [inlineEdit]: n }));
    }
    setInlineEdit(null);
    setInlineDraft('');
  };

  const connectWhoop = () => {
    const cid = whoopClientId.trim();
    if (!cid) { setWhoopError('Enter your WHOOP Client ID first'); return; }
    window.location.href = `/whoop/auth?client_id=${encodeURIComponent(cid)}`;
  };

  const disconnectWhoop = () => {
    setWhoopToken(null);
    setWhoopStatus('idle');
    setLastSync('');
    setWhoopError('');
  };

  /* ── edit helpers ── */
  const enterEdit = () => {
    setDrafts({
      hr:         String(health.hr),
      hrv:        String(health.hrv),
      sleep:      String(health.sleep),
      sleep_perf: String(health.sleep_perf),
      steps:      String(health.steps),
      recovery:   String(health.recovery),
    });
    setEditMode(true);
  };

  const commitEdit = () => {
    const pf = (s, fb) => { const n = parseFloat(s); return isNaN(n) ? fb : n; };
    const pi = (s, fb) => { const n = parseInt(s);   return isNaN(n) ? fb : n; };
    setHealth(h => ({
      ...h,                                          // preserves weight + vo2 (manual fields)
      hr:         pi(drafts.hr,         h.hr),
      hrv:        pi(drafts.hrv,        h.hrv),
      sleep:      pf(drafts.sleep,      h.sleep),
      sleep_perf: pi(drafts.sleep_perf, h.sleep_perf),
      steps:      pi(drafts.steps,      h.steps),
      recovery:   pi(drafts.recovery,   h.recovery),
    }));
    setEditMode(false);
    setDrafts(null);
  };

  const upd   = (field) => (e) => setDrafts(d => ({ ...d, [field]: e.target.value }));
  const onKey = (e) => {
    if (e.key === 'Enter')  commitEdit();
    if (e.key === 'Escape') { setEditMode(false); setDrafts(null); }
  };

  const h = health;
  const isConnected = !!(whoopToken && whoopToken.access_token);

  const statusDot = { idle:'var(--fg-4)', syncing:'var(--warn)', live:'var(--pos)', error:'var(--neg)' }[whoopStatus];

  return (
    <Card icon="activity" label="health pulse"
      meta={isConnected ? <span style={{ color: 'var(--pos)', fontSize: 9 }}>● WHOOP</span> : 'MANUAL'}
      action={
        <span onClick={editMode ? commitEdit : enterEdit}
          title={editMode ? 'Save metrics' : 'Edit metrics'}
          style={{ cursor: 'pointer', color: editMode ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
          <Icon name={editMode ? 'check' : 'pencil'} size={13} />
        </span>
      }>

      {/* ── 401 → clean Reconnect button only (no codes, no technical text) ── */}
      {whoop401 && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={connectWhoop}
            className="sos-tap"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              minHeight: 44, padding: '0 18px',
              background: 'var(--accent)', color: '#001218', border: 'none',
              borderRadius: 6, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            }}
          >
            <Icon name="refresh-cw" size={14} />
            Reconnect Whoop
          </button>
        </div>
      )}

      {/* ── Reconnect banner — shown when recovery syncs but sleep is empty ── */}
      {!whoop401 && needsReconnect && (
        <div
          onClick={connectWhoop}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,178,0,0.10)', border: '1px solid var(--warn)',
            borderRadius: 4, padding: '7px 10px', marginBottom: 12, cursor: 'pointer',
          }}
        >
          <Icon name="alert-triangle" size={12} style={{ color: 'var(--warn)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn)', letterSpacing: '0.04em', lineHeight: 1.4 }}>
            Reconnect Whoop for full data access →
          </span>
        </div>
      )}

      {isMobile ? (

        /* ══════════════════════════════════════════════════════
           MOBILE LAYOUT
           1. Recovery hero (large, WHOOP-colored, centered)
           2. 2×3 metric grid: HR · HRV · Sleep / Sleep% · Steps · Weight
           ══════════════════════════════════════════════════════ */
        <>

          {/* ── Recovery hero ── */}
          <div style={{
            textAlign: 'center',
            padding: '20px 0 24px',
            marginBottom: 16,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-sans)', fontWeight: 500,
              color: '#5A5A68', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14,
            }}>
              recovery score
            </div>

            {editMode && drafts ? (
              <input
                value={drafts.recovery}
                onChange={upd('recovery')}
                onKeyDown={onKey}
                style={{ ...inp(false), width: 100, textAlign: 'center', fontSize: 36, marginBottom: 8 }}
              />
            ) : (
              <div style={{
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 72, lineHeight: 1,
                color: whoopColor('recovery', h.recovery) || '#E8E8EC',
                letterSpacing: '-0.02em',
              }}>
                {h.recovery > 0 ? h.recovery : '—'}
                {h.recovery > 0 && (
                  <span style={{ fontSize: 32, fontWeight: 400, color: '#5A5A68', marginLeft: 2 }}>%</span>
                )}
              </div>
            )}

            {h.recovery > 0 && (
              <div style={{
                marginTop: 12, fontSize: 12, fontFamily: 'var(--font-sans)',
                color: whoopColor('recovery', h.recovery) || '#5A5A68',
                letterSpacing: '0.01em',
              }}>
                {h.recovery >= 67 ? 'Green · Ready to perform'
                  : h.recovery >= 34 ? 'Yellow · Proceed with caution'
                  : 'Red · Prioritize recovery'}
              </div>
            )}
          </div>

          {/* ── 3-col × 2-row metric grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px 12px' }}>

            <Mini label="resting hr"
              value={h.hr ? `${h.hr}` : '—'}
              color={isConnected ? whoopColor('hr', h.hr) : undefined}
              unit="bpm"
              editNode={editMode && drafts &&
                <input autoFocus value={drafts.hr} onChange={upd('hr')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="hrv"
              value={h.hrv ? `${h.hrv}` : '—'}
              color={isConnected ? whoopColor('hrv', h.hrv) : undefined}
              unit="ms"
              editNode={editMode && drafts &&
                <input value={drafts.hrv} onChange={upd('hrv')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="sleep"
              value={h.sleep ? `${h.sleep}` : '—'}
              unit="hrs"
              editNode={editMode && drafts &&
                <input value={drafts.sleep} onChange={upd('sleep')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="sleep perf"
              value={h.sleep_perf ? `${h.sleep_perf}%` : '—'}
              color={isConnected ? whoopColor('sleep_perf', h.sleep_perf) : undefined}
              editNode={editMode && drafts &&
                <input value={drafts.sleep_perf} onChange={upd('sleep_perf')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="day strain"
              value={h.strain > 0 ? `${h.strain}` : '—'}
            />

            <Mini label="steps"
              value={h.steps > 0 ? h.steps.toLocaleString() : '—'}
              editNode={editMode && drafts &&
                <input value={drafts.steps} onChange={upd('steps')} onKeyDown={onKey} style={inp(true)} />}
            />

            <ManualMini label="weight" fieldKey="weight" value={h.weight} unit="lbs"
              inlineEdit={inlineEdit} inlineDraft={inlineDraft}
              onStart={startInlineEdit} onSave={saveInlineEdit}
              onCancel={cancelInlineEdit} onDraftChange={setInlineDraft}
            />

            <ManualMini label="vo₂ max" fieldKey="vo2" value={h.vo2}
              inlineEdit={inlineEdit} inlineDraft={inlineDraft}
              onStart={startInlineEdit} onSave={saveInlineEdit}
              onCancel={cancelInlineEdit} onDraftChange={setInlineDraft}
            />

          </div>

        </>

      ) : (

        /* ══════════════════════════════════════════════════════
           DESKTOP LAYOUT — unchanged
           ══════════════════════════════════════════════════════ */
        <>

          {/* ── top 3 big metrics ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            <Tri label="resting hr" value={String(h.hr)} unit="bpm"
              color={isConnected ? whoopColor('hr', h.hr) : undefined}
              editNode={editMode &&
                <input autoFocus value={drafts.hr} onChange={upd('hr')} onKeyDown={onKey} style={inp()} />}
              trace={<Sparkline data={HR_DATA} stroke="#3DDC97" height={28} />}
              delta={<Delta value={String(h.hr)} tone="flat">7d</Delta>}
            />

            <Tri label="hrv" value={String(h.hrv)} unit="ms"
              color={isConnected ? whoopColor('hrv', h.hrv) : undefined}
              editNode={editMode &&
                <input value={drafts.hrv} onChange={upd('hrv')} onKeyDown={onKey} style={inp()} />}
              trace={<Sparkline data={[54, 58, 62, 60, 64, 66, 64]} stroke="#00D4FF" height={28} />}
              delta={<Delta value="+ 4" tone="pos">wk</Delta>}
            />

            <Tri label="sleep" value={String(h.sleep)} unit="hrs"
              editNode={editMode &&
                <input value={drafts.sleep} onChange={upd('sleep')} onKeyDown={onKey} style={inp()} />}
              trace={<Bars data={SLEEP_BARS} color="#7B9DFF" height={28} />}
              delta={<Delta value="+ 0.6" tone="pos">wk</Delta>}
            />

          </div>

          {/* ── bottom mini metrics ── */}
          <div style={{
            marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)',
            display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8,
          }}>

            <Mini label="steps" value={h.steps.toLocaleString()}
              editNode={editMode &&
                <input value={drafts.steps} onChange={upd('steps')} onKeyDown={onKey} style={inp(true)} />}
            />

            <ManualMini label="weight" fieldKey="weight" value={h.weight} unit="lbs"
              inlineEdit={inlineEdit} inlineDraft={inlineDraft}
              onStart={startInlineEdit} onSave={saveInlineEdit}
              onCancel={cancelInlineEdit} onDraftChange={setInlineDraft}
            />

            <ManualMini label="vo₂ max" fieldKey="vo2" value={h.vo2}
              inlineEdit={inlineEdit} inlineDraft={inlineDraft}
              onStart={startInlineEdit} onSave={saveInlineEdit}
              onCancel={cancelInlineEdit} onDraftChange={setInlineDraft}
            />

            <Mini label="recovery"
              value={`${h.recovery}%`}
              color={isConnected ? whoopColor('recovery', h.recovery) : undefined}
              editNode={editMode &&
                <input value={drafts.recovery} onChange={upd('recovery')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="sleep perf"
              value={h.sleep_perf ? `${h.sleep_perf}%` : '—'}
              color={isConnected ? whoopColor('sleep_perf', h.sleep_perf) : undefined}
              editNode={editMode &&
                <input value={drafts.sleep_perf} onChange={upd('sleep_perf')} onKeyDown={onKey} style={inp(true)} />}
            />

            <Mini label="day strain"
              value={h.strain > 0 ? `${h.strain}` : '—'}
            />

          </div>

        </>

      )}

      {/* ── WHOOP section ── */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
        <div
          onClick={() => setShowWhoop(s => !s)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <span className="label-micro" style={{ color: 'var(--fg-4)' }}>
            whoop integration
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot, display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.06em' }}>
              {showWhoop ? '▲' : '▼'}
            </span>
          </span>
        </div>

        {showWhoop && (
          <div style={{ marginTop: 8 }}>
            {!isConnected ? (
              <>
                {/* setup instructions */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', lineHeight: 1.6, marginBottom: 8 }}>
                  1. Go to <span style={{ color: 'var(--accent)' }}>developer.whoop.com</span> → create app<br/>
                  2. Set redirect URI: <span style={{ color: 'var(--fg-2)' }}>http://localhost:8765/whoop/callback</span><br/>
                  3. Paste Client ID + Secret below → Connect
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <input
                    value={whoopClientId}
                    onChange={e => setWhoopClientId(e.target.value)}
                    placeholder="Client ID"
                    style={{
                      background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2,
                      padding: '3px 7px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={whoopClientSecret}
                      onChange={e => setWhoopClientSecret(e.target.value)}
                      placeholder="Client Secret"
                      style={{
                        flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border-strong)', borderRadius: 2,
                        padding: '3px 7px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none',
                      }}
                    />
                    <span onClick={() => setShowSecret(s => !s)} style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>
                      <Icon name={showSecret ? 'eye-off' : 'eye'} size={12} />
                    </span>
                  </div>
                  {whoopError && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)' }}>{whoopError}</span>
                  )}
                  <span
                    onClick={connectWhoop}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em', alignSelf: 'flex-start' }}>
                    CONNECT WHOOP →
                  </span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-3)' }}>
                  {whoopStatus === 'live'    && <span style={{ color: 'var(--pos)' }}>● Connected{lastSync ? ` · synced ${lastSync}` : ''}</span>}
                  {whoopStatus === 'syncing' && <span style={{ color: 'var(--warn)' }}>● Syncing…</span>}
                  {whoopStatus === 'error'   && <span style={{ color: 'var(--neg)' }}>● Error: {whoopError}</span>}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span
                    onClick={() => syncWhoop()}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                    SYNC NOW
                  </span>
                  <span
                    onClick={disconnectWhoop}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                    DISCONNECT
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── sub-components ── */

function Tri({ label, value, unit, trace, delta, editNode, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label-micro">{label}</span>
      {editNode || <Kpi value={value} unit={unit} size="md" color={color} />}
      <div style={{ marginTop: 2 }}>{trace}</div>
      <div>{delta}</div>
    </div>
  );
}

/* ManualMini — like Mini but with an always-visible pencil that lets the user
   type in a value inline. Used for weight and VO2 which aren't available via
   the WHOOP API and must be entered manually. Saves to Supabase via setHealth. */
function ManualMini({ label, fieldKey, value, unit, inlineEdit, inlineDraft, onStart, onSave, onCancel, onDraftChange }) {
  const editing = inlineEdit === fieldKey;
  const inpStyle = {
    background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
    padding: '2px 5px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
    fontSize: 12, fontWeight: 500, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="label-micro" style={{
        color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {editing ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            autoFocus
            value={inlineDraft}
            onChange={e => onDraftChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  onSave();
              if (e.key === 'Escape') onCancel();
            }}
            style={inpStyle}
          />
          <span
            onClick={onSave}
            style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 13, lineHeight: 1, flexShrink: 0 }}
          >✓</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
            color: value > 0 ? 'var(--fg-1)' : 'var(--fg-4)',
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1,
          }}>
            {value > 0 ? value : '—'}
            {value > 0 && unit && (
              <span style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 2 }}>{unit}</span>
            )}
          </span>
          <span
            onClick={() => onStart(fieldKey)}
            title={`Edit ${label}`}
            style={{ cursor: 'pointer', color: 'var(--fg-4)', flexShrink: 0, lineHeight: 1 }}
          >
            <Icon name="pencil" size={9} />
          </span>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, unit, tone, color, editNode }) {
  /* color prop (CSS string) takes precedence over legacy tone shorthand */
  const textColor = color
    || (tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--fg-1)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span className="label-micro" style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {editNode || (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
          color: textColor, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
          {unit && <span style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 2 }}>{unit}</span>}
        </span>
      )}
    </div>
  );
}

window.HealthPulse = HealthPulse;
