const Database = require('better-sqlite3');
const path = require('path');
const dbFile = path.resolve(__dirname, 'attendance.db');
const db = new Database(dbFile);

// Schema for user + state
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
    userId INTEGER PRIMARY KEY,
    state TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
`);

module.exports = db;
