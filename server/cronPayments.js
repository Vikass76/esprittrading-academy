require('dotenv').config();
const cron = require('node-cron');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = require('./db');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_RETRIES = 3;
const RETRY_DELAYS_DAYS = [3, 7, 14]; // delai avant chaque retry: J+3, puis J+7, puis J+14
const appUrl = process.env.APP_URL || 'http://localhost:3000';

async function processPendingPayments() {
  const now = Date.now();
  const duePayments = db.prepare(
    "SELECT * FROM payments WHERE status = 'pending' AND due_date <= ?"
  ).all(now);

  console.log(`[cron-payments] ${duePayments.length} paiement(s) du(s) a traiter`);

  for (const payment of duePayments) {
    await attemptCharge(payment);
  }
}

async function attemptCharge(payment) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: payment.amount_due,
      currency: 'eur',
      customer: payment.stripe_customer_id,
      payment_method: payment.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { email: payment.email, plan: payment.plan, type: 'second_installment' },
    });

    if (paymentIntent.status === 'succeeded') {
      db.prepare("UPDATE payments SET status = 'paid', last_attempt_at = ? WHERE id = ?")
        .run(Date.now(), payment.id);
      console.log(`[cron-payments] Paiement reussi pour ${payment.email}`);
      await sendEmail(payment.email, 'Confirmation de ton 2e versement - OTE 705',
        `<p>Ton 2e versement de ${(payment.amount_due/100).toFixed(2)}€ a ete preleve avec succes. Merci !</p>`);
    }
  } catch (err) {
    console.error(`[cron-payments] Echec prelevement pour ${payment.email}:`, err.message);
    const newRetryCount = payment.retry_count + 1;

    if (newRetryCount > MAX_RETRIES) {
      // Echec definitif -> bloquer l'acces formation + email de relance
      db.prepare("UPDATE payments SET status = 'failed', retry_count = ?, last_attempt_at = ? WHERE id = ?")
        .run(newRetryCount, Date.now(), payment.id);
      db.prepare("UPDATE users SET role = 'community' WHERE LOWER(email) = ?").run(payment.email.toLowerCase());

      await sendEmail(payment.email, 'Action requise - ton acces a la formation OTE 705',
        `<p>Nous n'avons pas pu preleve ton 2e versement de ${(payment.amount_due/100).toFixed(2)}€ apres plusieurs tentatives.</p>
         <p>Ton acces a la formation a ete temporairement suspendu. Pour le reactiver, merci de relancer ton paiement :</p>
         <a href="${appUrl}/checkout.html?retry=${payment.id}" style="display:inline-block;background:#F4C70F;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Relancer mon paiement</a>`);
      console.log(`[cron-payments] Acces bloque pour ${payment.email} apres ${newRetryCount} echecs`);
    } else {
      const delayDays = RETRY_DELAYS_DAYS[newRetryCount - 1] || 14;
      const nextDueDate = Date.now() + delayDays * 24 * 60 * 60 * 1000;
      db.prepare("UPDATE payments SET retry_count = ?, last_attempt_at = ?, due_date = ? WHERE id = ?")
        .run(newRetryCount, Date.now(), nextDueDate, payment.id);
      console.log(`[cron-payments] Retry ${newRetryCount}/${MAX_RETRIES} programme pour ${payment.email} dans ${delayDays} jour(s)`);
    }
  }
}

async function sendEmail(to, subject, html) {
  try {
    await resend.emails.send({
      from: 'Esprit Trading <noreply@mail.esprittrading.fr>',
      to,
      subject,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
        <h2 style="color:#F4C70F">Esprit Trading</h2>
        ${html}
      </div>`
    });
  } catch (e) {
    console.error('Erreur envoi email cron:', e);
  }
}

function startPaymentCron() {
  // Tous les jours a 9h du matin
  cron.schedule('0 9 * * *', () => {
    console.log('[cron-payments] Execution planifiee');
    processPendingPayments();
  });
  console.log('[cron-payments] Cron job demarre (tous les jours a 9h)');
}

module.exports = { startPaymentCron, processPendingPayments, attemptCharge };
