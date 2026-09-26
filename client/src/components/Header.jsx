import StatusIndicator from './StatusIndicator.jsx';

export default function Header({ status, health, lastRun, demoActive }) {
  const keyMissing = health && !health.apiKeyConfigured;
  const offline = health === false;
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <path d="M3 17h6l3-7 5 13 3-6h9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1>CodePulse AI</h1>
          <p className="tagline">AI that reacts while you code.</p>
        </div>
      </div>

      <div className="header-right">
        {lastRun && !lastRun.demo && (
          <span className="chip chip-muted mono" title="Real round-trip time for 3 parallel analyzers plus verification">
            Analysis completed in {(lastRun.durationMs / 1000).toFixed(2)}s
          </span>
        )}
        {demoActive && <span className="chip chip-demo">DEMO MODE · sample data</span>}
        {keyMissing && <span className="chip chip-danger">Gemini API key not configured</span>}
        {offline && <span className="chip chip-danger">Backend offline</span>}
        {health?.model && <span className="chip chip-muted mono">{health.model}</span>}
        <StatusIndicator status={status} />
        <div className={`live-pill ${keyMissing || offline ? 'live-off' : ''}`}>
          <span className="live-dot" />
          LIVE AI WATCHING
        </div>
      </div>
    </header>
  );
}
