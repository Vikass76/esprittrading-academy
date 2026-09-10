const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = require('../db');

const PRICE_ID = 'price_1UECfcFeDnhdh12wxIK1hvf0';

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Non connecté' });
  next();
}

// Créer une session Stripe Checkout pour l'abonnement
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    const appUrl = process.env.APP_URL || 'https://app.esprittrading.fr';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: user.id },
      success_url: `${appUrl}?tab=analytics&subscribed=1`,
      cancel_url: `${appUrl}?tab=analytics`,
    });
    res.json({ url: session.url });
  } catch(err) {
    console.error('Checkout abonnement error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier le statut premium
router.get('/status', requireAuth, (req, res) => {
  const user = db.prepare('SELECT premium_until FROM users WHERE id = ?').get(req.session.userId);
  const isPremium = user?.premium_until && user.premium_until > Date.now();
  res.json({ isPremium });
});

// Portail client Stripe pour gérer l'abonnement
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user?.stripe_subscription_id) return res.status(400).json({ error: "Pas d'abonnement actif" });
    const appUrl = process.env.APP_URL || 'https://app.esprittrading.fr';
    // Récupérer le customer ID depuis l'abonnement
    const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.customer,
      return_url: appUrl,
    });
    res.json({ url: session.url });
  } catch(err) {
    console.error('Portal error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
