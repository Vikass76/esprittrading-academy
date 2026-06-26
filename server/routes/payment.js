require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

const PRICES = {
  full: 99000,   // 990,00 EUR en centimes
  split: 45000,  // 450,00 EUR en centimes (1er versement)
};

router.post('/create-intent', async (req, res) => {
  const { plan, email, firstname, lastname } = req.body;

  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Offre invalide' });
  }
  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    // Chercher ou creer un Customer Stripe pour cet email
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    let customer = existingCustomers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email,
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
        email,
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

module.exports = router;
