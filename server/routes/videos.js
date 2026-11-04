const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const modules = db.prepare('SELECT * FROM modules ORDER BY position').all();
  const videos = db.prepare('SELECT * FROM videos ORDER BY module_id, position').all();

  const result = modules.map(m => ({
    ...m,
    videos: videos.filter(v => v.module_id === m.id)
  }));

  const completedRows = db.prepare(
    'SELECT video_id FROM video_progress WHERE user_id = ? AND completed = 1'
  ).all(req.session.userId);
  const completedIds = new Set(completedRows.map(row => row.video_id));

  res.json(result.map(module => ({
    ...module,
    videos: module.videos.map(video => ({
      ...video,
      completed: completedIds.has(video.id)
    }))
  })));
});

// V25 : lire la progression de l'élève connecté.
router.get('/:id/progress', requireAuth, (req, res) => {
  const videoId = Number(req.params.id);
  if (!Number.isSafeInteger(videoId) || videoId <= 0) {
    return res.status(400).json({ error: 'Vidéo invalide' });
  }

  const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  const row = db.prepare(
    'SELECT position_seconds FROM video_progress WHERE user_id = ? AND video_id = ?'
  ).get(req.session.userId, videoId);

  res.json({ position: row ? row.position_seconds : 0 });
});

// V25 : sauvegarder la progression de l'élève connecté.
router.put('/:id/progress', requireAuth, (req, res) => {
  const videoId = Number(req.params.id);
  const position = Number(req.body?.position);
  const completed = req.body?.completed === true ? 1 : 0;

  if (!Number.isSafeInteger(videoId) || videoId <= 0 ||
      !Number.isFinite(position) || position < 0) {
    return res.status(400).json({ error: 'Progression invalide' });
  }

  const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  db.prepare(`
    INSERT INTO video_progress
      (user_id, video_id, position_seconds, completed, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, video_id) DO UPDATE SET
      position_seconds = excluded.position_seconds,
      completed = MAX(video_progress.completed, excluded.completed),
      updated_at = CURRENT_TIMESTAMP
  `).run(req.session.userId, videoId, position, completed);

  res.json({ ok: true });
});

module.exports = router;
