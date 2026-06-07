/* global React, Card, toISO, useLocalStorage */

const PROMPTS = [
  'what is one thing you avoided today',
  'what did you do that was hard',
  'what are you grateful for',
  'what would you do differently',
  'what drained you vs. energized you',
];

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function Journal() {
  const today = toISO(new Date());
  const [journalData, setJournalData] = useLocalStorage('sos_journal', {});

  const text = journalData[today] || '';
  const entryCount = Object.values(journalData).filter(v => v && v.trim()).length;
  const prompt = PROMPTS[new Date().getDay() % PROMPTS.length];
  const wc = wordCount(text);

  const handleChange = (e) => {
    const val = e.target.value;
    setJournalData(d => ({ ...d, [today]: val }));
  };

  return (
    <Card icon="notebook-pen" label="journal" meta={`${entryCount} ENTRIES`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)',
        }}>
          PROMPT · {prompt}
        </div>

        <textarea
          value={text}
          onChange={handleChange}
          placeholder="start writing…"
          rows={4}
          style={{
            width: '100%', minHeight: 76, resize: 'vertical',
            background: 'var(--bg-1)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '10px 12px',
            fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.65,
            color: 'var(--fg-1)', outline: 'none',
            boxSizing: 'border-box', transition: 'border-color 120ms',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        <div style={{
          paddingTop: 8, borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          <span>{wc} words · {entryCount} entries</span>
          <span style={{ fontSize: 10, color: wc > 0 ? 'var(--pos)' : 'var(--fg-4)' }}>
            {wc > 0 ? '● saved' : '○ empty'}
          </span>
        </div>
      </div>
    </Card>
  );
}

window.Journal = Journal;
