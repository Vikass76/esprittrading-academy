
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

function getProgress(userId) {
  const rows = db.prepare(
    'SELECT step, completed FROM parcours_progress WHERE user_id = ? ORDER BY step'
  ).all(userId);

  const progress = Array(7).fill(false);

  for (const row of rows) {
    if (row.step >= 1 && row.step <= 7) {
      progress[row.step - 1] = row.completed === 1;
    }
  }

  for (let i = 1; i < 7; i++) {
    if (!progress[i - 1]) progress[i] = false;
  }

  return progress;
}

router.get('/', requireAuth, (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({error:'Non connecté'});
  res.json({progress:getProgress(userId)});
});

router.put('/:step', requireAuth, (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({error:'Non connecté'});

  const step = Number(req.params.step);
  const completed = req.body?.completed;

  if (!Number.isInteger(step) || step < 1 || step > 7 ||
      typeof completed !== 'boolean') {
    return res.status(400).json({error:'Validation invalide'});
  }

  try {
    const update = db.transaction(() => {
      const current = getProgress(userId);

      if (completed && step > 1 && !current[step - 2]) {
        return {error:'Valide d’abord l’étape précédente.'};
      }

      db.prepare(`
        INSERT INTO parcours_progress
          (user_id,step,completed,updated_at)
        VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(user_id,step) DO UPDATE SET
          completed=excluded.completed,
          updated_at=CURRENT_TIMESTAMP
      `).run(userId,step,completed ? 1 : 0);

      if (!completed) {
        db.prepare(
          'DELETE FROM parcours_progress WHERE user_id=? AND step>?'
        ).run(userId,step);
      }

      return {progress:getProgress(userId)};
    });

    const result = update();

    if (result.error) return res.status(409).json(result);
    res.json({ok:true,...result});
  } catch (error) {
    console.error('Parcours:',error);
    res.status(500).json({error:'Erreur de sauvegarde'});
  }
});

module.exports = router;
