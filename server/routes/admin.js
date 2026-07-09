const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

const fs = require('fs');
const coversDir = path.join(__dirname, '../../uploads/covers');
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

const UPLOAD_BASE = process.env.RENDER ? '/data/uploads' : path.join(__dirname, '../../uploads');
const fsExtra = require('fs');
[UPLOAD_BASE + '/videos', UPLOAD_BASE + '/covers'].forEach(d => {
  if (!fsExtra.existsSync(d)) fsExtra.mkdirSync(d, { recursive: true });
});
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = file.fieldname === 'cover'
        ? UPLOAD_BASE + '/covers'
        : UPLOAD_BASE + '/videos';
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'cover' && file.mimetype.startsWith('image/')) return cb(null, true);
    if (file.fieldname === 'file' && file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Type de fichier non accepté'));
  }
});
const mediaFields = uploadMedia.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, username, role, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC").all();
  res.json(users);
});

router.get('/users/search', requireAdmin, (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const user = db.prepare("SELECT id, username, role, email, firstname, lastname FROM users WHERE LOWER(email) = ?").get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Aucun compte trouvé avec cet email' });
  res.json(user);
});
router.patch('/users/:id/demote', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare("UPDATE users SET role = 'community' WHERE id = ?").run(req.params.id);
  res.json({ ok: true, message: 'Acces formation retire' });
});
router.patch('/users/:id/promote', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(req.params.id);
  res.json({ ok: true, message: 'Accès formation débloqué' });
});
router.post('/users', requireAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username.trim(), hash, 'student');
  res.json({ id: result.lastInsertRowid, username: username.trim() });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Élève introuvable' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.patch('/users/:id/username', requireAdmin, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Identifiant requis' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
  if (existing) return res.status(400).json({ error: 'Identifiant déjà utilisé' });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.params.id);
  res.json({ ok: true });
});
router.patch('/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe invalide (minimum 6 caractères)' });
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

router.patch('/modules/:id', requireAdmin, (req, res) => {
  const { title, position } = req.body;
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Module introuvable' });
  if (title) db.prepare('UPDATE modules SET title = ? WHERE id = ?').run(title, req.params.id);
  if (position !== undefined) db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(position, req.params.id);
  res.json({ ok: true });
});
router.patch('/modules/:id/position', requireAdmin, (req, res) => {
  const { direction } = req.body;
  const mod = db.prepare('SELECT * FROM modules ORDER BY position').all();
  const idx = mod.findIndex(m => m.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Module introuvable' });
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= mod.length) return res.json({ ok: true });
  const posA = mod[idx].position, posB = mod[swapIdx].position;
  db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(posB, mod[idx].id);
  db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(posA, mod[swapIdx].id);
  res.json({ ok: true });
});
router.patch('/videos/:id/position', requireAdmin, (req, res) => {
  const { direction } = req.body;
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });
  const vids = db.prepare('SELECT * FROM videos WHERE module_id = ? ORDER BY position').all(video.module_id);
  const idx = vids.findIndex(v => v.id == req.params.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= vids.length) return res.json({ ok: true });
  const posA = vids[idx].position, posB = vids[swapIdx].position;
  db.prepare('UPDATE videos SET position = ? WHERE id = ?').run(posB, vids[idx].id);
  db.prepare('UPDATE videos SET position = ? WHERE id = ?').run(posA, vids[swapIdx].id);
  res.json({ ok: true });
});
router.delete('/modules/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Vidéos
router.post('/videos', requireAdmin, mediaFields, (req, res) => {
  const { module_id, title, description } = req.body;
  const url = req.files?.file?.[0] ? `/uploads/videos/${req.files.file[0].filename}` : req.body.url;
  const cover = req.files?.cover?.[0] ? `/uploads/covers/${req.files.cover[0].filename}` : null;
  if (!module_id || !title || !url) return res.status(400).json({ error: 'module_id, titre et URL/fichier requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as next FROM videos WHERE module_id = ?').get(module_id).next;
  const result = db.prepare('INSERT INTO videos (module_id, title, url, description, position, cover) VALUES (?, ?, ?, ?, ?, ?)').run(module_id, title, url, description || '', pos, cover);
  res.json({ id: result.lastInsertRowid, module_id, title, url, description, cover, position: pos });
});

router.patch('/videos/:id', requireAdmin, mediaFields, (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  const title = req.body.title || video.title;
  const description = req.body.description !== undefined ? req.body.description : video.description;
  const cover = req.files?.cover?.[0] ? `/uploads/covers/${req.files.cover[0].filename}` : video.cover;
  let url = video.url;
  if (req.files?.file?.[0]) url = `/uploads/videos/${req.files.file[0].filename}`;
  else if (req.body.url) url = req.body.url;

  db.prepare('UPDATE videos SET title = ?, description = ?, cover = ?, url = ? WHERE id = ?').run(title, description, cover, url, req.params.id);
  res.json({ id: video.id, title, description, cover, url });
});

router.delete('/videos/:id', requireAdmin, (req, res) => {
  const video = db.prepare('SELECT url, cover FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);

  for (const field of [video.url, video.cover]) {
    if (field?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '../../', field), () => {});
    }
  }

  res.json({ success: true });
});

module.exports = router;

// Liste des inscrits avec filtres
router.get('/inscrits', requireAdmin, (req, res) => {
  const { role, period } = req.query;
  let query = 'SELECT id, username, email, role, firstname, lastname, created_at FROM users WHERE 1=1';
  const params = [];

  if (role && role !== 'all') {
    query += ' AND role = ?';
    params.push(role);
  }

  if (period && period !== 'all') {
    const days = parseInt(period);
    query += ` AND created_at >= datetime('now', '-${days} days')`;
  }

  query += ' ORDER BY created_at DESC';

  const users = db.prepare(query).all(...params);
  res.json({ users });
});

// Export CSV inscrits community
router.get('/inscrits/export', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT email, firstname, lastname, role, created_at FROM users WHERE role = 'community' ORDER BY created_at DESC").all();
  const csv = ['Email,Prenom,Nom,Role,Date inscription']
    .concat(users.map(u => `${u.email},${u.firstname||''},${u.lastname||''},${u.role},${u.created_at}`))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="community_export.csv"');
  res.send(csv);
});
