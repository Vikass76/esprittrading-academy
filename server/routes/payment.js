require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();
const db = require('../db');

const PRICES = {
  full: 99000,   // 990,00 EUR en centimes
  split: 49500,  // 495,00 EUR en centimes (1er versement)
};

router.post('/create-intent', async (req, res) => {
  const { plan, email, firstname, lastname } = req.body;

  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Offre invalide' });
  }
  const safeEmail = email || 'pending@esprittrading.fr';

  try {
    // Chercher ou creer un Customer Stripe pour cet email
    const existingCustomers = await stripe.customers.list({ email: safeEmail, limit: 1 });
    let customer = existingCustomers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email: safeEmail,
        name: [firstname, lastname].filter(Boolean).join(' ') || undefined,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICES[plan],
      currency: 'eur',
      customer: customer.id,
      setup_future_usage: plan === 'split' ? 'off_session' : undefined,
      metadata: {
        plan,
        email: safeEmail,
        firstname: firstname || '',
        lastname: lastname || '',
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Erreur create-intent:', err);
    res.status(500).json({ error: 'Erreur lors de la creation du paiement' });
  }
});

router.post('/create-retry-intent', async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId requis' });
  }

  try {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND status = 'failed'").get(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Paiement introuvable ou deja regle' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: payment.amount_due,
      currency: 'eur',
      customer: payment.stripe_customer_id,
      metadata: {
        plan: 'split-retry',
        email: payment.email,
        payment_id: String(payment.id),
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret, amount: payment.amount_due, email: payment.email });
  } catch (err) {
    console.error('Erreur create-retry-intent:', err);
    res.status(500).json({ error: 'Erreur lors de la creation du paiement de relance' });
  }
});

router.post('/update-intent-amount', async (req, res) => {
  const { paymentIntentId, plan } = req.body;
  const amounts = { full: 99000, split: 49500 };
  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      amount: amounts[plan] || 99000,
      metadata: { plan }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Erreur update-intent-amount:', err);
    res.status(500).json({ error: 'Erreur mise a jour montant' });
  }
});

router.post('/update-intent-metadata', async (req, res) => {
  const { paymentIntentId, email, firstname, lastname } = req.body;
  if (!paymentIntentId || !email) {
    return res.status(400).json({ error: 'paymentIntentId et email requis' });
  }
  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { email, firstname: firstname || '', lastname: lastname || '' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur update-intent-metadata:', err);
    res.status(500).json({ error: 'Erreur mise a jour' });
  }
});

module.exports = router;
