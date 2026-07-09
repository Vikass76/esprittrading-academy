const https = require('https');

const LIST_IDS = {
  community: 3,
  student: 5,
  leadMagnet: 4,
};

async function addContactToBrevo({ email, firstname, lastname, role }) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      email,
      attributes: { PRENOM: firstname || '', NOM: lastname || '' },
      listIds: [role === 'student' ? LIST_IDS.student : LIST_IDS.community],
      updateEnabled: true,
    });

    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/contacts',
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      console.log(`[Brevo] Contact ajouté: ${email} → status ${res.statusCode}`);
      resolve();
    });

    req.on('error', (err) => {
      console.error('[Brevo] Erreur:', err.message);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

module.exports = { addContactToBrevo };
