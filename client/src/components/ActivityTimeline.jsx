const fmt = (d) => d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function ActivityTimeline({ events }) {
  return (
    <section className="panel timeline">
      <div className="panel-head">
        <h2>Activity Timeline</h2>
        <span className="panel-sub">every stage as it happens, newest first</span>
      </div>
      <ol className="timeline-list">
        {events.length === 0 && <li className="muted">Waiting for activity…</li>}
        {events.map((e) => (
          <li key={e.id} className={`tl tl-${e.kind}`}>
            <span className="tl-time mono">{fmt(e.t)}</span>
            <span className="tl-dot" />
            <span className="tl-msg">{e.msg}</span>
            {e.ms != null && <span className="tl-ms mono">{(e.ms / 1000).toFixed(2)}s</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
