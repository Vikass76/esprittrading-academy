require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db');
const router = express.Router();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails[0].value;
  const name = profile.displayName;
  const googleId = profile.id;
  let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (user) {
      db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, user.id);
    } else {
      const row = db.prepare('INSERT INTO users (username, email, password, role, google_id, firstname, lastname) VALUES (?,?,?,?,?,?,?)')
        .run(name, email, '', 'community', googleId, profile.name.givenName||name, profile.name.familyName||'');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.lastInsertRowid);
    }
  }
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user);
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs requis' });
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  if (!user.password) return res.status(401).json({ error: 'Connectez-vous avec Google' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, role: user.role, email: user.email, firstname: user.firstname, lastname: user.lastname });
});

router.post('/register', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  if (!firstname || !lastname || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });
  const hash = await bcrypt.hash(password, 10);
  const username = firstname.toLowerCase() + '.' + lastname.toLowerCase() + '.' + Date.now().toString().slice(-4);
  const row = db.prepare('INSERT INTO users (username, email, password, role, firstname, lastname) VALUES (?,?,?,?,?,?)').run(username, email, hash, 'community', firstname, lastname);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.lastInsertRowid);
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, role: user.role, email: user.email, firstname: user.firstname, lastname: user.lastname });
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=google' }),
  (req, res) => {
    req.session.userId = req.user.id;
    res.redirect('/');
  }
);

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  const user = db.prepare('SELECT id, username, role, email, firstname, lastname FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Introuvable' });
  res.json(user);
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });

router.post('/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (user.password) {
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ success: true });
});

module.exports = { router, passport };
