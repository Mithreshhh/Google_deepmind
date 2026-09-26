const CATEGORY_LABEL = { bugs: 'Bug', security: 'Security', quality: 'Quality' };

export default function AnalysisCard({ finding, category, onApplyFix, fixing, fixDisabled, onFocus, stale }) {
  return (
    <article className={`finding sev-border-${finding.severity} ${stale ? 'is-stale' : ''}`}>
      <div className="finding-top">
        <span className={`sev sev-${finding.severity}`}>{finding.severity}</span>
        <span className={`cat cat-${category}`}>{CATEGORY_LABEL[category]}</span>
        {finding.line && (
          <button className="line-chip mono" onClick={() => onFocus(finding.line)} title="Jump to line">
            L{finding.line}
          </button>
        )}
      </div>
      <h4 className="finding-title">{finding.title}</h4>
      {finding.description && <p className="finding-desc">{finding.description}</p>}
      {finding.suggestion && (
        <p className="finding-suggestion">
          <span className="suggestion-label">Suggested action</span>
          {finding.suggestion}
        </p>
      )}
      <div className="finding-actions">
        <button className={`btn-fix ${fixing ? 'is-busy' : ''}`} onClick={() => onApplyFix(finding, category)} disabled={fixDisabled || stale}>
          {fixing ? (
            <>
              <span className="mini-spinner" /> Gemini is rewriting…
            </>
          ) : (
            <>✦ Apply AI Fix</>
          )}
        </button>
      </div>
    </article>
  );
}
