const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `trade_${req.session.userId}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  }
});

router.get('/', requireAuth, (req, res) => {
  const { pair, result, from, to } = req.query;
  let query = 'SELECT * FROM trades WHERE user_id = ?';
  const params = [req.session.userId];

  if (pair)   { query += ' AND pair = ?';         params.push(pair); }
  if (result) { query += ' AND result = ?';       params.push(result); }
  if (from)   { query += ' AND trade_date >= ?';  params.push(from); }
  if (to)     { query += ' AND trade_date <= ?';  params.push(to); }

  query += ' ORDER BY trade_date DESC, created_at DESC';
  const trades = db.prepare(query).all(...params);
  res.json(trades);
});

router.post('/', requireAuth, upload.single('screenshot'), (req, res) => {
  const { pair, result, rr, notes, trade_date } = req.body;
  if (!pair || !result || !rr || !trade_date) {
    return res.status(400).json({ error: 'Paire, résultat, RR et date sont requis' });
  }
  if (!['WIN', 'LOSS'].includes(result)) {
    return res.status(400).json({ error: 'Résultat invalide' });
  }

  const screenshot = req.file ? `/uploads/${req.file.filename}` : null;
  const row = db.prepare(
    'INSERT INTO trades (user_id, pair, result, rr, screenshot, notes, trade_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, pair, result, rr, screenshot, notes || '', trade_date);
  res.json({ id: row.lastInsertRowid, pair, result, rr, screenshot, notes, trade_date });
});

router.patch('/:id', requireAuth, upload.single('screenshot'), (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!trade) return res.status(404).json({ error: 'Trade introuvable' });

  const pair       = req.body.pair       !== undefined ? req.body.pair       : trade.pair;
  const result     = req.body.result     !== undefined ? req.body.result     : trade.result;
  const rr         = req.body.rr         !== undefined ? req.body.rr         : trade.rr;
  const notes      = req.body.notes      !== undefined ? req.body.notes      : trade.notes;
  const trade_date = req.body.trade_date !== undefined ? req.body.trade_date : trade.trade_date;

  if (!['WIN', 'LOSS'].includes(result)) return res.status(400).json({ error: 'Résultat invalide' });
  if (!pair || !rr || !trade_date) return res.status(400).json({ error: 'Paire, RR et date sont requis' });

  let screenshot = trade.screenshot;
  if (req.file) {
    if (trade.screenshot?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '../../', trade.screenshot), () => {});
    }
    screenshot = `/uploads/${req.file.filename}`;
  }

  db.prepare('UPDATE trades SET pair = ?, result = ?, rr = ?, notes = ?, trade_date = ?, screenshot = ? WHERE id = ?')
    .run(pair, result, rr, notes || '', trade_date, screenshot, req.params.id);

  res.json({ id: Number(req.params.id), pair, result, rr, notes: notes || '', trade_date, screenshot });
});

router.delete('/:id', requireAuth, (req, res) => {
  const trade = db.prepare('SELECT id FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!trade) return res.status(404).json({ error: 'Trade introuvable' });
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
