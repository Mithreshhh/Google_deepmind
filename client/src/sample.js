// Small, intentionally flawed programs so the analyzers have something real to find:
// SQL injection, hard-coded secrets, missing validation and weak error handling.

const JAVASCRIPT = `const express = require('express');
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

const TYPESCRIPT = `import express, { Request, Response } from 'express';
import mysql from 'mysql2';

const app = express();
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'admin',
  password: 'SuperSecret123!',
  database: 'shop',
});

interface User {
  id: number;
  name: string;
  password: string;
}

// Look up a user by name
app.get('/api/users', (req: Request, res: Response) => {
  const name = req.query.name as string;
  const sql = \`SELECT * FROM users WHERE name = '\${name}'\`;
  db.query(sql, (err: any, rows: any) => {
    res.json(rows[0] as User);
  });
});

// Log a user in
app.post('/api/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM users WHERE email = '" + email + "'",
    (err: any, rows: any) => {
      const user = rows[0] as User;
      if (user.password == password) {
        res.send(\`Welcome back \${user.name}\`);
      }
    });
});

app.listen(3000);
`;

const PYTHON = `import sqlite3
from flask import Flask, request, jsonify

app = Flask(__name__)

SECRET_KEY = "my-flask-secret-key"
ADMIN_PASSWORD = "SuperSecret123!"
app.config["SECRET_KEY"] = SECRET_KEY


def get_db():
    return sqlite3.connect("shop.db")


# Look up a user by name
@app.route("/api/users")
def get_user():
    name = request.args.get("name")
    db = get_db()
    query = "SELECT * FROM users WHERE name = '" + name + "'"
    row = db.execute(query).fetchone()
    return jsonify({"id": row[0], "name": row[1]})


# Log a user in
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    db = get_db()
    row = db.execute(
        f"SELECT * FROM users WHERE email = '{data['email']}'"
    ).fetchone()
    if row[2] == data["password"]:
        return "Welcome back " + row[1]


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
`;

const JAVA = `import java.sql.*;

public class UserService {

    private static final String DB_URL =
        "jdbc:mysql://localhost:3306/shop";
    private static final String DB_USER = "admin";
    private static final String DB_PASSWORD = "SuperSecret123!";

    // Look up a user by name
    public String findUser(String name) throws Exception {
        Connection conn = DriverManager.getConnection(
            DB_URL, DB_USER, DB_PASSWORD);
        Statement stmt = conn.createStatement();
        String sql = "SELECT * FROM users WHERE name = '"
            + name + "'";
        ResultSet rs = stmt.executeQuery(sql);
        rs.next();
        return rs.getString("email");
    }

    // Log a user in
    public boolean login(String email, String password) {
        try {
            Connection conn = DriverManager.getConnection(
                DB_URL, DB_USER, DB_PASSWORD);
            String sql = "SELECT * FROM users WHERE email = '"
                + email + "'";
            ResultSet rs = conn.createStatement().executeQuery(sql);
            rs.next();
            return rs.getString("password") == password;
        } catch (Exception e) {
            return true;
        }
    }
}
`;

export const SAMPLES = {
  javascript: JAVASCRIPT,
  typescript: TYPESCRIPT,
  python: PYTHON,
  java: JAVA,
};

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', file: 'server.js' },
  { id: 'typescript', label: 'TypeScript', file: 'server.ts' },
  { id: 'python', label: 'Python', file: 'app.py' },
  { id: 'java', label: 'Java', file: 'UserService.java' },
];
