/* global React, Card, Icon, useLocalStorage */
const { useState: useStateInv, useEffect: useEffectInv } = React;

/* ─────────────────────────────────────────────
   Initial positions with real shares + avg cost.
   Key sos_positions_v2 ensures a clean start;
   edit any row by clicking its shares or basis.
   ───────────────────────────────────────────── */
const INITIAL_POSITIONS = [
  { sym: 'QQQ', shares: 0.738, basis: 613.44 },
  { sym: 'GLD', shares: 1.207, basis: 376.18 },
  { sym: 'ETN', shares: 0.334, basis: 402.99 },
  { sym: 'VOO', shares: 0.637, basis: 619.45 },
];

/* ─── number helpers ──────────────────────────── */
const d$  = (n, dec = 0) =>
  n == null ? '—'
  : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const d2  = (n)  => n == null ? '—' : `$${Math.abs(n).toFixed(2)}`;
const pct = (n)  => n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.abs(n).toFixed(2)}%`;
const clr = (n)  => n == null ? 'var(--fg-3)' : n > 0 ? 'var(--pos)' : n < 0 ? 'var(--neg)' : 'var(--fg-2)';
const sgn = (n)  => n == null ? '' : n >= 0 ? '+' : '−';

/* ─── shared styles ───────────────────────────── */
const MONO = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

// column template: sym | shares | price/basis | value | gain$/% | day% | ×
const COL = '38px 40px 66px 68px 80px 50px 14px';

const baseInp = {
  background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 2,
  padding: '2px 4px', color: 'var(--fg-1)', fontFamily: 'var(--font-mono)',
  fontSize: 11, outline: 'none', width: '100%', textAlign: 'right', boxSizing: 'border-box',
};

/* ════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════ */
function Investments() {

  /* ── persistent positions ── */
  const [positions, setPositions] = useLocalStorage('sos_positions_v2', INITIAL_POSITIONS);

  /* ── live quote data ── */
  const [live,      setLive]      = useStateInv(null);
  const [status,    setStatus]    = useStateInv('idle');
  const [updatedAt, setUpdatedAt] = useStateInv(null);

  /* ── inline field edit ── */
  const [editing, setEditing] = useStateInv(null);  // { idx, field }
  const [editVal, setEditVal] = useStateInv('');

  /* ── add-position form ── */
  const [showAdd,   setShowAdd]   = useStateInv(false);
  const [addSym,    setAddSym]    = useStateInv('');
  const [addShares, setAddShares] = useStateInv('');
  const [addBasis,  setAddBasis]  = useStateInv('');
  const [addErr,    setAddErr]    = useStateInv('');
  const [addBusy,   setAddBusy]   = useStateInv(false);

  /* ── live-data fetch: re-runs whenever the symbol list changes ── */
  const symsKey = positions.map(p => p.sym).join(',');

  useEffectInv(() => {
    if (!symsKey) return;
    let dead = false;

    const go = async () => {
      setStatus('syncing');
      try {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(symsKey)}`);
        const j = await r.json();
        if (dead) return;
        if (!j.ok) throw new Error(j.error || 'bad response');
        setLive(j.quotes);
        setUpdatedAt(new Date());
        setStatus('live');
      } catch {
        if (!dead) setStatus(s => s === 'live' ? 'live' : 'stale');
      }
    };

    go();
    const id = setInterval(go, 60_000);
    return () => { dead = true; clearInterval(id); };
  }, [symsKey]);

  /* ── per-row derived values ── */
  const rows = positions.map(p => {
    const lq      = live?.[p.sym];
    const price   = lq?.price ?? null;
    const value   = price !== null ? p.shares * price : null;
    const cost    = p.shares * p.basis;
    const gain$   = value !== null && p.basis > 0 ? value - cost : null;
    const gainPct = price !== null && p.basis > 0 ? ((price - p.basis) / p.basis) * 100 : null;
    const dayChg  = lq ? p.shares * lq.dayChange : null;
    return { ...p, lq, price, value, cost, gain$, gainPct, dayChg };
  });

  /* ── portfolio totals ── */
  const hasLive      = rows.some(r => r.value !== null);
  const totalValue   = hasLive ? rows.reduce((s, r) => s + (r.value ?? 0), 0)    : null;
  const totalCost    = rows.reduce((s, r) => s + r.cost, 0);
  const totalGain$   = totalValue !== null && totalCost > 0 ? totalValue - totalCost : null;
  const totalGainPct = totalGain$ !== null && totalCost > 0 ? (totalGain$ / totalCost) * 100 : null;
  const totalDay$    = hasLive ? rows.reduce((s, r) => s + (r.dayChg ?? 0), 0)   : null;
  const totalDayPct  = totalDay$ !== null && totalValue > 0
    ? (totalDay$ / (totalValue - totalDay$)) * 100 : null;

  /* ── inline edit handlers ── */
  const openEdit = (idx, field, val) => { setEditing({ idx, field }); setEditVal(String(val)); };

  const commitEdit = () => {
    if (!editing) return;
    const n = parseFloat(editVal);
    if (!isNaN(n) && n >= 0) {
      const { idx, field } = editing;
      setPositions(prev => prev.map((p, i) =>
        i === idx ? { ...p, [field]: field === 'shares' ? n : +n.toFixed(4) } : p
      ));
    }
    setEditing(null);
  };

  const editKey = (e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); };
  const isEd    = (idx, field) => editing?.idx === idx && editing?.field === field;

  /* ── add-position flow ── */
  const cancelAdd = () => {
    setShowAdd(false); setAddSym(''); setAddShares(''); setAddBasis(''); setAddErr('');
  };

  const submitAdd = async () => {
    const sym    = addSym.trim().toUpperCase();
    const shares = parseFloat(addShares);
    const basis  = parseFloat(addBasis);
    if (!sym)                               return setAddErr('Ticker required');
    if (isNaN(shares) || shares <= 0)       return setAddErr('Enter a valid share count');
    if (isNaN(basis)  || basis  < 0)        return setAddErr('Enter a valid cost basis');
    if (positions.find(p => p.sym === sym)) return setAddErr(`${sym} is already in your portfolio`);

    setAddErr(''); setAddBusy(true);
    try {
      const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(sym)}`);
      const j = await r.json();
      if (!j.ok || !j.quotes?.[sym]?.price) throw new Error('Symbol not found — double-check the ticker');
      setPositions(prev => [...prev, { sym, shares, basis }]);
      setLive(prev => ({ ...(prev ?? {}), ...j.quotes }));
      setStatus('live');
      setUpdatedAt(new Date());
      cancelAdd();
    } catch (e) {
      setAddErr(e.message || 'Fetch failed — server may be unreachable');
    } finally {
      setAddBusy(false);
    }
  };

  const removePos = (idx) => setPositions(prev => prev.filter((_, i) => i !== idx));

  /* ── status meta / dot ── */
  const fmtT    = (d) => d?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) ?? '';
  const metaTxt = { idle: 'MKT', syncing: 'SYNCING…', live: `LIVE · ${fmtT(updatedAt)}`, stale: 'STALE' }[status] ?? 'MKT';
  const dotClr  = { idle: 'var(--fg-3)', syncing: 'var(--accent)', live: 'var(--pos)', stale: 'var(--warn)' }[status];

  /* ════════════════════════════════════════════ render */
  return (
    <Card icon="trending-up" label="personal investments" meta={metaTxt}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* live-status dot */}
          <span title={`data: ${status}`} style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: dotClr, display: 'inline-block',
            boxShadow: status === 'live' ? '0 0 6px var(--pos)' : 'none',
            transition: 'background 400ms, box-shadow 400ms',
          }} />
          {/* add position toggle */}
          <span onClick={() => { setShowAdd(s => !s); setAddErr(''); }}
            title={showAdd ? 'Cancel' : 'Add position'}
            style={{ cursor: 'pointer', color: showAdd ? 'var(--accent)' : 'var(--fg-3)', display: 'flex', alignItems: 'center' }}>
            <Icon name={showAdd ? 'x' : 'plus'} size={13} />
          </span>
        </div>
      }>

      {/* ══ portfolio summary ══════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <PfKpi
          label="portfolio value"
          value={totalValue !== null ? `$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
        />
        <PfKpi
          label="total gain / loss"
          value={totalGain$ !== null ? `${sgn(totalGain$)}${d$(totalGain$)}` : '—'}
          sub={pct(totalGainPct)}
          n={totalGain$}
        />
        <PfKpi
          label="today's change"
          value={totalDay$ !== null ? `${sgn(totalDay$)}${d$(totalDay$)}` : '—'}
          sub={pct(totalDayPct)}
          n={totalDay$}
        />
      </div>

      {/* ══ holdings table — scrolls horizontally on narrow screens ═══════ */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -4px', padding: '0 4px' }}>
      <div style={{ minWidth: 360 }}>

        {/* column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 6, marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
          {['sym', 'shares ✎', 'price / basis ✎', 'value', 'gain / %', 'day', ''].map((h, i) => (
            <span key={i} className="label-micro" style={{ color: 'var(--fg-4)', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>

        {/* rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map((r, idx) => (
            <div key={r.sym} style={{ display: 'grid', gridTemplateColumns: COL, gap: 6, alignItems: 'center' }}>

              {/* symbol */}
              <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--fg-1)', letterSpacing: '0.04em' }}>
                {r.sym}
              </span>

              {/* shares — click to edit */}
              {isEd(idx, 'shares') ? (
                <input autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit} onKeyDown={editKey}
                  style={baseInp}
                />
              ) : (
                <span
                  onClick={() => openEdit(idx, 'shares', r.shares)}
                  title="Click to edit shares"
                  style={{ ...MONO, fontSize: 12, color: r.shares > 0 ? 'var(--fg-1)' : 'var(--fg-4)', cursor: 'text', textAlign: 'right' }}>
                  {r.shares > 0 ? (Number.isInteger(r.shares) ? r.shares : r.shares.toFixed(4).replace(/\.?0+$/, '')) : '—'}
                </span>
              )}

              {/* price (live) + avg cost (click to edit) stacked */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: 12, color: 'var(--fg-1)' }}>
                  {r.price !== null ? d2(r.price) : status === 'syncing' ? '…' : '—'}
                </div>
                {isEd(idx, 'basis') ? (
                  <input autoFocus value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit} onKeyDown={editKey}
                    style={{ ...baseInp, fontSize: 10, marginTop: 3 }}
                  />
                ) : (
                  <div
                    onClick={() => openEdit(idx, 'basis', r.basis)}
                    title="Click to edit avg cost basis"
                    style={{ ...MONO, fontSize: 9, color: 'var(--fg-3)', cursor: 'text', marginTop: 3 }}>
                    {r.basis > 0 ? `${d2(r.basis)} avg` : 'set basis'}
                  </div>
                )}
              </div>

              {/* current value */}
              <span style={{ ...MONO, fontSize: 12, color: 'var(--fg-1)', textAlign: 'right' }}>
                {r.value !== null ? d$(r.value) : '—'}
              </span>

              {/* gain $ + gain % stacked */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: 12, color: clr(r.gain$) }}>
                  {r.gain$ !== null ? `${sgn(r.gain$)}${d$(r.gain$)}` : '—'}
                </div>
                <div style={{ ...MONO, fontSize: 9, color: clr(r.gainPct), marginTop: 3 }}>
                  {pct(r.gainPct)}
                </div>
              </div>

              {/* day % */}
              <span style={{ ...MONO, fontSize: 11, textAlign: 'right', color: clr(r.lq?.dayPct) }}>
                {r.lq
                  ? `${r.lq.dayPct >= 0 ? '▲' : '▼'}${Math.abs(r.lq.dayPct).toFixed(2)}%`
                  : '—'}
              </span>

              {/* delete */}
              <span
                onClick={() => removePos(idx)}
                title="Remove position"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--neg)', opacity: 0.35, transition: 'opacity 120ms' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.35'}>
                <Icon name="x" size={11} />
              </span>

            </div>
          ))}
        </div>
      </div>{/* /minWidth wrapper */}
      </div>{/* /overflowX scroll container */}

      {/* ══ add position form ══════════════════════════════ */}
      {showAdd && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div className="label-micro" style={{ marginBottom: 8, color: 'var(--fg-3)' }}>add position</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <AInp
              placeholder="TICKER"
              value={addSym}
              onChange={e => setAddSym(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && submitAdd()}
              w={58}
            />
            <AInp
              placeholder="shares"
              value={addShares}
              onChange={e => setAddShares(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAdd()}
              w={66}
            />
            <AInp
              placeholder="avg cost $"
              value={addBasis}
              onChange={e => setAddBasis(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitAdd()}
              w={80}
            />
            <span
              onClick={!addBusy ? submitAdd : undefined}
              style={{ ...MONO, fontSize: 10, letterSpacing: '0.06em', color: addBusy ? 'var(--fg-4)' : 'var(--accent)', cursor: addBusy ? 'default' : 'pointer' }}>
              {addBusy ? 'FETCHING…' : 'ADD'}
            </span>
            <span onClick={cancelAdd}
              style={{ ...MONO, fontSize: 10, letterSpacing: '0.06em', color: 'var(--fg-3)', cursor: 'pointer' }}>
              CANCEL
            </span>
          </div>
          {addErr && (
            <div style={{
              marginTop: 8, padding: '5px 8px',
              background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.35)',
              borderRadius: 3, color: 'var(--neg)',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.03em',
            }}>
              ⚠ {addErr}
            </div>
          )}
          <div style={{ ...MONO, fontSize: 9, color: 'var(--fg-4)', marginTop: 8, letterSpacing: '0.04em' }}>
            FOR QQQ · GLD · VOO · ETN: CLICK SHARES OR BASIS IN THE TABLE TO EDIT
          </div>
        </div>
      )}

    </Card>
  );
}

/* ── Portfolio KPI stat ─────────────────────────── */
function PfKpi({ label, value, sub, n }) {
  const valColor = n == null ? 'var(--fg-1)' : clr(n);
  return (
    <div>
      <div className="label-micro" style={{ color: 'var(--fg-3)', marginBottom: 5 }}>{label}</div>
      <div style={{ ...MONO, fontSize: 15, fontWeight: 500, color: n != null ? valColor : 'var(--fg-1)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...MONO, fontSize: 10, color: n != null ? valColor : 'var(--fg-3)', marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── Add-position input ─────────────────────────── */
function AInp({ placeholder, value, onChange, onKeyDown, w }) {
  return (
    <input
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{
        background: 'var(--bg-3)', border: '1px solid var(--border-strong)',
        borderRadius: 2, padding: '3px 6px', color: 'var(--fg-1)',
        fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', width: w,
      }}
    />
  );
}

window.Investments = Investments;
