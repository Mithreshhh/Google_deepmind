const STATUS = {
  watching: { label: 'Watching', icon: '●', cls: 'watching' },
  typing: { label: 'Change detected', icon: '◌', cls: 'typing' },
  analyzing: { label: 'Analyzing…', icon: '◌', cls: 'analyzing' },
  verifying: { label: 'Verifying…', icon: '◌', cls: 'verifying' },
  verified: { label: 'Verified', icon: '✓', cls: 'verified' },
  analyzed: { label: 'Analyzed', icon: '✓', cls: 'verified' },
  error: { label: 'Needs attention', icon: '!', cls: 'error' },
};

export default function StatusIndicator({ status }) {
  const s = STATUS[status] || STATUS.watching;
  const spinning = status === 'analyzing' || status === 'verifying';
  return (
    <div className={`status-indicator status-${s.cls}`} role="status" aria-live="polite">
      <span className={`status-icon ${spinning ? 'spin' : ''}`}>{s.icon}</span>
      <span>{s.label}</span>
    </div>
  );
}
