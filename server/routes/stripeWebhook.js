require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const router = express.Router();

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { firstname, lastname } = paymentIntent.metadata;
    const plan = paymentIntent.metadata.plan || 'full';
    // Recuperer email depuis toutes les sources possibles
    let email = paymentIntent.metadata.email || paymentIntent.receipt_email || null;
    // Si toujours pas d'email, essayer de recuperer depuis le payment method
    if (!email && paymentIntent.payment_method) {
      try {
        const pm = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
        email = pm.billing_details?.email || null;
      } catch(e) {
        console.error('Erreur recuperation payment method:', e.message);
      }
    }

    if (!email) {
      console.log('Webhook payment_intent.succeeded ignore (pas de metadata email, probablement un test Stripe CLI generique)');
      return res.json({ received: true });
    }

    if (plan === 'split-retry') {
      try {
        const paymentId = paymentIntent.metadata.payment_id;
        db.prepare("UPDATE payments SET status = 'paid', last_attempt_at = ? WHERE id = ?")
          .run(Date.now(), paymentId);
        db.prepare("UPDATE users SET role = 'student' WHERE LOWER(email) = ?").run(email.toLowerCase());
        console.log(`Relance de paiement reussie pour ${email}, acces reactive`);
      } catch (err) {
        console.error('Erreur traitement relance paiement:', err);
      }
      return res.json({ received: true });
    }

    try {
      await handleSuccessfulPayment({
        email,
        firstname,
        lastname,
        plan,
        customerId: paymentIntent.customer,
        paymentMethodId: paymentIntent.payment_method,
        amount: paymentIntent.amount,
      });
    } catch (err) {
      console.error('Erreur traitement paiement reussi:', err);
    }
  }

  res.json({ received: true });
});

async function handleSuccessfulPayment({ email, firstname, lastname, plan, customerId, paymentMethodId, amount }) {
  const emailLower = email.toLowerCase().trim();
  let user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(emailLower);
  let tempPassword = null;

  if (user) {
    // Compte existant -> debloquer la formation
    db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(user.id);
  } else {
    // Nouveau compte -> creer avec mot de passe temporaire
    tempPassword = crypto.randomBytes(6).toString('hex');
    const hash = await bcrypt.hash(tempPassword, 10);
    const baseUsername = (firstname || 'eleve').toLowerCase() + '.' + (lastname || '').toLowerCase();
    let username = baseUsername.replace(/\s+/g, '.') + '.' + Date.now().toString().slice(-4);
    const row = db.prepare(
      'INSERT INTO users (username, email, password, role, firstname, lastname, email_verified) VALUES (?,?,?,?,?,?,?)'
    ).run(username, emailLower, hash, 'student', firstname || '', lastname || '', 1);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.lastInsertRowid);
  }

  // Si paiement en 2 fois, enregistrer le suivi pour le 2e prelevement
  if (plan === 'split') {
    const dueDate = Date.now() + 30 * 24 * 60 * 60 * 1000; // J+30
    db.prepare(`
      INSERT INTO payments (email, stripe_customer_id, stripe_payment_method_id, plan, amount_due, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(emailLower, customerId, paymentMethodId, plan, 49500, dueDate);
  }

  // Email de bienvenue
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  try {
    if (tempPassword) {
      await resend.emails.send({
        from: 'Esprit Trading <noreply@mail.esprittrading.fr>',
        to: emailLower,
        subject: 'Bienvenue dans OTE 705 - Tes accès',
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
          <h2 style="color:#F4C70F">Esprit Trading</h2>
          <p>Bonjour ${firstname || ''},</p>
          <p>Ton paiement a été confirmé et ta formation OTE 705 est maintenant débloquée !</p>
          <p>Voici tes identifiants de connexion :</p>
          <p><strong>Identifiant :</strong> ${user.username}<br/>
          <strong>Mot de passe temporaire :</strong> ${tempPassword}</p>
          <a href="${appUrl}" style="display:inline-block;background:#F4C70F;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Accéder à la plateforme</a>
          <p style="color:#666;font-size:.85rem">Pense à changer ton mot de passe une fois connecté.</p>
        </div>`
      });
    } else {
      await resend.emails.send({
        from: 'Esprit Trading <noreply@mail.esprittrading.fr>',
        to: emailLower,
        subject: 'Ta formation OTE 705 est débloquée !',
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
          <h2 style="color:#F4C70F">Esprit Trading</h2>
          <p>Bonjour ${firstname || user.firstname || ''},</p>
          <p>Ton paiement a été confirmé et ta formation OTE 705 est maintenant débloquée sur ton compte existant !</p>
          <a href="${appUrl}" style="display:inline-block;background:#F4C70F;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Accéder à la plateforme</a>
        </div>`
      });
    }
  } catch (e) {
    console.error('Erreur envoi email bienvenue:', e);
  }
}

module.exports = router;
