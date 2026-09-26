import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { MODEL, AppError, ANALYZER_KEYS, hasApiKey, runAnalyzer, runVerifier, runFix } from './gemini.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const MAX_CODE = 30000;

function validateCode(body) {
  const code = typeof body?.code === 'string' ? body.code : '';
  const language = typeof body?.language === 'string' ? body.language.slice(0, 20) : 'javascript';
  if (code.trim().length < 10) throw new AppError('Code is too short to analyze.', 'TOO_SHORT', 400);
  if (code.length > MAX_CODE) throw new AppError(`Code is too long (max ${MAX_CODE} chars).`, 'TOO_LONG', 413);
  return { code, language };
}

function sendError(res, err) {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : 'SERVER_ERROR';
  const message = err instanceof AppError ? err.message : 'Unexpected server error.';
  if (!(err instanceof AppError)) console.error(err);
  res.status(status).json({ error: message, code });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'codepulse-ai', model: MODEL, apiKeyConfigured: hasApiKey(), time: new Date().toISOString() });
});

/**
 * POST /api/analyze  { code, language, stream? }
 * Runs bug, security and quality analyzers concurrently, then a verification pass.
 * With stream:true the response is NDJSON events so the UI can show each stage live;
 * otherwise a single combined JSON object is returned.
 */
app.post('/api/analyze', async (req, res) => {
  let input;
  try {
    input = validateCode(req.body);
    if (!hasApiKey()) throw new AppError('Gemini API key not configured.', 'NO_API_KEY', 503);
  } catch (err) {
    return sendError(res, err);
  }
  const { code, language } = input;
  const stream = Boolean(req.body.stream);

  // Stop spending Gemini calls if the client moves on to newer code.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  const emit = (evt) => {
    if (stream && !res.writableEnded && !abort.signal.aborted) res.write(JSON.stringify(evt) + '\n');
  };

  if (stream) {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }

  const t0 = performance.now();
  const timings = {};
  const errors = {};
  const findings = { bugs: [], security: [], quality: [] };

  emit({ type: 'start', model: MODEL, analyzers: ANALYZER_KEYS });

  // --- Stage 1: three independent Gemini calls in parallel ---
  await Promise.all(
    ANALYZER_KEYS.map(async (key) => {
      const start = performance.now();
      try {
        findings[key] = await runAnalyzer(key, code, language, abort.signal);
        timings[key] = Math.round(performance.now() - start);
        emit({ type: 'analyzer_done', key, findings: findings[key], ms: timings[key] });
      } catch (err) {
        timings[key] = Math.round(performance.now() - start);
        errors[key] = err instanceof AppError ? err.message : String(err?.message || err);
        emit({ type: 'analyzer_error', key, error: errors[key], code: err?.code, ms: timings[key] });
      }
    })
  );
  if (abort.signal.aborted) return;
  timings.parallel = Math.round(performance.now() - t0);

  if (Object.keys(errors).length === ANALYZER_KEYS.length) {
    const message = errors.bugs || 'All analyzers failed.';
    if (stream) {
      emit({ type: 'error', error: message });
      return res.end();
    }
    return res.status(502).json({ error: message, code: 'ANALYZERS_FAILED' });
  }
  emit({ type: 'parallel_done', ms: timings.parallel });

  // --- Stage 2: verification of the combined findings ---
  emit({ type: 'verify_start' });
  const vStart = performance.now();
  let verification = null;
  let dismissed = [];
  try {
    verification = await runVerifier(code, language, findings, abort.signal);
    const rejectedIds = new Map(verification.rejected.map((r) => [r.id, r.reason]));
    for (const key of ANALYZER_KEYS) {
      const kept = [];
      for (const f of findings[key]) {
        if (rejectedIds.has(f.id)) dismissed.push({ ...f, category: key, dismissReason: rejectedIds.get(f.id) });
        else kept.push(f);
      }
      findings[key] = kept;
    }
    timings.verify = Math.round(performance.now() - vStart);
    emit({ type: 'verify_done', verification, dismissed, findings, ms: timings.verify });
  } catch (err) {
    timings.verify = Math.round(performance.now() - vStart);
    if (abort.signal.aborted) return;
    errors.verify = err instanceof AppError ? err.message : String(err?.message || err);
    emit({ type: 'verify_error', error: errors.verify, ms: timings.verify });
  }
  if (abort.signal.aborted) return;

  const counts = ANALYZER_KEYS.map((k) => findings[k].length);
  const result = {
    ...findings,
    dismissed,
    verification,
    summary:
      `${counts[0]} bug${counts[0] === 1 ? '' : 's'}, ${counts[1]} security issue${counts[1] === 1 ? '' : 's'}, ` +
      `${counts[2]} quality suggestion${counts[2] === 1 ? '' : 's'}.` +
      (verification?.summary ? ` ${verification.summary}` : ''),
    errors,
    timings,
    model: MODEL,
    durationMs: Math.round(performance.now() - t0),
  };

  if (stream) {
    emit({ type: 'result', result });
    res.end();
  } else {
    res.json(result);
  }
});

app.post('/api/fix', async (req, res) => {
  try {
    const { code, language } = validateCode(req.body);
    const issue = req.body.issue;
    if (!issue || typeof issue !== 'object' || !issue.title) throw new AppError('Missing issue to fix.', 'BAD_REQUEST', 400);
    const start = performance.now();
    const fixedCode = await runFix(code, language, issue);
    res.json({ fixedCode, durationMs: Math.round(performance.now() - start) });
  } catch (err) {
    sendError(res, err);
  }
});

// Serve the built client in production (npm run build && npm start).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`CodePulse AI server on http://localhost:${PORT}  model=${MODEL}  apiKey=${hasApiKey() ? 'configured' : 'MISSING'}`);
});
