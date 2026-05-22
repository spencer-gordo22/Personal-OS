/* global React, Card, Kpi, Delta, Sparkline, Bars, Icon, useLocalStorage */
const { useState: useStateHP, useEffect: useEffectHP } = React;

const HR_DATA    = [58, 60, 59, 62, 61, 60, 58, 59, 57, 58, 59, 58];
const SLEEP_BARS = [6.8, 7.2, 6.4, 7.8, 8.1, 6.9, 7.4];

const INITIAL_HEALTH = {
  hr:       0,
  hrv:      0,
  sleep:    0,
  steps:    0,
  weight:   0,
  vo2:      0,
  recovery: 0,
};

const inp = (full) => ({
  background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
  padding: '3px 6px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
  fontSize: 13, fontWeight: 500, outline: 'none',
  width: full ? '100%' : 62, boxSizing: 'border-box',
});

function HealthPulse() {
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

  /* ── auto-sync once on mount if token present ── */
  useEffectHP(() => {
    if (whoopToken && whoopToken.access_token) {
      syncWhoop(whoopToken.access_token);
    }
  }, []);

  async function syncWhoop(token) {
    setWhoopStatus('syncing');
    setWhoopError('');
    try {
      const [recRes, sleepRes] = await Promise.all([
        fetch(`/whoop/data?endpoint=recovery&token=${encodeURIComponent(token)}`),
        fetch(`/whoop/data?endpoint=sleep&token=${encodeURIComponent(token)}`),
      ]);
      if (!recRes.ok || !sleepRes.ok) throw new Error(`HTTP ${recRes.status}/${sleepRes.status}`);
      const recJson   = await recRes.json();
      const sleepJson = await sleepRes.json();

      /* parse recovery */
      const rec     = recJson.records?.[0];
      const sleepRec = sleepJson.records?.[0]?.score;

      setHealth(h => ({
        ...h,
        recovery: rec?.score?.recovery_score       ?? h.recovery,
        hrv:      rec?.score?.hrv_rmssd_milli != null
                    ? Math.round(rec.score.hrv_rmssd_milli)
                    : h.hrv,
        hr:       rec?.score?.resting_heart_rate   ?? h.hr,
        sleep:    sleepRec?.total_in_bed_time_milli != null
                    ? parseFloat((sleepRec.total_in_bed_time_milli / 3600000).toFixed(1))
                    : h.sleep,
      }));

      setLastSync(new Date().toLocaleTimeString());
      setWhoopStatus('live');
    } catch (err) {
      setWhoopStatus('error');
      setWhoopError(err.message);
    }
  }

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
      hr:       String(health.hr),
      hrv:      String(health.hrv),
      sleep:    String(health.sleep),
      steps:    String(health.steps),
      weight:   String(health.weight),
      vo2:      String(health.vo2),
      recovery: String(health.recovery),
    });
    setEditMode(true);
  };

  const commitEdit = () => {
    const pf = (s, fb) => { const n = parseFloat(s); return isNaN(n) ? fb : n; };
    const pi = (s, fb) => { const n = parseInt(s);   return isNaN(n) ? fb : n; };
    setHealth({
      hr:       pi(drafts.hr,       health.hr),
      hrv:      pi(drafts.hrv,      health.hrv),
      sleep:    pf(drafts.sleep,    health.sleep),
      steps:    pi(drafts.steps,    health.steps),
      weight:   pf(drafts.weight,   health.weight),
      vo2:      pf(drafts.vo2,      health.vo2),
      recovery: pi(drafts.recovery, health.recovery),
    });
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

      {/* ── top 3 big metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        <Tri label="resting hr" value={String(h.hr)} unit="bpm"
          editNode={editMode &&
            <input autoFocus value={drafts.hr} onChange={upd('hr')} onKeyDown={onKey} style={inp()} />}
          trace={<Sparkline data={HR_DATA} stroke="#3DDC97" height={28} />}
          delta={<Delta value={String(h.hr)} tone="flat">7d</Delta>}
        />

        <Tri label="hrv" value={String(h.hrv)} unit="ms"
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

      {/* ── bottom 4 mini metrics ── */}
      <div style={{
        marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
      }}>

        <Mini label="steps" value={h.steps.toLocaleString()}
          editNode={editMode &&
            <input value={drafts.steps} onChange={upd('steps')} onKeyDown={onKey} style={inp(true)} />}
        />

        <Mini label="weight" value={`${h.weight} kg`}
          editNode={editMode &&
            <input value={drafts.weight} onChange={upd('weight')} onKeyDown={onKey} style={inp(true)} />}
        />

        <Mini label="vo₂" value={String(h.vo2)}
          editNode={editMode &&
            <input value={drafts.vo2} onChange={upd('vo2')} onKeyDown={onKey} style={inp(true)} />}
        />

        <Mini label="recovery" value={`${h.recovery} %`} tone="pos"
          editNode={editMode &&
            <input value={drafts.recovery} onChange={upd('recovery')} onKeyDown={onKey} style={inp(true)} />}
        />

      </div>

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
                    onClick={() => syncWhoop(whoopToken.access_token)}
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

function Tri({ label, value, unit, trace, delta, editNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="label-micro">{label}</span>
      {editNode || <Kpi value={value} unit={unit} size="md" />}
      <div style={{ marginTop: 2 }}>{trace}</div>
      <div>{delta}</div>
    </div>
  );
}

function Mini({ label, value, tone, editNode }) {
  const colors = { pos: 'var(--pos)', neg: 'var(--neg)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label-micro" style={{ color: 'var(--fg-3)' }}>{label}</span>
      {editNode || (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500,
          color: tone ? colors[tone] : 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
      )}
    </div>
  );
}

window.HealthPulse = HealthPulse;
