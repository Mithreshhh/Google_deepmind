import { useState } from 'react';
import AnalysisCard from './AnalysisCard.jsx';

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];
const TILES = [
  { key: 'bugs', label: 'Bug Analysis', unit: ['issue', 'issues'] },
  { key: 'security', label: 'Security', unit: ['vulnerability', 'vulnerabilities'] },
  { key: 'quality', label: 'Code Quality', unit: ['suggestion', 'suggestions'] },
];

function TileState({ a }) {
  if (a?.state === 'running') return <span className="tile-state"><span className="mini-spinner" /> running</span>;
  if (a?.state === 'error') return <span className="tile-state tile-error">failed</span>;
  if (a?.state === 'done' && a.ms != null) return <span className="tile-state mono">{(a.ms / 1000).toFixed(2)}s</span>;
  if (a?.state === 'done') return <span className="tile-state">demo</span>;
  return <span className="tile-state">idle</span>;
}

export default function AnalysisPanel({
  findings, dismissed, analyzers, fresh, hasResults, verification, deltas,
  onApplyFix, fixingId, onFocus, blocked,
}) {
  const [filter, setFilter] = useState('all');
  const [showDismissed, setShowDismissed] = useState(false);

  const cats = filter === 'all' ? TILES.map((t) => t.key) : [filter];
  const list = cats
    .flatMap((c) => findings[c].map((f) => ({ f, c })))
    .sort((a, b) => SEV_ORDER.indexOf(a.f.severity) - SEV_ORDER.indexOf(b.f.severity));
  const anyRunning = cats.some((c) => analyzers[c]?.state === 'running');
  const firstLoad = !hasResults && anyRunning;
  const allFresh = cats.every((c) => fresh[c]);

  return (
    <section className="panel analysis-panel">
      <div className="panel-head">
        <h2>Live Intelligence</h2>
        <span className="panel-sub">3 Gemini analyzers run in parallel on every pause</span>
      </div>

      <div className="tiles">
        {TILES.map((t) => {
          const n = findings[t.key].length;
          const a = analyzers[t.key];
          const d = deltas?.[t.key];
          return (
            <button
              key={t.key}
              className={`tile tile-${t.key} ${filter === t.key ? 'is-active' : ''} ${a?.state === 'running' ? 'is-running' : ''}`}
              onClick={() => setFilter(filter === t.key ? 'all' : t.key)}
            >
              <span className="tile-label">{t.label}</span>
              <span className="tile-count">
                {a?.state === 'running' && !fresh[t.key] ? '…' : a?.state === 'error' ? '–' : n}
                {d ? <span className={`delta ${d < 0 ? 'delta-good' : 'delta-bad'}`}>{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</span> : null}
              </span>
              <span className="tile-unit">{t.unit[n === 1 ? 0 : 1]}</span>
              <TileState a={a} />
            </button>
          );
        })}
        <div className={`tile tile-verify ${analyzers.verify?.state === 'running' ? 'is-running' : ''}`}>
          <span className="tile-label">Verification</span>
          <span className="tile-count">
            {verification ? verification.score : '–'}
            <small>/100</small>
            {deltas?.score ? <span className={`delta ${deltas.score > 0 ? 'delta-good' : 'delta-bad'}`}>{deltas.score > 0 ? `+${deltas.score}` : deltas.score}</span> : null}
          </span>
          <span className="tile-unit">score</span>
          <TileState a={analyzers.verify?.state === 'waiting' ? { state: 'idle' } : analyzers.verify} />
        </div>
      </div>

      <div className="findings-head">
        <span>{filter === 'all' ? 'All findings' : TILES.find((t) => t.key === filter).label}</span>
        <span className="muted">{list.length} shown{!allFresh && hasResults ? ' · updating' : ''}</span>
      </div>

      <div className="findings-scroll">
        {!firstLoad && list.length === 0 && hasResults && allFresh && (
          <div className="empty-state">
            <div className="empty-icon">✓</div>
            <p>No meaningful issues in this view.</p>
          </div>
        )}

        {!firstLoad && !hasResults && list.length === 0 && (
          <div className="empty-state">
            <p className="muted">{blocked ? 'No results yet. Resolve the error above, then edit or retry.' : 'Start typing. CodePulse analyzes automatically when you pause.'}</p>
          </div>
        )}

        {list.map(({ f, c }) => (
          <AnalysisCard
            key={`${c}-${f.id}-${f.title}`}
            finding={f}
            category={c}
            stale={!fresh[c]}
            fixing={fixingId === f.id}
            fixDisabled={Boolean(fixingId)}
            onApplyFix={onApplyFix}
            onFocus={onFocus}
          />
        ))}

        {firstLoad &&
          [0, 1, 2].map((i) => (
            <div className="finding skeleton" key={i}>
              <div className="sk sk-row" style={{ width: '32%' }} />
              <div className="sk sk-row" style={{ width: '78%' }} />
              <div className="sk sk-row" style={{ width: '92%' }} />
            </div>
          ))}

        {dismissed.length > 0 && (
          <div className="dismissed">
            <button className="dismissed-toggle" onClick={() => setShowDismissed(!showDismissed)}>
              {showDismissed ? '▾' : '▸'} Verifier dismissed {dismissed.length} likely false positive{dismissed.length === 1 ? '' : 's'}
            </button>
            {showDismissed &&
              dismissed.map((d) => (
                <div className="dismissed-item" key={`${d.category}-${d.id}`}>
                  <span className="strike">{d.title}</span>
                  <span className="muted"> · {d.dismissReason || 'not supported by the code'}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
