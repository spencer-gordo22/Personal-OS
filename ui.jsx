/* global React */
const { useState, useEffect } = React;

function Icon({ name, size = 14, color, style }) {
  const key = name.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
  const icon = window.lucide && window.lucide[key];
  const svgStyle = { width: size, height: size, color: color || 'currentColor', display: 'inline-flex', flexShrink: 0, flexGrow: 0, ...style };

  if (!icon) return <span style={svgStyle} />;

  const [, svgAttrs, children = []] = icon;

  function renderChild(child, idx) {
    const [tag, attrs, grandchildren] = child;
    return React.createElement(tag, { ...attrs, key: idx },
      grandchildren ? grandchildren.map((gc, gi) => renderChild(gc, gi)) : null
    );
  }

  return (
    <svg {...svgAttrs} width={size} height={size} style={svgStyle}>
      {children.map((child, i) => renderChild(child, i))}
    </svg>
  );
}

function Card({ icon, label, meta, action, children, style, bodyStyle }) {
  return (
    <div className="card" style={style}>
      <div className="card-header" style={{ gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
          {icon && <Icon name={icon} size={14} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
          <span className="label" style={{ whiteSpace: 'nowrap' }}>{label}</span>
          {meta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>· {meta}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', flexShrink: 0 }}>
          {action}
          <Icon name="more-horizontal" size={14} />
        </div>
      </div>
      <div className="card-body" style={bodyStyle}>{children}</div>
    </div>
  );
}

function Pill({ tone = '', children, dot }) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', marginRight: 2 }} />}
      {children}
    </span>
  );
}

function Kpi({ value, unit, size = 'lg', color, style }) {
  const sizes = { sm: 20, md: 28, lg: 40, xl: 56 };
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontWeight: 500, lineHeight: 1,
      letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums slashed-zero',
      color: color || 'var(--fg-1)', fontSize: sizes[size], whiteSpace: 'nowrap', ...style,
    }}>
      {value}
      {unit && <span style={{ fontSize: sizes[size] * 0.45, color: 'var(--fg-3)', marginLeft: 4 }}>{unit}</span>}
    </div>
  );
}

function Delta({ value, tone = 'flat', children, style }) {
  const colors = { pos: 'var(--pos)', neg: 'var(--neg)', warn: 'var(--warn)', flat: 'var(--fg-3)' };
  const glyphs = { pos: '▲', neg: '▼', warn: '◆', flat: '—' };
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
      fontVariantNumeric: 'tabular-nums', color: colors[tone], whiteSpace: 'nowrap', ...style,
    }}>
      {glyphs[tone]} {value}{children && <span style={{ color: 'var(--fg-3)', marginLeft: 6, whiteSpace: 'nowrap' }}>{children}</span>}
    </span>
  );
}

function Sparkline({ data, stroke = '#00D4FF', fill, height = 36, dots = false }) {
  const w = 100, h = 30;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y];
  });
  const pathStr = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const fillStr = `${pathStr} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {fill && <path d={fillStr} fill={fill} />}
      <path d={pathStr} fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
      {dots && pts.map((p, i) => i === pts.length - 1 && (
        <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={stroke} />
      ))}
    </svg>
  );
}

function Bars({ data, color = '#3DDC97', height = 36 }) {
  const w = 100, h = 30, gap = 0.8;
  const max = Math.max(...data) || 1;
  const bw = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * (h - 2);
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} fill={color} />;
      })}
    </svg>
  );
}

function ProgressBar({ value, max = 100, color = 'var(--accent)', height = 4 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ width: '100%', height, background: 'var(--bg-3)', borderRadius: 1, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 200ms cubic-bezier(0.2,0,0,1)' }} />
    </div>
  );
}

function SectionLbl({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span className="label-micro" style={{ color: 'var(--fg-3)' }}>{children}</span>
      {right}
    </div>
  );
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function useLocalStorage(key, initial) {
  const [val, setValRaw] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {}
    return typeof initial === 'function' ? initial() : initial;
  });

  /* ── Supabase hydration: awaits _supaReady then fetches this key ─────────
     _supaReady is a Promise set by db.js before any JSX loads. Waiting for
     it handles the brief window where the /api/config fetch is in-flight.  */
  useEffect(() => {
    let cancelled = false;
    (window._supaReady || Promise.resolve(null)).then(db => {
      if (!db || cancelled) return;
      db.from('kv_store')
        .select('value')
        .eq('key', key)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) { console.warn('[supa load]', key, error.message); return; }
          if (data && data.value !== undefined) {
            try { localStorage.setItem(key, JSON.stringify(data.value)); } catch {}
            setValRaw(data.value);
          }
        });
    });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(updater) {
    setValRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      /* 1. localStorage — synchronous, zero latency */
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      /* 2. Supabase — async, persists across devices */
      (window._supaReady || Promise.resolve(null)).then(db => {
        if (!db) return;
        db.from('kv_store')
          .upsert({ key, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
          .then(({ error }) => { if (error) console.warn('[supa write]', key, error.message); });
      });
      return next;
    });
  }

  return [val, set];
}

/* ── useIsMobile — returns true on screens ≤ 768px, reactive ── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  );
  useEffect(() => {
    const mq      = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

Object.assign(window, { Icon, Card, Pill, Kpi, Delta, Sparkline, Bars, ProgressBar, SectionLbl, toISO, useLocalStorage, useIsMobile });
