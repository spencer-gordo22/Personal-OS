/* global React, Card, ProgressBar */

const MACROS = [
  { name: 'protein', value: 138, target: 180, unit: 'g', color: 'var(--pos)' },
  { name: 'carbs',   value: 218, target: 250, unit: 'g', color: 'var(--accent)' },
  { name: 'fat',     value:  64, target:  80, unit: 'g', color: 'var(--warn)' },
];

function Nutrition() {
  return (
    <Card icon="apple" label="nutrition" meta="2,108 / 2,400 KCAL">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* calorie bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>kcal · day</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>2,108 / 2,400</span>
          </div>
          <ProgressBar value={2108} max={2400} color="var(--accent)" height={6} />
        </div>

        {MACROS.map(m => (
          <div key={m.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-2)', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {m.value} / {m.target} {m.unit}
              </span>
            </div>
            <ProgressBar value={m.value} max={m.target} color={m.color} height={4} />
          </div>
        ))}

        <div style={{
          marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          <Meal time="07:42" kcal="412"  name="oats · berries"   />
          <Meal time="12:30" kcal="824"  name="rice · chicken"   />
          <Meal time="19:00" kcal="—"    name="dinner · pending" pending />
        </div>
      </div>
    </Card>
  );
}

function Meal({ time, kcal, name, pending }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.04em' }}>{time}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: pending ? 'var(--fg-3)' : 'var(--fg-1)' }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: pending ? 'var(--warn)' : 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>{kcal} kcal</span>
    </div>
  );
}

window.Nutrition = Nutrition;
