// DEMO MODE fallback (VITE_DEMO_MODE=true only).
// Local pattern rules that stand in for Gemini when the API is unavailable.
// Results are always labeled DEMO MODE in the UI and never presented as Gemini output.

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];

const RULES = [
  {
    key: 'sqli', cat: 'security', severity: 'critical',
    test: (l) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(l) && /(['"`]\s*\+\s*\w)|\$\{/.test(l),
    title: 'SQL injection in query string',
    description: 'User input is concatenated straight into a SQL statement.',
    suggestion: 'Use a parameterized query with ? placeholders.',
  },
  {
    key: 'secret', cat: 'security', severity: 'high',
    test: (l) => /\w*(password|secret|api_?key|token)\w*\s*[:=]\s*['"][^'"]{4,}['"]/i.test(l),
    title: 'Hard-coded credential',
    description: 'A secret is committed in source code where anyone with repo access can read it.',
    suggestion: 'Load it from an environment variable.',
  },
  {
    key: 'eval', cat: 'security', severity: 'critical',
    test: (l) => /\beval\s*\(/.test(l),
    title: 'Unsafe eval of dynamic input',
    description: 'eval executes arbitrary code.',
    suggestion: 'Parse data with JSON.parse or a safe parser.',
  },
  {
    key: 'xss', cat: 'security', severity: 'medium',
    test: (l) => /res\.send\(\s*['"`][^)]*\+/.test(l),
    title: 'Unescaped data in HTML response',
    description: 'Database values are sent back without escaping, which allows stored XSS.',
    suggestion: 'Return JSON or escape the value before sending.',
  },
  {
    key: 'err', cat: 'bugs', severity: 'medium',
    test: (l, i, lines) => /\(\s*err\s*,\s*\w+\s*\)\s*=>/.test(l) && !lines.slice(i, i + 3).some((x) => /if\s*\(\s*err/.test(x)),
    title: 'Database error ignored',
    description: 'The callback never checks err, so failures crash or hang the request.',
    suggestion: 'Return a 500 response when err is set.',
  },
  {
    key: 'rows', cat: 'bugs', severity: 'high',
    test: (l, i, lines) => /rows\[0\]/.test(l) && !lines.slice(Math.max(0, i - 3), i).some((x) => /rows\.length|!rows/.test(x)),
    title: 'Crash when no row is found',
    description: 'rows[0] is undefined for unknown users, so property access throws.',
    suggestion: 'Return 404 when rows is empty.',
  },
  {
    key: 'validation', cat: 'bugs', severity: 'medium',
    test: (l) => /=\s*req\.(query|body|params)/.test(l),
    title: 'Missing input validation',
    description: 'Request input is used without checking that it exists.',
    suggestion: 'Return 400 when required fields are missing.',
  },
  {
    key: 'loose', cat: 'quality', severity: 'low',
    test: (l) => /[^=!<>]==[^=]|!=[^=]/.test(l),
    title: 'Loose equality comparison',
    description: '== performs type coercion and can hide bugs.',
    suggestion: 'Use === and !==.',
  },
  {
    key: 'var', cat: 'quality', severity: 'low',
    test: (l) => /\bvar\s/.test(l),
    title: 'Outdated var declaration',
    description: 'var is function-scoped and easy to misuse.',
    suggestion: 'Use const or let.',
  },
  {
    key: 'callbacks', cat: 'quality', severity: 'low',
    test: (l) => /db\.query\(/.test(l),
    title: 'Callback-style database access',
    description: 'Nested callbacks make error handling harder to follow.',
    suggestion: 'Use a promise-based client with async/await.',
  },
];

export function demoAnalyze(code) {
  const lines = code.split('\n');
  const findings = { bugs: [], security: [], quality: [] };
  const counters = { bugs: 0, security: 0, quality: 0 };
  const prefix = { bugs: 'b', security: 's', quality: 'q' };
  for (const rule of RULES) {
    const idx = lines.findIndex((l, i) => rule.test(l, i, lines));
    if (idx === -1) continue;
    counters[rule.cat] += 1;
    findings[rule.cat].push({
      id: `${prefix[rule.cat]}${counters[rule.cat]}`,
      severity: rule.severity,
      title: rule.title,
      description: rule.description,
      line: idx + 1,
      suggestion: rule.suggestion,
      demoRule: rule.key,
    });
  }
  for (const k of Object.keys(findings)) findings[k].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  const all = [...findings.bugs, ...findings.security, ...findings.quality];
  const has = (key) => all.some((f) => f.demoRule === key);
  const weights = { critical: 28, high: 16, medium: 7, low: 2 };
  const score = Math.max(5, Math.min(100, 100 - all.reduce((s, f) => s + weights[f.severity], 0)));

  const tests = [
    { name: 'Valid request', input: 'Known user, correct input', expected: 'Returns user data', status: has('rows') ? 'warning' : 'passed', reason: 'Happy path works when the row exists.' },
    { name: 'SQL injection payload', input: "' OR '1'='1", expected: 'Treated as a literal value', status: has('sqli') ? 'failed' : 'passed', reason: has('sqli') ? 'Input is concatenated into SQL.' : 'Queries are parameterized.' },
    { name: 'Unknown user', input: 'Name that does not exist', expected: '404 response', status: has('rows') ? 'failed' : 'passed', reason: has('rows') ? 'rows[0] is undefined and throws.' : 'Empty results are handled.' },
    { name: 'Database outage', input: 'Connection error', expected: '500 response', status: has('err') ? 'failed' : 'passed', reason: has('err') ? 'err is never checked.' : 'Errors return 500.' },
    { name: 'Missing parameters', input: 'Empty query/body', expected: '400 response', status: has('validation') ? 'failed' : 'passed', reason: has('validation') ? 'No validation before use.' : 'Input is validated.' },
  ];
  return {
    findings,
    verification: {
      summary: 'Demo fallback: local pattern rules, not Gemini reasoning.',
      score,
      tests,
      rejected: [],
      edgeCases: [],
    },
  };
}

const toEnvName = (name) => name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

const FIXES = {
  sqli: (code) =>
    code
      .replace(/"SELECT \* FROM users WHERE name = '" \+ name \+ "'";\n(\s*)db\.query\(sql, /, "'SELECT * FROM users WHERE name = ?';\n$1db.query(sql, [name], ")
      .replace(/db\.query\(`SELECT \* FROM users WHERE email = '\$\{email\}'`,/, "db.query('SELECT * FROM users WHERE email = ?', [email],"),
  secret: (code) =>
    code.replace(/(\w*(?:password|secret|api_?key|token)\w*)(\s*[:=]\s*)['"][^'"]{4,}['"]/gi, (_m, name, sep) => `${name}${sep}process.env.${toEnvName(name)}`),
  eval: (code) => code.replace(/\beval\s*\(/g, 'JSON.parse('),
  loose: (code) => code.replace(/([^=!<>])==([^=])/g, '$1===$2').replace(/!=([^=])/g, '!==$1'),
  var: (code) => code.replace(/\bvar\s/g, 'let '),
  err: (code) =>
    code.replace(/(\(\s*err\s*,\s*(\w+)\s*\)\s*=>\s*\{\n)(\s*)/g, "$1$3if (err) return res.status(500).json({ error: 'Database error' });\n$3"),
  rows: (code) =>
    code.replace(/(\n(\s*))((?:res\.json\(rows\[0\]\))|(?:if \(rows\[0\]))/, "$1if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });$1$3"),
  validation: (code) =>
    code.replace(/(\n(\s*)const name = req\.query\.name;)/, "$1\n$2if (!name) return res.status(400).json({ error: 'name is required' });"),
  xss: (code) => code.replace(/res\.send\('Welcome back ' \+ rows\[0\]\.name\)/, 'res.json({ message: `Welcome back`, name: rows[0].name })'),
};

export function demoFix(code, issue) {
  const fn = FIXES[issue.demoRule];
  return fn ? fn(code) : code;
}
