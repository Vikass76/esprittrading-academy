require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

const CALENDLY_WEBHOOK_SECRET = process.env.CALENDLY_WEBHOOK_SECRET;
const LOCK_DURATION_MS = 0; // Déblocage dès le début du rendez-vous

// Webhook Calendly — reçoit les événements de réservation

const BOOKING_SECRET = process.env.SESSION_SECRET || process.env.CALENDLY_TOKEN;

router.get('/booking-context', (req, res) => {
  if (!req.session.userId) return res.status(401).json({error:'Non connecté'});
  if (!BOOKING_SECRET) return res.status(503).json({error:'Configuration manquante'});

  const expiry = Date.now() + 48 * 60 * 60 * 1000;
  const payload = `${req.session.userId}.${expiry}`;
  const signature = crypto.createHmac('sha256', BOOKING_SECRET)
    .update(payload).digest('hex');

  res.json({token: `${payload}.${signature}`});
});

function userIdFromBookingToken(token) {
  if (!BOOKING_SECRET || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [id, expiry, signature] = parts;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(expiry)) return null;
  if (Date.now() > Number(expiry)) return null;

  const expected = crypto.createHmac('sha256', BOOKING_SECRET)
    .update(`${id}.${expiry}`).digest('hex');

  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  return Number(id);
}

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
      const payload = event.payload || {};
      const eventId = payload.event;
      const inviteeId = payload.uri;
      const oldInvitee = payload.old_invitee;

      const oldEventId = typeof oldInvitee === 'string'
        ? oldInvitee.split('/invitees/')[0] : null;

      // Retrouver l'ancien RDV, même s'il a déjà été annulé.
      let previous = null;
      if (oldInvitee) {
        previous = db.prepare(
          'SELECT * FROM appointments WHERE calendly_invitee_id = ? ORDER BY id DESC LIMIT 1'
        ).get(oldInvitee);

        if (!previous && oldEventId) {
          previous = db.prepare(
            'SELECT * FROM appointments WHERE calendly_event_id = ? ORDER BY id DESC LIMIT 1'
          ).get(oldEventId);
        }
      }

      // Le jeton est utilisé pour les nouvelles réservations.
      // Pour une reprogrammation, l'ancien RDV identifie l'élève.
      const tokenUserId = userIdFromBookingToken(
        payload.tracking?.utm_content
      );
      const userId = previous?.user_id || tokenUserId;

      if (!userId) {
        console.warn('[appointments] RDV non associé à un élève');
        return res.json({received:true,unlinked:true});
      }

      const user = db.prepare(
        'SELECT id FROM users WHERE id = ?'
      ).get(userId);

      if (!user) return res.json({received:true});

      const existingEvent = db.prepare(
        'SELECT * FROM appointments WHERE calendly_event_id = ? AND user_id = ? LIMIT 1'
      ).get(eventId, userId);

      if (existingEvent && existingEvent.status === 'confirmed') {
        if (inviteeId && !existingEvent.calendly_invitee_id) {
          db.prepare(
            'UPDATE appointments SET calendly_invitee_id = ? WHERE id = ?'
          ).run(inviteeId, existingEvent.id);
        }
        return res.json({received:true});
      }

      let rdvAt = new Date(
        payload.scheduled_event?.start_time ||
        payload.event_start_time || ''
      ).getTime();

      let eventData = null;

      if (eventId && process.env.CALENDLY_TOKEN) {
        const response = await fetch(eventId, {
          headers: {
            Authorization: `Bearer ${process.env.CALENDLY_TOKEN}`
          }
        });

        if (!response.ok) {
          return res.status(503).json({error:'Calendly indisponible'});
        }

        eventData = (await response.json()).resource;
        rdvAt = new Date(eventData?.start_time).getTime();

        const expectedType =
          'https://api.calendly.com/event_types/2c9b5061-57a6-4431-a82a-95674e5672f7';

        if (eventData?.event_type !== expectedType ||
            eventData?.status !== 'active') {
          return res.json({received:true,ignored:true});
        }
      }

      if (!Number.isFinite(rdvAt) || rdvAt <= Date.now()) {
        return res.status(400).json({error:'Date RDV invalide'});
      }

      const location = eventData?.location || payload.location || {};
      const candidateLink = location.join_url ||
        location.data?.join_url ||
        location.location || null;
      const meetingLink =
        typeof candidateLink === 'string' &&
        /^https:\/\//i.test(candidateLink)
          ? candidateLink : null;

      if (previous) {
        // La nouvelle réservation remplace l'ancienne.
        db.prepare(`
          UPDATE appointments
          SET calendly_event_id = ?,
              calendly_invitee_id = ?,
              booked_at = ?,
              unlocked_at = ?,
              meeting_link = ?,
              status = 'confirmed'
          WHERE id = ?
        `).run(
          eventId, inviteeId || null, rdvAt, rdvAt,
          meetingLink, previous.id
        );

        console.log('[appointments] RDV reprogrammé pour compte', userId);
        return res.json({received:true,rescheduled:true});
      }

      if (existingEvent) {
        db.prepare(`
          UPDATE appointments
          SET calendly_invitee_id = ?,
              booked_at = ?,
              unlocked_at = ?,
              meeting_link = ?,
              status = 'confirmed'
          WHERE id = ?
        `).run(inviteeId || null, rdvAt, rdvAt, meetingLink, existingEvent.id);

        return res.json({received:true});
      }

      const upcoming = db.prepare(
        "SELECT id FROM appointments WHERE user_id = ? AND status = 'confirmed' AND booked_at > ? LIMIT 1"
      ).get(userId, Date.now());

      if (upcoming) {
        console.warn('[appointments] Deuxième réservation pour compte', userId);
        return res.json({received:true,duplicate:true});
      }

      db.prepare(`
        INSERT INTO appointments
        (user_id, calendly_event_id, calendly_invitee_id,
         booked_at, unlocked_at, meeting_link, status)
        VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
      `).run(
        userId, eventId || null, inviteeId || null,
        rdvAt, rdvAt, meetingLink
      );

      console.log('[appointments] RDV enregistré pour compte', userId);
    }

    if (event.event === 'invitee.canceled') {
      const payload = event.payload || {};

      // Conserver l'historique permet de retrouver le compte
      // même si l'annulation arrive avant la nouvelle réservation.
      const result = payload.uri
        ? db.prepare(`
            UPDATE appointments SET status = 'canceled'
            WHERE calendly_invitee_id = ?
              AND status = 'confirmed'
          `).run(payload.uri)
        : {changes:0};

      if (!result.changes && payload.event) {
        db.prepare(`
          UPDATE appointments SET status = 'canceled'
          WHERE calendly_event_id = ?
            AND status = 'confirmed'
        `).run(payload.event);
      }

      console.log('[appointments] Annulation Calendly traitée');
    }

  } catch (err) {
    console.error('Erreur webhook Calendly:', err);
    return res.status(500).json({ error: 'Erreur webhook Calendly' });
  }

  return res.json({ received: true });
});

// Statut RDV pour l'eleve connecte

// Confirmer une réservation depuis le compte élève connecté.
// L'e-mail utilisé dans Calendly n'intervient jamais.
router.post('/confirm', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({error:'Non connecté'});
  }

  const eventUri = req.body?.event_uri;
  const inviteeUri = req.body?.invitee_uri;
  const token = process.env.CALENDLY_TOKEN;

  const eventPattern = /^https:\/\/api\.calendly\.com\/scheduled_events\/[a-zA-Z0-9-]+$/;
  const inviteePattern = /^https:\/\/api\.calendly\.com\/scheduled_events\/[a-zA-Z0-9-]+\/invitees\/[a-zA-Z0-9-]+$/;

  if (!eventPattern.test(eventUri || '') ||
      !inviteePattern.test(inviteeUri || '') ||
      !inviteeUri.startsWith(eventUri + '/invitees/')) {
    return res.status(400).json({error:'Identifiants Calendly invalides'});
  }

  if (!token) {
    return res.status(503).json({error:'Token Calendly manquant'});
  }

  try {
    const headers = {Authorization: `Bearer ${token}`};
    const [eventResponse, inviteeResponse] = await Promise.all([
      fetch(eventUri, {headers}),
      fetch(inviteeUri, {headers})
    ]);

    if (!eventResponse.ok || !inviteeResponse.ok) {
      return res.status(502).json({error:'Vérification Calendly impossible'});
    }

    const eventData = (await eventResponse.json()).resource;
    const inviteeData = (await inviteeResponse.json()).resource;

    const expectedType = 'https://api.calendly.com/event_types/2c9b5061-57a6-4431-a82a-95674e5672f7';

    if (eventData?.uri !== eventUri ||
        eventData?.event_type !== expectedType ||
        eventData?.status !== 'active' ||
        inviteeData?.uri !== inviteeUri ||
        inviteeData?.event !== eventUri ||
        inviteeData?.status !== 'active') {
      return res.status(400).json({error:'Réservation non valide'});
    }

    const bookedAt = new Date(eventData.start_time).getTime();
    if (!Number.isFinite(bookedAt) || bookedAt <= Date.now()) {
      return res.status(400).json({error:'Date de réservation invalide'});
    }

    const userId = req.session.userId;

    const existing = db.prepare(
      "SELECT * FROM appointments WHERE user_id = ? AND status = 'confirmed' AND booked_at > ? ORDER BY booked_at LIMIT 1"
    ).get(userId, Date.now());

    if (existing) {
      if (existing.calendly_event_id === eventUri) {
        db.prepare(
          'UPDATE appointments SET calendly_invitee_id = ? WHERE id = ?'
        ).run(inviteeUri, existing.id);
        return res.json({confirmed:true,already_saved:true});
      }
      return res.status(409).json({error:'Un rendez-vous est déjà réservé'});
    }

    const linked = db.prepare(
      "SELECT user_id FROM appointments WHERE calendly_event_id = ? LIMIT 1"
    ).get(eventUri);

    if (linked && linked.user_id !== userId) {
      return res.status(409).json({error:'Réservation déjà associée à un autre compte'});
    }

    const location = eventData.location || {};
    const meetingLink = location.join_url ||
      location.data?.join_url ||
      (typeof location.location === 'string' &&
       /^https:\/\//.test(location.location) ? location.location : null);

    db.prepare(
      "INSERT INTO appointments (user_id, calendly_event_id, calendly_invitee_id, booked_at, unlocked_at, meeting_link, status) VALUES (?, ?, ?, ?, ?, ?, 'confirmed')"
    ).run(userId, eventUri, inviteeUri, bookedAt, bookedAt, meetingLink);

    console.log('[appointments] Réservation confirmée pour compte', userId);
    return res.json({confirmed:true});
  } catch (error) {
    console.error('[appointments] Erreur confirmation:', error);
    return res.status(500).json({error:'Confirmation impossible'});
  }
});

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
