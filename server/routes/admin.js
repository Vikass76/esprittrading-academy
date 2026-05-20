const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Lister tous les élèves
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, username, role, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC").all();
  res.json(users);
});

// Créer un compte élève
router.post('/users', requireAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username.trim(), hash, 'student');
  res.json({ id: result.lastInsertRowid, username: username.trim() });
});

// Supprimer un compte élève
router.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Élève introuvable' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Réinitialiser le mot de passe d'un élève
router.patch('/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe invalide (minimum 6 caractères)' });
  }
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Élève introuvable' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// Modules
router.get('/modules', requireAdmin, (req, res) => {
  const modules = db.prepare('SELECT * FROM modules ORDER BY position').all();
  res.json(modules);
});

router.post('/modules', requireAdmin, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as next FROM modules').get().next;
  const result = db.prepare('INSERT INTO modules (title, description, position) VALUES (?, ?, ?)').run(title, description || '', pos);
  res.json({ id: result.lastInsertRowid, title, description, position: pos });
});

router.delete('/modules/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Vidéos
router.post('/videos', requireAdmin, (req, res) => {
  const { module_id, title, url, description } = req.body;
  if (!module_id || !title || !url) {
    return res.status(400).json({ error: 'module_id, titre et URL requis' });
  }
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as next FROM videos WHERE module_id = ?').get(module_id).next;
  const result = db.prepare('INSERT INTO videos (module_id, title, url, description, position) VALUES (?, ?, ?, ?, ?)').run(module_id, title, url, description || '', pos);
  res.json({ id: result.lastInsertRowid, module_id, title, url, description, position: pos });
});

router.delete('/videos/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
