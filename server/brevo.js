const SibApiV3Sdk = require('@getbrevo/brevo');

const apiInstance = new SibApiV3Sdk.ContactsApi();
apiInstance.setApiKey(SibApiV3Sdk.ContactsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const LIST_IDS = {
  community: 3,  // Community Academy
  student: 5,    // Élèves
  leadMagnet: 4, // Lead Magnet
};

async function addContactToBrevo({ email, firstname, lastname, role }) {
  try {
    const contact = {
      email,
      attributes: {
        PRENOM: firstname || '',
        NOM: lastname || '',
      },
      listIds: [role === 'student' ? LIST_IDS.student : LIST_IDS.community],
      updateEnabled: true,
    };
    await apiInstance.createContact(contact);
    console.log(`[Brevo] Contact ajouté: ${email} → liste ${role}`);
  } catch (err) {
    console.error('[Brevo] Erreur ajout contact:', err?.response?.text || err.message);
  }
}

module.exports = { addContactToBrevo };
