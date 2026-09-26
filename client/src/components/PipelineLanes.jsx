import { useEffect, useState } from 'react';

const LANES = [
  { key: 'bugs', label: 'Bug analyzer' },
  { key: 'security', label: 'Security analyzer' },
  { key: 'quality', label: 'Quality analyzer' },
  { key: 'verify', label: 'Verifier' },
];

// Gantt view of one analysis run: three lanes start together, the verifier starts when they finish.
export default function PipelineLanes({ analyzers, runStart, demo }) {
  const running = Object.values(analyzers).some((a) => a.state === 'running');
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 80);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = runStart ? Math.max(0, now - runStart) : 0;
  const span = (a, key) => {
    const start = key === 'verify' ? a.startAt ?? null : 0;
    if (start == null) return null;
    const end = a.state === 'running' ? elapsed : a.at ?? null;
    if (end == null) return null;
    return [start, Math.max(end, start)];
  };
  const spans = Object.fromEntries(LANES.map((l) => [l.key, analyzers[l.key] ? span(analyzers[l.key], l.key) : null]));
  const ends = Object.values(spans).filter(Boolean).map((s) => s[1]);
  const scale = Math.max(1200, ...ends) * 1.04;
  const parallelEnd = analyzers.verify?.startAt;
  const total = running ? elapsed : Math.max(0, ...ends);

  return (
    <div className="pipeline">
      <div className="pipeline-head">
        <span className="eyebrow">Reasoning pipeline</span>
        <span className="mono muted">
          {demo ? 'demo fallback' : runStart ? `${(total / 1000).toFixed(2)}s${running ? '' : ' total'}` : 'idle'}
        </span>
      </div>
      <div className="lanes">
        {LANES.map((l) => {
          const a = analyzers[l.key] || { state: 'idle' };
          const s = spans[l.key];
          const left = s ? (s[0] / scale) * 100 : 0;
          const width = s ? Math.max(1.5, ((s[1] - s[0]) / scale) * 100) : 0;
          let right = '';
          if (a.state === 'running') right = '…';
          else if (a.state === 'error') right = 'failed';
          else if (a.state === 'waiting') right = 'queued';
          else if (a.state === 'done') right = a.ms != null && !demo ? `${(a.ms / 1000).toFixed(2)}s` : 'done';
          return (
            <div className={`lane lane-${l.key} lane-${a.state}`} key={l.key}>
              <span className="lane-label">{l.label}</span>
              <div className="lane-track">
                {parallelEnd != null && <div className="lane-marker" style={{ left: `${(parallelEnd / scale) * 100}%` }} />}
                {s && <div className="lane-bar" style={{ left: `${left}%`, width: `${width}%` }} />}
              </div>
              <span className="lane-value mono">{right}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
