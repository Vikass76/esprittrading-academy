require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

const CALENDLY_WEBHOOK_SECRET = process.env.CALENDLY_WEBHOOK_SECRET;
const LOCK_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

// Webhook Calendly — reçoit les événements de réservation
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    // Verification de la signature Calendly
    if (CALENDLY_WEBHOOK_SECRET) {
      const signature = req.headers['calendly-webhook-signature'];
      if (signature) {
        const [t, v1] = signature.split(',').reduce((acc, part) => {
          const [key, val] = part.split('=');
          if (key === 't') acc[0] = val;
          if (key === 'v1') acc[1] = val;
          return acc;
        }, [null, null]);

        const signedPayload = `${t}.${req.body.toString()}`;
        const expectedSig = crypto.createHmac('sha256', CALENDLY_WEBHOOK_SECRET)
          .update(signedPayload)
          .digest('hex');

        if (expectedSig !== v1) {
          return res.status(401).json({ error: 'Signature invalide' });
        }
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : (Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body);

    if (event.event === 'invitee.created') {
      const email = event.payload?.email?.toLowerCase().trim();
      const eventId = event.payload?.event;
      const meetingLink = event.payload?.location?.join_url
        || event.payload?.location?.data?.join_url
        || event.payload?.location?.location
        || null;

      if (!email) return res.json({ received: true });

      const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (!user) return res.json({ received: true });

      const now = Date.now();
      const unlockedAt = now + LOCK_DURATION_MS;

      // Supprimer l'ancien RDV si existant
      db.prepare('DELETE FROM appointments WHERE user_id = ?').run(user.id);

      // Enregistrer le nouveau RDV
      db.prepare(`
        INSERT INTO appointments (user_id, calendly_event_id, booked_at, unlocked_at, meeting_link, status)
        VALUES (?, ?, ?, ?, ?, 'confirmed')
      `).run(user.id, eventId || null, now, unlockedAt, meetingLink);

      console.log(`[appointments] RDV enregistre pour ${email}, debloquage le ${new Date(unlockedAt).toLocaleDateString('fr-FR')}`);
    }

    if (event.event === 'invitee.canceled') {
      const email = event.payload?.email?.toLowerCase().trim();
      if (!email) return res.json({ received: true });

      const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (!user) return res.json({ received: true });

      db.prepare("DELETE FROM appointments WHERE user_id = ?").run(user.id);
      console.log(`[appointments] RDV annule pour ${email} - onglet RDV debloque`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Erreur webhook Calendly:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statut RDV pour l'eleve connecte
router.get('/status', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });

  const appointment = db.prepare(
    "SELECT * FROM appointments WHERE user_id = ? AND status = 'confirmed' ORDER BY booked_at DESC LIMIT 1"
  ).get(req.session.userId);

  if (!appointment) {
    return res.json({ available: true });
  }

  const now = Date.now();
  if (now >= appointment.unlocked_at) {
    return res.json({ available: true });
  }

  const bookedDate = new Date(appointment.booked_at).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return res.json({
    available: false,
    unlocked_at: appointment.unlocked_at,
    unlocked_date: new Date(appointment.unlocked_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    }),
    booked_date: bookedDate,
    meeting_link: appointment.meeting_link
  });
});

module.exports = router;
