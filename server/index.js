require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const https = require('https');

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

const { router: authRouter, passport } = require('./routes/auth');
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, '../public')));

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRouter);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/trades', require('./routes/trades'));

app.get('/api/eco-calendar', (req, res) => {
  const { from, to } = req.query;
  const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  https.get(url, r => {
    let data = '';
    r.on('data', c => data += c);
    r.on('end', () => {
      try {
        const events = JSON.parse(data);
        const mapped = events.map(e => ({
          event: e.title,
          country: e.country,
          time: e.date,
          impact: e.impact ? e.impact.toLowerCase() : 'low',
          actual: e.actual || null,
          estimate: e.forecast || null,
          prev: e.previous || null
        }));
        res.json(mapped);
      } catch(e) { res.json([]); }
    });
  }).on('error', () => res.json([]));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

require('./db');

app.listen(PORT, () => console.log('Serveur démarré sur http://localhost:' + PORT));
