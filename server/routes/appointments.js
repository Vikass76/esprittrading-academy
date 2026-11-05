require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

const CALENDLY_WEBHOOK_SECRET = process.env.CALENDLY_WEBHOOK_SECRET;
const LOCK_DURATION_MS = 0; // Déblocage dès le début du rendez-vous

// Webhook Calendly — reçoit les événements de réservation
router.post('/webhook', async (req, res) => {
  // Repondre immediatement pour eviter les retries Calendly
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

        const signedPayload = `${t}.${req.rawBody.toString()}`;
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
      // Recuperer la vraie date du RDV depuis le payload Calendly
      const rdvStartTime = event.payload?.scheduled_event?.start_time
        || event.payload?.event_start_time
        || null;
      let rdvAt = rdvStartTime ? new Date(rdvStartTime).getTime() : NaN;

      if (!Number.isFinite(rdvAt) && eventId && process.env.CALENDLY_TOKEN) {
        const response = await fetch(eventId, {
          headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}` }
        });

        if (!response.ok) {
          console.error('[appointments] Calendly API:', response.status);
          return res.status(503).json({ error: 'Calendly indisponible' });
        }

        const data = await response.json();
        rdvAt = new Date(data.resource?.start_time).getTime();
      }

      if (!Number.isFinite(rdvAt)) {
        console.error('[appointments] Date du RDV introuvable');
        return res.status(503).json({
          error: 'Date du rendez-vous indisponible'
        });
      }

      const unlockedAt = rdvAt;

      // Ignorer les notifications en double
      const existingEvent = db.prepare(
        'SELECT id FROM appointments WHERE user_id = ? AND calendly_event_id = ?'
      ).get(user.id, eventId);

      if (existingEvent) {
        return res.json({ received: true });
      }

      // Un seul rendez-vous futur par élève
      const upcoming = db.prepare(
        "SELECT id FROM appointments WHERE user_id = ? AND status = 'confirmed' AND booked_at > ? LIMIT 1"
      ).get(user.id, Date.now());

      if (upcoming) {
        console.warn(`[appointments] Deuxieme reservation detectee pour ${email}`);
        return res.json({ received: true, duplicate: true });
      }

      // Enregistrer le nouveau RDV
      db.prepare(`
        INSERT INTO appointments (user_id, calendly_event_id, booked_at, unlocked_at, meeting_link, status)
        VALUES (?, ?, ?, ?, ?, 'confirmed')
      `).run(user.id, eventId || null, rdvAt, unlockedAt, meetingLink);

      console.log(`[appointments] RDV enregistre pour ${email}, RDV le ${new Date(rdvAt).toLocaleDateString('fr-FR')}, debloquage le ${new Date(unlockedAt).toLocaleDateString('fr-FR')}`);
    }

    if (event.event === 'invitee.canceled') {
      const email = event.payload?.email?.toLowerCase().trim();
      if (!email) return res.json({ received: true });

      const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
      if (!user) return res.json({ received: true });

      const eventId = event.payload?.event;
      if (!eventId) {
        console.error('[appointments] Annulation sans identifiant Calendly');
        return res.status(400).json({ error: 'Identifiant manquant' });
      }

      db.prepare(
        "DELETE FROM appointments WHERE user_id = ? AND calendly_event_id = ?"
      ).run(user.id, eventId);

      console.log(`[appointments] Annulation traitee pour ${email}`);
    }

  } catch (err) {
    console.error('Erreur webhook Calendly:', err);
    return res.status(500).json({ error: 'Erreur webhook Calendly' });
  }

  return res.json({ received: true });
});

// Statut RDV pour l'eleve connecte
router.get('/status', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecte' });

  const appointment = db.prepare(
    "SELECT * FROM appointments WHERE user_id = ? AND status = 'confirmed' AND booked_at > ? ORDER BY booked_at ASC LIMIT 1"
  ).get(req.session.userId, Date.now());

  if (!appointment) {
    return res.json({ available: true });
  }

  const now = Date.now();
  if (now >= appointment.booked_at) {
    return res.json({ available: true });
  }

  // Si le lien n'est pas encore en base, on le recupere depuis Calendly
  let meetingLink = appointment.meeting_link;
  if (!meetingLink && appointment.calendly_event_id && process.env.CALENDLY_TOKEN) {
    try {
      const response = await fetch(appointment.calendly_event_id, {
        headers: { 'Authorization': `Bearer ${process.env.CALENDLY_TOKEN}` }
      });
      if (response.ok) {
        const data = await response.json();
        meetingLink = data.resource?.location?.join_url
          || data.resource?.location?.data?.join_url
          || data.resource?.location?.location
          || null;
        if (meetingLink) {
          db.prepare('UPDATE appointments SET meeting_link = ? WHERE id = ?').run(meetingLink, appointment.id);
          console.log(`[appointments] Lien recupere depuis Calendly pour user ${req.session.userId}`);
        }
      }
    } catch (e) {
      console.error('[appointments] Erreur recuperation lien Calendly:', e.message);
    }
  }

  const bookedDate = new Date(appointment.booked_at).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return res.json({
    available: false,
    unlocked_at: appointment.unlocked_at,
    unlocked_date: new Date(appointment.unlocked_at).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric'
    }),
    booked_date: bookedDate,
    meeting_link: meetingLink
  });
});

module.exports = router;
