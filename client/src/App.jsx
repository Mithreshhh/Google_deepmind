import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import AnalysisPanel from './components/AnalysisPanel.jsx';
import PipelineLanes from './components/PipelineLanes.jsx';
import VerificationPanel from './components/VerificationPanel.jsx';
import ActivityTimeline from './components/ActivityTimeline.jsx';
import { SAMPLE_CODE, LANGUAGES } from './sample.js';
import { ApiError, analyzeStream, requestFix, fetchHealth } from './api.js';
import { demoAnalyze, demoFix } from './demo.js';

const DEBOUNCE_MS = 800;
const MIN_CHARS = 20;
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const CATS = ['bugs', 'security', 'quality'];
const LABEL = { bugs: 'Bug analyzer', security: 'Security analyzer', quality: 'Quality analyzer' };
const EMPTY = { bugs: [], security: [], quality: [] };
const IDLE = { bugs: { state: 'idle' }, security: { state: 'idle' }, quality: { state: 'idle' }, verify: { state: 'idle' } };
const RUNNING = { bugs: { state: 'running' }, security: { state: 'running' }, quality: { state: 'running' }, verify: { state: 'waiting' } };
const ALL_FRESH = { bugs: true, security: true, quality: true, verify: true };
const NOT_FRESH = { bugs: false, security: false, quality: false, verify: false };

const TRIGGER_MSG = {
  initial: 'Initial analysis triggered',
  retry: 'Retrying analysis',
  language: 'Language changed, analysis triggered',
  reset: 'Analyzing restored sample',
  user: 'Typing paused, analysis triggered',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function changedLineNumbers(before, after) {
  const old = new Set(before.split('\n').map((l) => l.trim()));
  return after
    .split('\n')
    .map((l, i) => (l.trim() && !old.has(l.trim()) ? i + 1 : null))
    .filter(Boolean);
}

// Loose title match so we can tell whether a fixed issue came back after re-analysis.
function stillPresent(issue, list) {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || []);
  const target = words(issue.title);
  return list.some((f) => {
    const w = words(f.title);
    let overlap = 0;
    target.forEach((x) => w.has(x) && overlap++);
    return overlap >= Math.max(1, Math.ceil(target.size / 2));
  });
}

const cancelRunning = (a) =>
  Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.state === 'running' || v.state === 'waiting' ? { state: 'idle' } : v]));

export default function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState('javascript');
  const [status, setStatus] = useState('watching');
  const [findings, setFindings] = useState(EMPTY);
  const [dismissed, setDismissed] = useState([]);
  const [verification, setVerification] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [analyzers, setAnalyzers] = useState(IDLE);
  const [fresh, setFresh] = useState(NOT_FRESH);
  const [hasResults, setHasResults] = useState(false);
  const [runStart, setRunStart] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [fixingId, setFixingId] = useState(null);
  const [demoActive, setDemoActive] = useState(false);
  const [health, setHealth] = useState(null);
  const [deltas, setDeltas] = useState(null);
  const [focus, setFocus] = useState(null);
  const [changed, setChanged] = useState(null);
  const [debounceTick, setDebounceTick] = useState(0);

  const reqId = useRef(0);
  const inFlight = useRef(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const eventId = useRef(0);
  const lastAnalyzed = useRef(null);
  const changeSource = useRef('init');
  const burst = useRef(false);
  const pendingFix = useRef(null);
  const snapshot = useRef(null);
  const statusRef = useRef(status);
  const restoreStatus = useRef('watching');
  const codeRef = useRef(code);
  statusRef.current = status;
  codeRef.current = code;

  const log = useCallback((msg, kind = 'info', ms) => {
    eventId.current += 1;
    const evt = { id: eventId.current, t: new Date(), msg, kind, ms };
    setEvents((list) => [evt, ...list].slice(0, 15));
  }, []);

  useEffect(() => {
    fetchHealth().then((h) => setHealth(h || false));
  }, []);

  // Compare with the previous run so a fix visibly moves the counts and score.
  const finishRun = useCallback(
    (final) => {
      const counts = Object.fromEntries(CATS.map((c) => [c, final.findings[c].length]));
      const score = final.verification?.score ?? null;
      const prev = snapshot.current;
      const fix = pendingFix.current;
      pendingFix.current = null;
      if (fix && prev) {
        const d = Object.fromEntries(CATS.map((c) => [c, counts[c] - prev.counts[c]]));
        if (score != null && prev.score != null) d.score = score - prev.score;
        setDeltas(d);
        const before = CATS.reduce((s, c) => s + prev.counts[c], 0);
        const after = CATS.reduce((s, c) => s + counts[c], 0);
        if (!stillPresent(fix.issue, final.findings[fix.category])) log(`Resolved: ${fix.issue.title}`, 'verified');
        log(`Re-analysis: ${before} → ${after} findings${d.score != null ? `, score ${prev.score} → ${score}` : ''}`, 'verified');
      }
      snapshot.current = { counts, score };
    },
    [log]
  );

  const runDemo = useCallback(
    async (src, id, key) => {
      const isCurrent = () => id === reqId.current;
      const t0 = performance.now();
      const at = () => Math.round(performance.now() - t0);
      const result = demoAnalyze(src);
      setDemoActive(true);
      setError(null);
      setStatus('analyzing');
      setRunStart(t0);
      setAnalyzers(RUNNING);
      for (const c of ['security', 'bugs', 'quality']) {
        await wait(220 + Math.random() * 260);
        if (!isCurrent()) return;
        setAnalyzers((a) => ({ ...a, [c]: { state: 'done', at: at() } }));
        setFindings((f) => ({ ...f, [c]: result.findings[c] }));
        setFresh((f) => ({ ...f, [c]: true }));
        log(`${LABEL[c]} finished (demo): ${plural(result.findings[c].length, 'finding')}`, 'done');
      }
      setStatus('verifying');
      setAnalyzers((a) => ({ ...a, verify: { state: 'running', startAt: at() } }));
      log('Verification started (demo)', 'start');
      await wait(450);
      if (!isCurrent()) return;
      setAnalyzers((a) => ({ ...a, verify: { ...a.verify, state: 'done', at: at() } }));
      setVerification(result.verification);
      setDismissed([]);
      setFresh(ALL_FRESH);
      inFlight.current = false;
      lastAnalyzed.current = key;
      setHasResults(true);
      setLastRun({ demo: true });
      setStatus('verified');
      log(`Verification completed (demo): score ${result.verification.score}/100`, 'verified');
      finishRun(result);
    },
    [log, finishRun]
  );

  const runAnalysis = useCallback(
    async (src, lang, reason) => {
      const key = `${lang}\n${src}`;
      if (key === lastAnalyzed.current) {
        setFresh(ALL_FRESH);
        setStatus(restoreStatus.current);
        return;
      }
      const id = ++reqId.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      inFlight.current = true;
      const isCurrent = () => id === reqId.current;
      const t0 = performance.now();
      const at = () => Math.round(performance.now() - t0);

      setError(null);
      setVerifyError(null);
      setDeltas(null);
      setStatus('analyzing');
      setRunStart(t0);
      setAnalyzers(RUNNING);
      setFresh(NOT_FRESH);
      if (reason !== 'fix') log(TRIGGER_MSG[reason] || TRIGGER_MSG.user, 'trigger');
      CATS.forEach((c) => log(`${LABEL[c]} started`, 'start'));

      let final = null;
      try {
        await analyzeStream({
          code: src,
          language: lang,
          signal: ctrl.signal,
          onEvent: (evt) => {
            if (!isCurrent()) return;
            switch (evt.type) {
              case 'analyzer_done':
                setAnalyzers((a) => ({ ...a, [evt.key]: { state: 'done', ms: evt.ms, at: at() } }));
                setFindings((f) => ({ ...f, [evt.key]: evt.findings }));
                setFresh((f) => ({ ...f, [evt.key]: true }));
                log(`${LABEL[evt.key]} finished: ${plural(evt.findings.length, 'finding')}`, 'done', evt.ms);
                break;
              case 'analyzer_error':
                setAnalyzers((a) => ({ ...a, [evt.key]: { state: 'error', ms: evt.ms, at: at() } }));
                setFindings((f) => ({ ...f, [evt.key]: [] }));
                setFresh((f) => ({ ...f, [evt.key]: true }));
                log(`${LABEL[evt.key]} failed: ${evt.error}`, 'error');
                break;
              case 'parallel_done':
                log('Parallel analysis completed', 'done', evt.ms);
                break;
              case 'verify_start':
                setStatus('verifying');
                setAnalyzers((a) => ({ ...a, verify: { state: 'running', startAt: at() } }));
                log('Verification started', 'start');
                break;
              case 'verify_done': {
                setAnalyzers((a) => ({ ...a, verify: { ...a.verify, state: 'done', ms: evt.ms, at: at() } }));
                setFindings(evt.findings);
                setDismissed(evt.dismissed || []);
                setVerification(evt.verification);
                setFresh(ALL_FRESH);
                const n = evt.dismissed?.length || 0;
                log(
                  `Verification completed: ${evt.verification.score}/100${n ? `, ${plural(n, 'false positive')} removed` : ''}`,
                  'verified',
                  evt.ms
                );
                break;
              }
              case 'verify_error':
                setAnalyzers((a) => ({ ...a, verify: { ...a.verify, state: 'error', at: at() } }));
                setVerification(null);
                setVerifyError(evt.error);
                setFresh((f) => ({ ...f, verify: true }));
                log(`Verification failed: ${evt.error}`, 'error');
                break;
              case 'error':
                throw new ApiError(evt.error, 'STREAM_ERROR');
              case 'result':
                final = evt.result;
                break;
              default:
                break;
            }
          },
        });
        if (!isCurrent()) return;
        if (!final) throw new ApiError('Analysis ended unexpectedly. Edit the code to retry.', 'INCOMPLETE');
        const durationMs = Math.round(performance.now() - t0);
        inFlight.current = false;
        lastAnalyzed.current = key;
        setHasResults(true);
        setDemoActive(false);
        setLastRun({ durationMs, demo: false });
        setStatus(final.verification ? 'verified' : 'analyzed');
        log(`Analysis completed in ${(durationMs / 1000).toFixed(2)}s`, 'verified');
        finishRun({ findings: { bugs: final.bugs, security: final.security, quality: final.quality }, verification: final.verification });
      } catch (err) {
        if (err.name === 'AbortError' || !isCurrent()) return;
        if (DEMO_MODE) {
          log(`Gemini unavailable (${err.message}). Using DEMO MODE fallback.`, 'error');
          await runDemo(src, id, key);
          return;
        }
        inFlight.current = false;
        setError({ message: err.message, code: err.code });
        setStatus('error');
        setAnalyzers((a) =>
          Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.state === 'running' || v.state === 'waiting' ? { ...v, state: 'error', at: at() } : v]))
        );
        log(`API error: ${err.message}`, 'error');
      }
    },
    [log, finishRun, runDemo]
  );

  // Live change detection: every edit invalidates in-flight work, then waits for a typing pause.
  useEffect(() => {
    const source = changeSource.current;
    changeSource.current = 'user';
    clearTimeout(timerRef.current);

    if (source === 'init') {
      log('Workspace loaded. AI is watching the editor.', 'info');
      timerRef.current = setTimeout(() => runAnalysis(code, language, 'initial'), 400);
      return;
    }

    reqId.current += 1;
    abortRef.current?.abort();
    if (inFlight.current) {
      inFlight.current = false;
      setAnalyzers(cancelRunning);
      log('Code changed mid-analysis, outdated request cancelled', 'warn');
    }

    if (code.trim().length < MIN_CHARS) {
      burst.current = false;
      setStatus('watching');
      return;
    }
    if (source === 'user' && !burst.current) {
      burst.current = true;
      log('Code changed, waiting for typing to pause', 'change');
    }
    if (statusRef.current !== 'typing' && statusRef.current !== 'analyzing' && statusRef.current !== 'verifying') {
      restoreStatus.current = statusRef.current;
    }
    setStatus('typing');
    setFresh(NOT_FRESH);
    setDebounceTick((t) => t + 1);
    timerRef.current = setTimeout(() => {
      burst.current = false;
      runAnalysis(code, language, source);
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language]);

  const applyFix = useCallback(
    async (issue, category) => {
      if (fixingId) return;
      const before = codeRef.current;
      setFixingId(issue.id);
      log(`AI fix requested: ${issue.title}`, 'fix');
      const t0 = performance.now();
      try {
        let fixed;
        if (demoActive && issue.demoRule) fixed = demoFix(before, issue);
        else fixed = (await requestFix({ code: before, language, issue })).fixedCode;

        if (codeRef.current !== before) {
          log('Code changed while the fix was generating. Fix discarded.', 'warn');
          return;
        }
        if (fixed.trim() === before.trim()) {
          log('AI fix returned no changes', 'warn');
          return;
        }
        pendingFix.current = { issue, category };
        setChanged({ lines: changedLineNumbers(before, fixed), nonce: Date.now() });
        changeSource.current = 'fix';
        setCode(fixed);
        log('AI fix applied, re-analysis triggered', 'fix', demoActive ? undefined : Math.round(performance.now() - t0));
      } catch (err) {
        log(`AI fix failed: ${err.message}`, 'error');
        setError({ message: `AI fix failed: ${err.message}`, code: err.code });
      } finally {
        setFixingId(null);
      }
    },
    [fixingId, demoActive, language, log]
  );

  const retry = () => {
    lastAnalyzed.current = null;
    runAnalysis(codeRef.current, language, 'retry');
  };

  const changeLanguage = (e) => {
    const next = e.target.value;
    changeSource.current = 'language';
    log(`Language set to ${LANGUAGES.find((l) => l.id === next)?.label}`, 'change');
    setLanguage(next);
  };

  const resetSample = () => {
    if (code === SAMPLE_CODE && language === 'javascript') return;
    changeSource.current = 'reset';
    log('Sample code restored', 'change');
    setLanguage('javascript');
    setCode(SAMPLE_CODE);
  };

  // Only show squiggles for results that match the code currently in the editor.
  const markers = useMemo(
    () => CATS.flatMap((c) => (fresh[c] ? findings[c].map((f) => ({ ...f, category: c })) : [])),
    [findings, fresh]
  );
  const findingCount = CATS.reduce((s, c) => s + findings[c].length, 0);
  const file = LANGUAGES.find((l) => l.id === language)?.file || 'main';
  const lineCount = code.split('\n').length;

  const hint = {
    watching: code.trim().length < MIN_CHARS ? 'Write a little more code and CodePulse starts analyzing.' : 'Watching for changes.',
    typing: `Change detected. Analysis starts when you pause (${DEBOUNCE_MS}ms).`,
    analyzing: '3 Gemini analyzers running in parallel on this exact version.',
    verifying: 'Verifier is cross-checking findings and generating checks.',
    verified: 'Verified. Keep typing and CodePulse re-runs automatically.',
    analyzed: 'Analyzed. Verification unavailable for this run.',
    error: 'Analysis paused. Edit the code or retry.',
  }[status];
  const footHint = fixingId ? 'Gemini is rewriting the code for the selected issue…' : hint;

  return (
    <div className="app">
      <Header status={status} health={health} lastRun={lastRun} demoActive={demoActive} />

      {error && (
        <div className="error-banner" role="alert">
          <span className="error-icon">!</span>
          <div className="error-text">
            <strong>{error.message}</strong>
            {error.code === 'NO_API_KEY' && (
              <span>
                {' '}
                Add <code>GEMINI_API_KEY</code> to <code>.env</code> in the project root and restart <code>npm run dev</code>.
              </span>
            )}
          </div>
          <button className="btn-ghost" onClick={retry}>
            Retry
          </button>
          <button className="btn-ghost" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <main className="workspace">
        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <div className="file-tab">
              <span className={`file-dot dot-${status}`} />
              <span className="mono">{file}</span>
            </div>
            <select className="lang-select" value={language} onChange={changeLanguage} aria-label="Language">
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="toolbar-spacer" />
            <span className="muted mono small">{lineCount} lines</span>
            <button className="btn-ghost" onClick={resetSample}>
              Reset sample
            </button>
          </div>
          <div className="debounce-track">
            <div key={debounceTick} className={`debounce-bar ${status === 'typing' ? 'run' : ''}`} style={{ animationDuration: `${DEBOUNCE_MS}ms` }} />
          </div>
          <CodeEditor value={code} language={language} onChange={setCode} markers={markers} focus={focus} changed={changed} />
          <div className={`editor-foot foot-${fixingId ? 'analyzing' : status}`}>
            <span className="foot-pulse" />
            {footHint}
          </div>
        </section>

        <AnalysisPanel
          findings={findings}
          dismissed={dismissed}
          analyzers={analyzers}
          fresh={fresh}
          hasResults={hasResults}
          verification={verification}
          deltas={deltas}
          onApplyFix={applyFix}
          fixingId={fixingId}
          blocked={status === 'error'}
          onFocus={(line) => setFocus({ line, nonce: Date.now() })}
        />

        <section className="panel side-panel">
          <PipelineLanes analyzers={analyzers} runStart={runStart} demo={demoActive} />
          <VerificationPanel
            verification={verification}
            state={analyzers.verify?.state}
            fresh={fresh.verify}
            findingCount={findingCount}
            deltaScore={deltas?.score}
            error={verifyError}
          />
        </section>
      </main>

      <ActivityTimeline events={events} />
    </div>
  );
}
