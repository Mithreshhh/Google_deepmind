import { GoogleGenAI } from '@google/genai';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || 'low';

export class AppError extends Error {
  constructor(message, code, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function hasApiKey() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() && key.trim() !== 'your_api_key_here');
}

let client = null;
function getClient() {
  if (!hasApiKey()) throw new AppError('Gemini API key not configured.', 'NO_API_KEY', 503);
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
  return client;
}

// Some model versions reject thinkingConfig; if so we drop it for the rest of the process.
let thinkingSupported = THINKING_LEVEL !== 'off';

async function generate({ system, prompt, json = true, signal }) {
  const ai = getClient();
  const buildConfig = () => ({
    systemInstruction: system,
    ...(json ? { responseMimeType: 'application/json' } : {}),
    ...(thinkingSupported ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL.toUpperCase() } } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  });

  try {
    const res = await ai.models.generateContent({ model: MODEL, contents: prompt, config: buildConfig() });
    return res.text ?? '';
  } catch (err) {
    if (signal?.aborted) throw err;
    const msg = String(err?.message || '');
    if (thinkingSupported && /thinking/i.test(msg)) {
      thinkingSupported = false;
      const res = await ai.models.generateContent({ model: MODEL, contents: prompt, config: buildConfig() });
      return res.text ?? '';
    }
    throw toAppError(err);
  }
}

function toAppError(err) {
  if (err instanceof AppError) return err;
  const msg = String(err?.message || err);
  const status = err?.status || 0;
  if (status === 400 && /api key/i.test(msg)) return new AppError('Gemini rejected the API key. Check GEMINI_API_KEY.', 'BAD_API_KEY', 401);
  if (status === 403) return new AppError('Gemini API key does not have access to this model.', 'FORBIDDEN', 403);
  if (status === 404) return new AppError(`Model "${MODEL}" was not found. Set GEMINI_MODEL in .env.`, 'MODEL_NOT_FOUND', 404);
  if (status === 429) return new AppError('Gemini rate limit hit. Wait a moment and edit again.', 'RATE_LIMIT', 429);
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(msg)) return new AppError('Network error reaching Gemini.', 'NETWORK', 502);
  return new AppError(`Gemini error: ${msg.slice(0, 200)}`, 'GEMINI_ERROR', 502);
}

// ---------- parsing helpers ----------

export function stripFences(text) {
  let t = String(text ?? '').trim();
  const fenced = t.match(/^```[\w+-]*\s*\n([\s\S]*?)\n?```\s*$/);
  if (fenced) t = fenced[1];
  return t.trim();
}

export function parseJsonLoose(text) {
  const t = stripFences(text);
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new AppError('Gemini returned malformed JSON.', 'PARSE_ERROR', 502);
  }
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

function normalizeFindings(raw, prefix, lineCount) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.findings) ? raw.findings : [];
  return list
    .filter((f) => f && (f.title || f.description))
    .slice(0, 8)
    .map((f, i) => {
      const sev = String(f.severity || 'medium').toLowerCase();
      const line = Number.parseInt(f.line, 10);
      return {
        id: `${prefix}${i + 1}`,
        severity: SEVERITIES.includes(sev) ? sev : 'medium',
        title: String(f.title || 'Issue').slice(0, 120),
        description: String(f.description || '').slice(0, 400),
        line: Number.isFinite(line) && line >= 1 && line <= lineCount ? line : null,
        suggestion: String(f.suggestion || '').slice(0, 400),
      };
    })
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}

function numbered(code) {
  return code
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(3, ' ')} | ${l}`)
    .join('\n');
}

// ---------- analyzers ----------

const FINDING_FORMAT = `Respond with VALID JSON ONLY. No Markdown, no code fences, no prose.
Schema:
{"findings":[{"severity":"critical|high|medium|low","title":"max 7 words","description":"max 18 words","line":<number or null>,"suggestion":"max 12 words"}]}
Rules:
- Report only meaningful, real issues. Avoid false positives and nitpicks.
- Maximum 4 findings, most important first. Return {"findings":[]} if nothing meaningful is wrong.
- "line" is the number in the left gutter of the code listing, or null if not identifiable.
- Be terse. Respect the word limits; speed matters.`;

const ANALYZERS = {
  bugs: {
    prefix: 'b',
    system: `You are the BUG ANALYZER in a live code review engine. Focus ONLY on correctness:
logical bugs, runtime errors, unhandled edge cases, null/undefined access, missing input validation that causes wrong behavior, and exception/error-handling problems (swallowed errors, unhandled promise rejections, missing responses).
Do NOT report security vulnerabilities or style/readability issues; other analyzers handle those.
${FINDING_FORMAT}`,
  },
  security: {
    prefix: 's',
    system: `You are the SECURITY ANALYZER in a live code review engine. Focus ONLY on security:
SQL/NoSQL injection, XSS, command injection, path traversal, hard-coded credentials or secrets, unsafe eval/Function, insecure authentication or session handling, weak crypto, leaking internal errors to clients, and trusting unvalidated user input.
Do NOT report general bugs or style issues; other analyzers handle those.
Use "critical" for directly exploitable issues such as injection or exposed secrets.
${FINDING_FORMAT}`,
  },
  quality: {
    prefix: 'q',
    system: `You are the CODE QUALITY ANALYZER in a live code review engine. Focus ONLY on maintainability, readability and performance:
unnecessary complexity, duplicated logic, poor naming, inefficient loops or queries, outdated patterns (var, callbacks where async/await is clearer), magic values, and missing structure.
Do NOT report security vulnerabilities or correctness bugs; other analyzers handle those.
Quality findings are usually "medium" or "low".
${FINDING_FORMAT}`,
  },
};

export const ANALYZER_KEYS = Object.keys(ANALYZERS);

export async function runAnalyzer(key, code, language, signal) {
  const a = ANALYZERS[key];
  const prompt = `Language: ${language}\n\nCode listing (line numbers in the gutter):\n${numbered(code)}`;
  const text = await generate({ system: a.system, prompt, signal });
  return normalizeFindings(parseJsonLoose(text), a.prefix, code.split('\n').length);
}

// ---------- verifier ----------

const VERIFIER_SYSTEM = `You are the VERIFICATION ENGINE of a live code review system.
Three parallel analyzers (bugs, security, quality) produced findings for the code below.
Your job:
1. Critically review every finding against the actual code. Do not blindly accept them.
   Reject findings that are false positives, duplicates of another finding, or not supported by the code.
2. Design 4 important verification scenarios (normal use, edge case, malicious input).
   For each, reason about what THIS code would do and mark:
   "passed" if the code handles it correctly, "failed" if it misbehaves, "warning" if uncertain.
   These are reasoned checks, not executed tests.
3. Give a verification score 0-100 for how correct and safe the code is right now
   (100 = production ready, below 40 = serious exploitable problems).

Respond with VALID JSON ONLY. No Markdown, no code fences. Be terse; speed matters.
Schema:
{"summary":"one sentence, max 22 words","score":<0-100>,
 "rejected":[{"id":"<finding id>","reason":"max 10 words"}],
 "tests":[{"name":"max 4 words","input":"max 8 words","status":"passed|failed|warning","reason":"max 12 words"}]}`;

export async function runVerifier(code, language, findings, signal) {
  const compact = Object.fromEntries(
    Object.entries(findings).map(([k, list]) => [
      k,
      list.map(({ id, severity, title, description, line }) => ({ id, severity, title, description, line })),
    ])
  );
  const prompt = `Language: ${language}\n\nCode listing:\n${numbered(code)}\n\nFindings to verify:\n${JSON.stringify(compact, null, 1)}`;
  const raw = parseJsonLoose(await generate({ system: VERIFIER_SYSTEM, prompt, signal }));

  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
  const tests = (Array.isArray(raw.tests) ? raw.tests : []).slice(0, 6).map((t) => {
    const s = String(t.status || '').toLowerCase();
    return {
      name: String(t.name || 'Scenario').slice(0, 80),
      input: String(t.input || '').slice(0, 160),
      expected: String(t.expected || '').slice(0, 200),
      status: s.startsWith('pass') ? 'passed' : s.startsWith('fail') ? 'failed' : 'warning',
      reason: String(t.reason || '').slice(0, 240),
    };
  });
  const rejected = (Array.isArray(raw.rejected) ? raw.rejected : [])
    .filter((r) => r && r.id)
    .map((r) => ({ id: String(r.id), reason: String(r.reason || '').slice(0, 200) }));

  return {
    summary: String(raw.summary || '').slice(0, 400),
    score,
    tests,
    rejected,
    edgeCases: (Array.isArray(raw.edgeCases) ? raw.edgeCases : []).slice(0, 5).map((e) => String(e).slice(0, 140)),
  };
}

// ---------- fixer ----------

const FIX_SYSTEM = `You are modifying source code. Fix the selected issue while preserving unrelated functionality. Return ONLY the complete corrected source code. Do not use Markdown code fences. Do not explain the change.
If the exact same problem appears in more than one place in this file, fix every occurrence.
Keep the original structure, formatting and comments wherever they are unrelated to the fix.`;

export async function runFix(code, language, issue) {
  const prompt = `Language: ${language}

Selected issue:
- Severity: ${issue.severity}
- Title: ${issue.title}
- Description: ${issue.description}
- Line: ${issue.line ?? 'unknown'}
- Suggested fix: ${issue.suggestion}

Fix this issue everywhere the same pattern occurs in the file, not only on the listed line.

Current source code:
${code}`;
  const text = await generate({ system: FIX_SYSTEM, prompt, json: false });
  const fixed = stripFences(text);
  if (!fixed || fixed.length < Math.min(20, code.length * 0.3)) {
    throw new AppError('Gemini returned an empty fix.', 'EMPTY_FIX', 502);
  }
  return fixed;
}
