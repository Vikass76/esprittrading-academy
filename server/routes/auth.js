require('dotenv').config();
const express = require('express');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db');
const { addContactToBrevo } = require('../brevo');
const router = express.Router();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: (process.env.APP_URL || 'http://localhost:3000') + '/api/auth/google/callback'
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
      const baseName = (profile.name.givenName||name).toLowerCase().replace(/\s+/g,'.');
      let username = baseName + '.' + Date.now().toString().slice(-4);
      while(db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
        username = baseName + '.' + Math.floor(Math.random()*9000+1000);
      }
      const row = db.prepare('INSERT INTO users (username, email, password, role, google_id, firstname, lastname, email_verified) VALUES (?,?,?,?,?,?,?,?)')
        .run(username, email, '', 'community', googleId, profile.name.givenName||name, profile.name.familyName||'', 1);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.lastInsertRowid);
      addContactToBrevo({ email, firstname: profile.name.givenName||name, lastname: profile.name.familyName||'', role: 'community' });
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
  const usernameLower = username.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?').get(usernameLower, usernameLower);
  if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  if (!user.password) return res.status(401).json({ error: 'Connectez-vous avec Google' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  req.session.userId = user.id;
  req.session.userRole = user.role;
  res.json({ id: user.id, username: user.username, role: user.role, email: user.email, firstname: user.firstname, lastname: user.lastname });
});

router.post('/register', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  if (!firstname || !lastname || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  // Validation email stricte
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email invalide' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });
  const hash = await bcrypt.hash(password, 10);
  const username = firstname.toLowerCase() + '.' + lastname.toLowerCase() + '.' + Date.now().toString().slice(-4);
  const token = crypto.randomBytes(32).toString('hex');
  const row = db.prepare('INSERT INTO users (username, email, password, role, firstname, lastname, verification_token, email_verified) VALUES (?,?,?,?,?,?,?,?)').run(username, email, hash, 'community', firstname, lastname, token, 0);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.lastInsertRowid);
  addContactToBrevo({ email, firstname, lastname, role: 'community' });
  // Envoi email confirmation
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  try {
    await resend.emails.send({
      from: 'Esprit Trading <noreply@mail.esprittrading.fr>',
      to: email,
      subject: 'Confirme ton adresse email — Esprit Trading',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#F4C70F">Esprit Trading</h2>
        <p>Bonjour ${firstname},</p>
        <p>Merci de confirmer ton adresse email pour activer ton compte.</p>
        <a href="${appUrl}/api/auth/verify?token=${token}" style="display:inline-block;background:#F4C70F;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Confirmer mon email</a>
        <p style="color:#666;font-size:.85rem">Si tu n'as pas créé de compte, ignore cet email.</p>
      </div>`
    });
  } catch(e) { console.error('Email error:', e); }
  res.json({ ok: true, message: 'Compte créé, vérifie ton email' });
});

// Route mot de passe oublié
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ ok: true }); // Ne pas révéler si l'email existe
  const token = require('crypto').randomBytes(32).toString('hex');
  const expiry = Date.now() + 60*60*1000; // 1 heure
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?').run(token, expiry, user.id);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  try {
    await resend.emails.send({
      from: 'Esprit Trading <noreply@mail.esprittrading.fr>',
      to: email,
      subject: 'Réinitialisation de ton mot de passe — Esprit Trading',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#F4C70F">Esprit Trading</h2>
        <p>Bonjour ${user.firstname || user.username},</p>
        <p>Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton ci-dessous :</p>
        <a href="${appUrl}/?reset_token=${token}" style="display:inline-block;background:#F4C70F;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Réinitialiser mon mot de passe</a>
        <p style="color:#666;font-size:.85rem">Ce lien expire dans 1 heure. Si tu n'as pas demandé de réinitialisation, ignore cet email.</p>
      </div>`
    });
  } catch(e) { console.error('Email error:', e); }
  res.json({ ok: true });
});
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Données manquantes' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user) return res.status(400).json({ error: 'Lien invalide ou expiré' });
  if (Date.now() > user.reset_token_expiry) return res.status(400).json({ error: 'Lien expiré' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});
// Route vérification email
router.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/?error=token_invalide');
  const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
  if (!user) return res.redirect('/?error=token_invalide');
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(user.id);
  res.redirect('/?verified=1');
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=google' }),
  (req, res) => {
    req.session.userId = req.user.id;
    res.redirect('/');
  }
);

router.patch('/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  const { firstname, lastname, email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (email && email !== user.email) {
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email invalide' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.session.userId);
    if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });
  }
  db.prepare('UPDATE users SET firstname=?, lastname=?, email=? WHERE id=?')
    .run(firstname||user.firstname, lastname||user.lastname, email||user.email, req.session.userId);
  res.json({ ok: true });
});
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

// Route lead magnet (formulaire analyses)
router.post('/lead-magnet', async (req, res) => {
  const { email, firstname, lastname } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email invalide' });
  try {
    const { addContactToBrevo } = require('../brevo');
    await addContactToBrevo({ email, firstname: firstname || '', lastname: lastname || '', role: 'leadMagnet' });
    res.json({ success: true });
  } catch(err) {
    console.error('Erreur lead-magnet:', err);
    res.json({ success: true });
  }
});

module.exports = { router, passport };
