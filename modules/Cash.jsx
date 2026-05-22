/* global React, Card, Kpi, Delta, Sparkline, ProgressBar, Icon, useLocalStorage */
const { useState: useStateCash } = React;

const CASH_TREND = [3.8, 3.2, 4.1, 5.6, 5.2, 4.8, 5.4, 6.1, 6.8, 6.2, 6.4, 7.1, 7.4, 7.0, 7.8];

const INITIAL_BUDGET = [
  { name: 'food',          spent: 0, total: 1800, color: 'var(--pos)'  },
  { name: 'leisure',       spent: 0, total:  600, color: 'var(--neg)'  },
  { name: 'subscriptions', spent: 0, total:  240, color: 'var(--warn)' },
];
const CAT_COLORS = ['var(--pos)', 'var(--neg)', 'var(--warn)', 'var(--accent)', '#7B9DFF'];
const FREQ_OPTS   = ['monthly', 'annual', 'weekly'];
const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function budgetMeta() {
  const d = new Date();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - d.getDate();
  return { month: MONTH_NAMES[d.getMonth()], daysLeft };
}

const MONO = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

const iBase = {
  background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
  padding: '2px 5px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
  fontSize: 11, outline: 'none', boxSizing: 'border-box',
};
const iStyle = (w) => ({ ...iBase, width: w });
const iFlexStyle = { ...iBase, flex: 1, minWidth: 0 };

function fmtAmt(amount) {
  return `${amount >= 0 ? '+ ' : '− '}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

/* ── section header row ─────────────────────────── */
function SecHeader({ label, count, open, onToggle }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span className="label-micro">
        {label}
        {count > 0 && (
          <span style={{ marginLeft: 5, color: 'var(--fg-4)' }}>· {count}</span>
        )}
      </span>
      <span
        onClick={onToggle}
        title={open ? 'Cancel' : `Add ${label}`}
        style={{ cursor: 'pointer', color: open ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
        <Icon name={open ? 'x' : 'plus'} size={12} />
      </span>
    </div>
  );
}

/* ── delete x ───────────────────────────────────── */
function DelBtn({ onClick }) {
  return (
    <span
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--neg)', opacity: 0.3, transition: 'opacity 120ms' }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}>
      <Icon name="x" size={10} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════ */
function Cash() {
  const [cashData, setCashData]       = useLocalStorage('sos_cash_v2',        { balance: 0 });
  const [budget, setBudget]           = useLocalStorage('sos_budget_v2',      INITIAL_BUDGET);
  const [transactions, setTx]         = useLocalStorage('sos_transactions',   []);
  const [subscriptions, setSubs]      = useLocalStorage('sos_subscriptions',  []);

  /* ── balance edit ── */
  const [editBal, setEditBal]         = useStateCash(false);
  const [balVal,  setBalVal]          = useStateCash('');

  /* ── budget edit mode ── */
  const [editMode, setEditMode]       = useStateCash(false);
  const [active,   setActive]         = useStateCash(null);   // { i, field }
  const [activeVal, setActiveVal]     = useStateCash('');
  const [newName,  setNewName]        = useStateCash('');
  const [newBudget, setNewBudget]     = useStateCash('');

  /* ── add transaction ── */
  const [showAddTx,  setShowAddTx]    = useStateCash(false);
  const [txName,     setTxName]       = useStateCash('');
  const [txAmount,   setTxAmount]     = useStateCash('');

  /* ── add subscription ── */
  const [showAddSub, setShowAddSub]   = useStateCash(false);
  const [subName,    setSubName]      = useStateCash('');
  const [subAmount,  setSubAmount]    = useStateCash('');
  const [subFreq,    setSubFreq]      = useStateCash('monthly');

  const balance = cashData.balance ?? 0;

  /* balance */
  const openBal   = () => { setEditBal(true); setBalVal(String(balance)); };
  const commitBal = () => {
    const n = parseFloat(balVal.replace(/[^0-9.]/g, ''));
    if (!isNaN(n)) setCashData(s => ({ ...s, balance: Math.round(n) }));
    setEditBal(false);
  };

  /* inline budget field */
  const openField   = (i, field, val) => { setActive({ i, field }); setActiveVal(String(val)); };
  const commitField = () => {
    if (!active) return;
    const { i, field } = active;
    if (field === 'name') {
      const v = activeVal.trim().toLowerCase();
      if (v) setBudget(b => b.map((x, idx) => idx === i ? { ...x, name: v } : x));
    } else {
      const n = parseFloat(activeVal.replace(/[^0-9.]/g, ''));
      if (!isNaN(n)) setBudget(b => b.map((x, idx) => idx === i ? { ...x, [field]: Math.round(n) } : x));
    }
    setActive(null);
  };
  const fieldKey = (e) => { if (e.key === 'Enter') commitField(); if (e.key === 'Escape') setActive(null); };
  const is       = (i, f) => active?.i === i && active?.field === f;

  /* category add / remove */
  const removeCat = (i) => setBudget(b => b.filter((_, idx) => idx !== i));
  const addCat    = () => {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    const total = parseInt(newBudget) || 500;
    setBudget(b => [...b, { name, spent: 0, total, color: CAT_COLORS[b.length % CAT_COLORS.length] }]);
    setNewName(''); setNewBudget('');
  };

  /* transactions */
  const submitTx = () => {
    const name   = txName.trim();
    const amount = parseFloat(txAmount);
    if (!name || isNaN(amount)) return;
    const now  = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    setTx(prev => [{ id: Date.now(), time, name, amount }, ...prev]);
    setTxName(''); setTxAmount(''); setShowAddTx(false);
  };
  const txKey  = (e) => { if (e.key === 'Enter') submitTx(); if (e.key === 'Escape') setShowAddTx(false); };
  const removeTx = (id) => setTx(prev => prev.filter(t => t.id !== id));

  /* subscriptions */
  const submitSub = () => {
    const name   = subName.trim();
    const amount = parseFloat(subAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    setSubs(prev => [...prev, { id: Date.now(), name, amount, freq: subFreq }]);
    setSubName(''); setSubAmount(''); setShowAddSub(false);
  };
  const subKey   = (e) => { if (e.key === 'Enter') submitSub(); if (e.key === 'Escape') setShowAddSub(false); };
  const removeSub = (id) => setSubs(prev => prev.filter(s => s.id !== id));

  /* ════════════════════════════════════════ render */
  return (
    <Card icon="wallet" label="chase checking" meta="LIVE"
      action={
        <span onClick={() => setEditMode(m => !m)} title={editMode ? 'Done editing budget' : 'Edit budget'}
          style={{ cursor: 'pointer', color: editMode ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
          <Icon name={editMode ? 'check' : 'pencil'} size={13} />
        </span>
      }>

      {/* ── balance ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div className="label-micro" style={{ marginBottom: 6 }}>balance</div>
          {editBal ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--fg-3)' }}>$</span>
              <input autoFocus value={balVal} onChange={e => setBalVal(e.target.value)}
                onBlur={commitBal}
                onKeyDown={e => { if (e.key === 'Enter') commitBal(); if (e.key === 'Escape') setEditBal(false); }}
                style={{ width: 130, background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 8px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, outline: 'none' }}
              />
            </div>
          ) : (
            <div onClick={openBal} title="Click to update balance" style={{ cursor: 'pointer' }}>
              <Kpi value={`$ ${balance.toLocaleString()}`} size="lg" />
            </div>
          )}
        </div>
        <Delta value="+ $ 3,554" tone="pos">30d</Delta>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <Sparkline data={CASH_TREND} stroke="#3DDC97" fill="rgba(61,220,151,0.08)" height={36} dots />
      </div>

      {/* ── budget ── */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {(() => { const bm = budgetMeta(); return (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="label-micro">budget · {bm.month}</span>
          <span className="label-micro" style={{ color: 'var(--fg-3)' }}>{bm.daysLeft} days left</span>
        </div>
        ); })()}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {budget.map((c, i) => {
            const pct  = Math.round((c.spent / c.total) * 100);
            const over = c.spent > c.total;
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                  {editMode && is(i, 'name') ? (
                    <input autoFocus value={activeVal} onChange={e => setActiveVal(e.target.value)} onBlur={commitField} onKeyDown={fieldKey} style={iStyle(90)} />
                  ) : (
                    <span
                      onClick={editMode ? () => openField(i, 'name', c.name) : undefined}
                      style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: editMode ? 'text' : 'default' }}>
                      {c.name}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {is(i, 'spent') ? (
                      <input autoFocus value={activeVal} onChange={e => setActiveVal(e.target.value)} onBlur={commitField} onKeyDown={fieldKey} style={iStyle(62)} />
                    ) : (
                      <span onClick={() => openField(i, 'spent', c.spent)} title="Edit spent"
                        style={{ ...MONO, fontSize: 11, color: over ? 'var(--neg)' : 'var(--fg-1)', cursor: 'pointer' }}>
                        $ {c.spent.toLocaleString()}
                      </span>
                    )}
                    <span style={{ ...MONO, fontSize: 11, color: 'var(--fg-3)' }}> / </span>
                    {is(i, 'total') ? (
                      <input autoFocus value={activeVal} onChange={e => setActiveVal(e.target.value)} onBlur={commitField} onKeyDown={fieldKey} style={iStyle(62)} />
                    ) : (
                      <span onClick={() => openField(i, 'total', c.total)} title="Edit budget"
                        style={{ ...MONO, fontSize: 11, color: 'var(--fg-3)', cursor: 'pointer' }}>
                        {c.total.toLocaleString()}
                        <span style={{ marginLeft: 5 }}>{pct}%</span>
                      </span>
                    )}
                    {editMode && (
                      <span onClick={() => removeCat(i)} style={{ marginLeft: 4, color: 'var(--neg)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Icon name="x" size={11} />
                      </span>
                    )}
                  </span>
                </div>
                <ProgressBar value={Math.min(c.spent, c.total)} max={c.total} color={c.color} height={4} />
              </div>
            );
          })}

          {editMode && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
              <Icon name="plus" size={11} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCat()} placeholder="category name"
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-1)', padding: '2px 0' }}
              />
              <input value={newBudget} onChange={e => setNewBudget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCat()} placeholder="$ limit"
                style={{ width: 56, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', textAlign: 'right', padding: '2px 0' }}
              />
              <span onClick={addCat} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer' }}>ADD</span>
            </div>
          )}
        </div>
      </div>

      {/* ── transactions ── */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <SecHeader
          label="transactions"
          count={transactions.length}
          open={showAddTx}
          onToggle={() => { setShowAddTx(s => !s); setTxName(''); setTxAmount(''); }}
        />

        {showAddTx && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 10 }}>
            <input
              autoFocus
              value={txName}
              onChange={e => setTxName(e.target.value)}
              onKeyDown={txKey}
              placeholder="description"
              style={iFlexStyle}
            />
            <input
              value={txAmount}
              onChange={e => setTxAmount(e.target.value)}
              onKeyDown={txKey}
              placeholder="amount"
              style={iStyle(72)}
            />
            <span onClick={submitTx} style={{ ...MONO, fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>ADD</span>
          </div>
        )}

        {transactions.length === 0 ? (
          <div style={{ ...MONO, fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 0 6px' }}>
            no transactions · press + to add
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {transactions.map(t => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto 14px', alignItems: 'center', gap: 8 }}>
                <span style={{ ...MONO, fontSize: 10, color: 'var(--fg-3)' }}>{t.time}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={{ ...MONO, fontSize: 12, color: t.amount >= 0 ? 'var(--pos)' : 'var(--fg-1)' }}>{fmtAmt(t.amount)}</span>
                <DelBtn onClick={() => removeTx(t.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── subscriptions ── */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <SecHeader
          label="subscriptions"
          count={subscriptions.length}
          open={showAddSub}
          onToggle={() => { setShowAddSub(s => !s); setSubName(''); setSubAmount(''); setSubFreq('monthly'); }}
        />

        {showAddSub && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              autoFocus
              value={subName}
              onChange={e => setSubName(e.target.value)}
              onKeyDown={subKey}
              placeholder="name"
              style={iFlexStyle}
            />
            <input
              value={subAmount}
              onChange={e => setSubAmount(e.target.value)}
              onKeyDown={subKey}
              placeholder="$/mo"
              style={iStyle(60)}
            />
            <select
              value={subFreq}
              onChange={e => setSubFreq(e.target.value)}
              style={{ ...iBase, width: 76, cursor: 'pointer' }}>
              {FREQ_OPTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <span onClick={submitSub} style={{ ...MONO, fontSize: 10, color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em' }}>ADD</span>
          </div>
        )}

        {subscriptions.length === 0 ? (
          <div style={{ ...MONO, fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 0 6px' }}>
            no subscriptions · press + to add
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {subscriptions.map(s => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto 14px', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ ...MONO, fontSize: 12, color: 'var(--fg-1)' }}>
                  ${s.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ ...MONO, fontSize: 9, color: 'var(--fg-3)', background: 'var(--bg-3)', padding: '2px 5px', borderRadius: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {s.freq}
                </span>
                <DelBtn onClick={() => removeSub(s.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

    </Card>
  );
}

window.Cash = Cash;
