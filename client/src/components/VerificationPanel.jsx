const ICON = { passed: '✓', failed: '✕', warning: '⚠' };

function ScoreRing({ score }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const tone = score == null ? 'none' : score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad';
  return (
    <svg className={`ring ring-${tone}`} viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
      <circle cx="42" cy="42" r={r} className="ring-track" />
      <circle cx="42" cy="42" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 42 42)" />
    </svg>
  );
}

export default function VerificationPanel({ verification, state, fresh, findingCount, deltaScore, error }) {
  const tests = verification?.tests || [];
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const warned = tests.filter((t) => t.status === 'warning').length;
  const running = state === 'running';
  const waiting = state === 'waiting';

  return (
    <div className={`verification ${!fresh && verification && !running ? 'is-stale' : ''}`}>
      <div className="verify-score">
        <div className="ring-wrap">
          <ScoreRing score={running ? null : verification?.score ?? null} />
          <div className="ring-text">{running ? <span className="mini-spinner" /> : <strong>{verification?.score ?? '–'}</strong>}</div>
        </div>
        <div className="verify-meta">
          <div className="eyebrow">Verification score</div>
          <div className="score-line">
            <strong>{running ? '…' : verification?.score ?? '–'}</strong> / 100
            {deltaScore ? (
              <span className={`delta ${deltaScore > 0 ? 'delta-good' : 'delta-bad'}`}>{deltaScore > 0 ? `+${deltaScore}` : deltaScore}</span>
            ) : null}
          </div>
          <div className="score-sub">
            {running && `Gemini verifier is reviewing ${findingCount} finding${findingCount === 1 ? '' : 's'}…`}
            {waiting && 'Waiting for parallel analyzers…'}
            {!running && !waiting && verification && (
              <>
                <span className="ok">✓ {passed} confirmed</span>
                {warned > 0 && <span className="warn">⚠ {warned} possible issue{warned === 1 ? '' : 's'}</span>}
                {failed > 0 && <span className="bad">✕ {failed} failing</span>}
              </>
            )}
            {!running && !waiting && !verification && (error || 'Runs after the analyzers finish.')}
          </div>
        </div>
      </div>

      {verification?.summary && !running && <p className="verify-summary">{verification.summary}</p>}

      <div className="checks-head">
        <span className="eyebrow">AI verification checks</span>
        <span className="muted">reasoned by the model, not executed</span>
      </div>
      <ul className="checks">
        {running &&
          [0, 1, 2, 3].map((i) => (
            <li className="check skeleton" key={i}>
              <div className="sk sk-row" style={{ width: `${60 + i * 8}%` }} />
            </li>
          ))}
        {!running &&
          tests.map((t, i) => (
            <li className={`check check-${t.status}`} key={`${t.name}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="check-icon">{ICON[t.status]}</span>
              <div className="check-body">
                <div className="check-name">{t.name}</div>
                {t.input && <div className="check-io mono">input: {t.input}</div>}
                {t.reason && <div className="check-reason">{t.reason}</div>}
              </div>
            </li>
          ))}
        {!running && tests.length === 0 && <li className="check-empty muted">No checks yet.</li>}
      </ul>
      {!running && tests.length > 0 && (
        <div className="checks-foot mono">
          {passed} / {tests.length} checks pass
        </div>
      )}
    </div>
  );
}
