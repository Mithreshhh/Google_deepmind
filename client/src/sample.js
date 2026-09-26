export const SAMPLE_CODE = `const express = require('express');
const mysql = require('mysql');

const app = express();
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'admin',
  password: 'SuperSecret123!',
  database: 'shop'
});

// Look up a user by name
app.get('/api/users', (req, res) => {
  const name = req.query.name;
  const sql = "SELECT * FROM users WHERE name = '" + name + "'";
  db.query(sql, (err, rows) => {
    res.json(rows[0]);
  });
});

// Log a user in
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.query(\`SELECT * FROM users WHERE email = '\${email}'\`,
    (err, rows) => {
      if (rows[0].password == password) {
        res.send('Welcome back ' + rows[0].name);
      }
    });
});

app.listen(3000);
`;

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', file: 'server.js' },
  { id: 'typescript', label: 'TypeScript', file: 'server.ts' },
  { id: 'python', label: 'Python', file: 'app.py' },
  { id: 'java', label: 'Java', file: 'App.java' },
];
