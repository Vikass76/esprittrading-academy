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

app.use('/api/payment/webhook', require('./routes/stripeWebhook'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { router: authRouter, passport } = require('./routes/auth');
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, '../public')));

const uploadsDir = process.env.RENDER ? '/data/uploads' : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRouter);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/trades', require('./routes/trades'));
const cors = require('cors');
const corsOptions = {
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'https://esprittrading.fr',
    'https://www.esprittrading.fr',
    'https://formation-ote-705.vercel.app'
  ],
  methods: ['GET', 'POST'],
};
app.use('/api/payment', cors(corsOptions), require('./routes/payment'));

const { execFile } = require('child_process');
let _ecoCache = null, _ecoCacheTime = 0;
app.get('/api/eco-calendar', (req, res) => {
  const week = req.query.week === 'next' ? 'next' : 'this';
  const cacheKey = week;
  if (!global._ecoCaches) global._ecoCaches = {};
  if (!global._ecoCacheTimes) global._ecoCacheTimes = {};
  if (global._ecoCaches[cacheKey] && Date.now() - global._ecoCacheTimes[cacheKey] < 30*60*1000) {
    return res.json(global._ecoCaches[cacheKey]);
  }
  const url = week === 'next' ? 'https://nfs.faireconomy.media/ff_calendar_nextweek.json' : 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  execFile('curl', ['-s', '--max-time', '10', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', url], (err, stdout) => {
    try {
      const events = JSON.parse(stdout);
      const mapped = events.map(e => ({
        event: e.title,
        country: e.country,
        time: e.date,
        impact: e.impact ? e.impact.toLowerCase() : 'low',
        actual: e.actual || null,
        estimate: e.forecast || null,
        prev: e.previous || null
      }));
      global._ecoCaches[cacheKey] = mapped;
      global._ecoCacheTimes[cacheKey] = Date.now();
      res.json(mapped);
    } catch(e) { if (global._ecoCaches[cacheKey]) res.json(global._ecoCaches[cacheKey]); else res.json([]); }
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

require('./db');
require('./cronPayments').startPaymentCron();

app.listen(PORT, () => console.log('Serveur démarré sur http://localhost:' + PORT));
