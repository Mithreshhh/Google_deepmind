// Empty in dev (Vite proxies /api). In production set VITE_API_URL to the backend origin.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function toApiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body, e.g. proxy error page */
  }
  if (body?.error) return new ApiError(body.error, body.code, res.status);
  if (res.status >= 500) return new ApiError('Cannot reach the CodePulse backend. Is the server running?', 'BACKEND_DOWN', res.status);
  return new ApiError(`Request failed (${res.status}).`, 'HTTP_ERROR', res.status);
}

async function post(url, body, signal) {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the CodePulse backend. Is the server running?', 'NETWORK');
  }
}

/** Streams NDJSON stage events from /api/analyze. */
export async function analyzeStream({ code, language, signal, onEvent }) {
  const res = await post(`${API_BASE}/api/analyze`, { code, language, stream: true }, signal);
  if (!res.ok) throw await toApiError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let evt;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      return;
    }
    onEvent(evt);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      flush(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  }
  flush(buffer);
}

export async function requestFix({ code, language, issue }) {
  const res = await post(`${API_BASE}/api/fix`, { code, language, issue });
  if (!res.ok) throw await toApiError(res);
  const data = await res.json();
  if (!data.fixedCode) throw new ApiError('Gemini returned an empty fix.', 'EMPTY_FIX');
  return data;
}

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
