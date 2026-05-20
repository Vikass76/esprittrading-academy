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

  res.json(result);
});

module.exports = router;
