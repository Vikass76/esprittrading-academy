const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadsDir = process.env.RENDER ? '/data/uploads' : path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, 'nathan_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non authentifié' });
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  next();
}

function requireStudent(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non authentifié' });
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || (user.role !== 'student' && user.role !== 'admin')) return res.status(403).json({ error: 'Accès refusé' });
  next();
}

// GET tous les trades Nathan
router.get('/', requireStudent, (req, res) => {
  const trades = db.prepare('SELECT * FROM nathan_trades ORDER BY date DESC, id DESC').all();
  res.json({ trades });
});

// POST nouveau trade (admin uniquement)
router.post('/', requireAdmin, upload.single('image'), (req, res) => {
  const { date, pair, direction, result, rr, video_url, notes } = req.body;
  if (!date || !pair || !direction || !result || !rr) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  const image_path = req.file ? '/uploads/' + req.file.filename : null;
  const trade = db.prepare('INSERT INTO nathan_trades (date, pair, direction, result, rr, image_path, video_url, notes) VALUES (?,?,?,?,?,?,?,?)').run(date, pair, direction, result, rr, image_path, video_url || null, notes || null);
  res.json({ success: true, id: trade.lastInsertRowid });
});

// DELETE trade (admin uniquement)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM nathan_trades WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
