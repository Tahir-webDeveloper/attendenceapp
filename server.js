const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname)));
app.use(express.static(path.resolve(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'verysecretkey';
const TOKEN_EXPIRY = '7d';

function createToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Email/password required; password >= 6' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const info = db.prepare('INSERT INTO users (email, passwordHash, createdAt) VALUES (?, ?, ?)').run(email.toLowerCase(), passwordHash, now);

    db.prepare('INSERT INTO app_state (userId, state, updatedAt) VALUES (?, ?, ?)').run(info.lastInsertRowid, JSON.stringify({ classes: [], attendance: [] }), now);

    const token = createToken({ id: info.lastInsertRowid, email });
    res.json({ token });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email/password required' });

    const user = db.prepare('SELECT id,email,passwordHash FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = createToken(user);
    res.json({ token });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, email: req.user.email });
});

app.get('/api/state', authMiddleware, (req, res) => {
    const row = db.prepare('SELECT state FROM app_state WHERE userId = ?').get(req.user.id);
    if (!row) return res.json({ classes: [], attendance: [] });

    try {
        return res.json(JSON.parse(row.state));
    } catch (err) {
        console.error('Failed to parse state', err);
        return res.json({ classes: [], attendance: [] });
    }
});

app.post('/api/state', authMiddleware, (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Invalid state object' });
    }

    const classes = Array.isArray(incoming.classes) ? incoming.classes : [];
    const attendance = Array.isArray(incoming.attendance) ? incoming.attendance : [];

    const json = JSON.stringify({ classes, attendance });
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT userId FROM app_state WHERE userId = ?').get(req.user.id);
    if (existing) {
        db.prepare('UPDATE app_state SET state = ?, updatedAt = ? WHERE userId = ?').run(json, now, req.user.id);
    } else {
        db.prepare('INSERT INTO app_state (userId, state, updatedAt) VALUES (?, ?, ?)').run(req.user.id, json, now);
    }

    res.json({ classes, attendance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Attendance app backend running on http://localhost:${PORT}`);
    console.log('API: /api/auth/* and /api/state');
});
