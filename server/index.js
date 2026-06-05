const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..') }),
  secret: process.env.SESSION_SECRET || 'esprit-trading-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const uploadsDir = path.join(__dirname, '../uploads');
const coversDir = path.join(uploadsDir, 'covers');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/trades', require('./routes/trades'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

require('./db');

app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
