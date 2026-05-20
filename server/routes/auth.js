const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;

  res.json({ role: user.role, username: user.username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.post('/change-password', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non authentifié' });

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const valid = bcrypt.compareSync(currentPassword, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.session.userId);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non authentifié' });
  res.json({ userId: req.session.userId, username: req.session.username, role: req.session.role });
});

module.exports = router;
