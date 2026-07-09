const axios = require('axios');

const LIST_IDS = {
  community: 3,
  student: 5,
  leadMagnet: 4,
};

async function addContactToBrevo({ email, firstname, lastname, role }) {
  try {
    await axios.post('https://api.brevo.com/v3/contacts', {
      email,
      attributes: {
        PRENOM: firstname || '',
        NOM: lastname || '',
      },
      listIds: [role === 'student' ? LIST_IDS.student : LIST_IDS.community],
      updateEnabled: true,
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      }
    });
    console.log(`[Brevo] Contact ajouté: ${email} → liste ${role}`);
  } catch (err) {
    console.error('[Brevo] Erreur:', err?.response?.data || err.message);
  }
}

module.exports = { addContactToBrevo };
