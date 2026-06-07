/* global React, Card, Icon, Skeleton */
const { useState: useStateBJJ, useEffect: useEffectBJJ } = React;

const BJJ_TYPES = ['gi', 'no-gi', 'wrestling'];
const BJJ_TYPE_COLOR = {
  'gi':        'var(--accent)',
  'no-gi':     '#7B9DFF',
  'wrestling': 'var(--warn)',
};

const bjjToday = () => new Date().toISOString().slice(0, 10);
function bjjFmtShort(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-');
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${MON[+m - 1]} ${+d}`;
}

/* SQL shown if the Supabase table doesn't exist yet (anon REST can't run DDL) */
const BJJ_SETUP_SQL = `CREATE TABLE IF NOT EXISTS bjj_sessions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date        date    NOT NULL,
  duration    int     NOT NULL,
  type        text,
  notes       text,
  submissions int,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE bjj_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon rw bjj_sessions" ON bjj_sessions USING (true) WITH CHECK (true);`;

/* ── stat cell (matches SAT/other modules) ── */
function BJJStat({ label, value, unit, color }) {
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

const bInp = {
  width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border-strong)',
  borderRadius: 3, padding: '6px 8px', color: 'var(--fg-1)',
  fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', boxSizing: 'border-box',
};
const bLbl = {
  fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-4)',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3, display: 'block',
};

/* ════════════════════════════════════════════════ main */
function BJJ() {
  const [sessions,  setSessions]  = useStateBJJ([]);
  const [loading,   setLoading]   = useStateBJJ(true);
  const [needSetup, setNeedSetup] = useStateBJJ(false);
  const [sqlCopied, setSqlCopied] = useStateBJJ(false);

  const [showForm, setShowForm] = useStateBJJ(false);
  const [saving,   setSaving]   = useStateBJJ(false);
  const [formErr,  setFormErr]  = useStateBJJ('');

  /* form fields */
  const [fDate, setFDate] = useStateBJJ(bjjToday);
  const [fDur,  setFDur]  = useStateBJJ('');
  const [fType, setFType] = useStateBJJ('gi');
  const [fNotes,setFNotes]= useStateBJJ('');
  const [fSubs, setFSubs] = useStateBJJ('');

  /* ── load ── */
  async function loadAll() {
    setLoading(true);
    const db = await (window._supaReady || Promise.resolve(window._supa || null));
    if (!db) { setLoading(false); return; }
    const { data, error } = await db
      .from('bjj_sessions')
      .select('*')
      .order('date', { ascending: false })
      .limit(100);
    const missing = error && (error.code === 'PGRST205' || /could not find the table/i.test(error.message || ''));
    if (missing) { setNeedSetup(true); setLoading(false); return; }
    setNeedSetup(false);
    if (data) setSessions(data);
    setLoading(false);
  }
  useEffectBJJ(() => { loadAll(); }, []);

  /* ── add a session ── */
  const addSession = async () => {
    setFormErr('');
    const duration = parseInt(fDur, 10);
    if (isNaN(duration) || duration <= 0) { setFormErr('Duration must be a positive number'); return; }
    const subs = fSubs ? parseInt(fSubs, 10) : null;
    if (subs !== null && (isNaN(subs) || subs < 0)) { setFormErr('Submissions must be 0 or more'); return; }

    setSaving(true);
    const db = await (window._supaReady || Promise.resolve(window._supa || null));
    const row = {
      date:        fDate || bjjToday(),
      duration,
      type:        fType,
      notes:       fNotes.trim() || null,
      submissions: subs,
    };
    console.log('[BJJ] insert bjj_sessions:', row);
    const { data, error } = await db.from('bjj_sessions').insert(row).select().single();
    console.log('[BJJ] response → data:', data, ' error:', error);
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setSessions(prev => [data, ...prev]);
    setFDur(''); setFNotes(''); setFSubs(''); setFDate(bjjToday());
    setShowForm(false);
  };

  const copySql = () => {
    navigator.clipboard?.writeText(BJJ_SETUP_SQL).then(() => {
      setSqlCopied(true); setTimeout(() => setSqlCopied(false), 2000);
    }).catch(() => {});
  };

  /* ── computed stats ── */
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const thisWeek = sessions.filter(s => s.date >= weekAgoStr).length;
  const lastDate = sessions.length
    ? [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date
    : null;

  return (
    <Card
      icon="swords"
      label="bjj / combat"
      meta={loading ? '…' : `${sessions.length} logged`}
      action={
        !showForm && !needSetup ? (
          <span onClick={() => { setShowForm(true); setFormErr(''); }} title="Log a session"
            style={{ cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
            <Icon name="plus" size={14} />
          </span>
        ) : null
      }
    >
      {/* ── setup banner (table missing) ── */}
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
            WebkitOverflowScrolling: 'touch',
          }}>{BJJ_SETUP_SQL}</pre>
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

      {/* ── stats row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 8px',
        marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)',
      }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Skeleton width="60%" height={8} />
              <Skeleton width="45%" height={15} />
            </div>
          ))
        ) : (
          <>
            <BJJStat label="this week"     value={thisWeek}        unit="x" color="var(--warn)" />
            <BJJStat label="total"         value={sessions.length} />
            <BJJStat label="last session"  value={lastDate ? bjjFmtShort(lastDate) : '—'} />
          </>
        )}
      </div>

      {/* ── log form ── */}
      {showForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>LOG SESSION</span>
            <span onClick={() => setShowForm(false)} style={{ cursor: 'pointer', color: 'var(--fg-4)', display: 'flex' }}>
              <Icon name="x" size={13} />
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={bLbl}>Date</span>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={bInp} />
            </div>
            <div style={{ width: 96 }}>
              <span style={bLbl}>Minutes</span>
              <input type="number" value={fDur} onChange={e => setFDur(e.target.value)} placeholder="60" style={bInp} />
            </div>
          </div>
          {/* type selector */}
          <div>
            <span style={bLbl}>Type</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {BJJ_TYPES.map(t => (
                <span key={t} onClick={() => setFType(t)} className="sos-tap" style={{
                  flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 4, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: fType === t ? BJJ_TYPE_COLOR[t] : 'transparent',
                  color:      fType === t ? '#001218'         : BJJ_TYPE_COLOR[t],
                  border:     `1px solid ${BJJ_TYPE_COLOR[t]}`,
                  opacity:    fType === t ? 1 : 0.5,
                }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={bLbl}>Notes</span>
              <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="rolled well, worked guard" style={bInp} />
            </div>
            <div style={{ width: 96 }}>
              <span style={bLbl}>Subs hit</span>
              <input type="number" value={fSubs} onChange={e => setFSubs(e.target.value)} placeholder="2" style={bInp} />
            </div>
          </div>
          {formErr && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--neg)' }}>{formErr}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <span onClick={() => setShowForm(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', cursor: 'pointer', padding: '6px 8px', letterSpacing: '0.06em' }}>CANCEL</span>
            <span onClick={addSession} className="sos-tap" style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
              background: (fDur && !saving) ? 'var(--accent)' : 'var(--bg-3)',
              color:      (fDur && !saving) ? '#001218'        : 'var(--fg-4)',
            }}>{saving ? 'SAVING…' : 'SAVE'}</span>
          </div>
        </div>
      )}

      {/* ── recent sessions (last 3) ── */}
      {!loading && !needSetup && (
        sessions.length === 0 ? (
          !showForm && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.04em', padding: '2px 0' }}>
              no sessions yet — tap ＋ to log one
            </div>
          )
        ) : (
          <div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              recent
            </div>
            {sessions.slice(0, 3).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', width: 46, flexShrink: 0 }}>{bjjFmtShort(s.date)}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: BJJ_TYPE_COLOR[s.type] || 'var(--fg-3)', width: 58, flexShrink: 0,
                }}>{s.type || '—'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-2)', width: 42, flexShrink: 0 }}>{s.duration}m</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {s.notes || (s.submissions != null ? `${s.submissions} subs` : '—')}
                </span>
                {s.submissions != null && s.notes && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--pos)', flexShrink: 0 }}>{s.submissions} subs</span>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  );
}

window.BJJ = BJJ;
