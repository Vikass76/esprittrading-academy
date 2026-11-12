const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

const fs = require('fs');
const coversDir = path.join(__dirname, '../../uploads/covers');
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

const UPLOAD_BASE = process.env.RENDER ? '/data/uploads' : path.join(__dirname, '../../uploads');
const fsExtra = require('fs');
[UPLOAD_BASE + '/videos', UPLOAD_BASE + '/covers'].forEach(d => {
  if (!fsExtra.existsSync(d)) fsExtra.mkdirSync(d, { recursive: true });
});
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = file.fieldname === 'cover'
        ? UPLOAD_BASE + '/covers'
        : UPLOAD_BASE + '/videos';
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'cover' && file.mimetype.startsWith('image/')) return cb(null, true);
    if (file.fieldname === 'file' && file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Type de fichier non accepté'));
  }
});
const mediaFields = uploadMedia.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, username, role, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC").all();
  res.json(users);
});

router.get('/users/search', requireAdmin, (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const user = db.prepare("SELECT id, username, role, email, firstname, lastname FROM users WHERE LOWER(email) = ?").get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Aucun compte trouvé avec cet email' });
  res.json(user);
});
router.patch('/users/:id/demote', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare("UPDATE users SET role = 'community' WHERE id = ?").run(req.params.id);
  res.json({ ok: true, message: 'Acces formation retire' });
});
router.patch('/users/:id/promote', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(req.params.id);
  res.json({ ok: true, message: 'Accès formation débloqué' });
});
router.post('/users', requireAdmin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Cet identifiant est déjà utilisé' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username.trim(), hash, 'student');
  res.json({ id: result.lastInsertRowid, username: username.trim() });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Élève introuvable' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.patch('/users/:id/username', requireAdmin, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Identifiant requis' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
  if (existing) return res.status(400).json({ error: 'Identifiant déjà utilisé' });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.params.id);
  res.json({ ok: true });
});
router.patch('/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe invalide (minimum 6 caractères)' });
  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Élève introuvable' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// Modules
router.get('/modules', requireAdmin, (req, res) => {
  const modules = db.prepare('SELECT * FROM modules ORDER BY position').all();
  res.json(modules);
});

router.post('/modules', requireAdmin, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as next FROM modules').get().next;
  const result = db.prepare('INSERT INTO modules (title, description, position) VALUES (?, ?, ?)').run(title, description || '', pos);
  res.json({ id: result.lastInsertRowid, title, description, position: pos });
});

router.patch('/modules/:id', requireAdmin, (req, res) => {
  const { title, position } = req.body;
  const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'Module introuvable' });
  if (title) db.prepare('UPDATE modules SET title = ? WHERE id = ?').run(title, req.params.id);
  if (position !== undefined) db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(position, req.params.id);
  res.json({ ok: true });
});
router.patch('/modules/:id/position', requireAdmin, (req, res) => {
  const { direction } = req.body;
  const mod = db.prepare('SELECT * FROM modules ORDER BY position').all();
  const idx = mod.findIndex(m => m.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Module introuvable' });
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= mod.length) return res.json({ ok: true });
  const posA = mod[idx].position, posB = mod[swapIdx].position;
  db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(posB, mod[idx].id);
  db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(posA, mod[swapIdx].id);
  res.json({ ok: true });
});
router.patch('/videos/:id/position', requireAdmin, (req, res) => {
  const { direction } = req.body;
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });
  const vids = db.prepare('SELECT * FROM videos WHERE module_id = ? ORDER BY position').all(video.module_id);
  const idx = vids.findIndex(v => v.id == req.params.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= vids.length) return res.json({ ok: true });
  const posA = vids[idx].position, posB = vids[swapIdx].position;
  db.prepare('UPDATE videos SET position = ? WHERE id = ?').run(posB, vids[idx].id);
  db.prepare('UPDATE videos SET position = ? WHERE id = ?').run(posA, vids[swapIdx].id);
  res.json({ ok: true });
});
router.delete('/modules/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Vidéos
router.post('/videos', requireAdmin, mediaFields, (req, res) => {
  const { module_id, title, description } = req.body;
  const url = req.files?.file?.[0] ? `/uploads/videos/${req.files.file[0].filename}` : req.body.url;
  const cover = req.files?.cover?.[0] ? `/uploads/covers/${req.files.cover[0].filename}` : null;
  if (!module_id || !title || !url) return res.status(400).json({ error: 'module_id, titre et URL/fichier requis' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as next FROM videos WHERE module_id = ?').get(module_id).next;
  const result = db.prepare('INSERT INTO videos (module_id, title, url, description, position, cover) VALUES (?, ?, ?, ?, ?, ?)').run(module_id, title, url, description || '', pos, cover);
  res.json({ id: result.lastInsertRowid, module_id, title, url, description, cover, position: pos });
});

router.patch('/videos/:id', requireAdmin, mediaFields, (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  const title = req.body.title || video.title;
  const description = req.body.description !== undefined ? req.body.description : video.description;
  const cover = req.files?.cover?.[0] ? `/uploads/covers/${req.files.cover[0].filename}` : video.cover;
  let url = video.url;
  if (req.files?.file?.[0]) url = `/uploads/videos/${req.files.file[0].filename}`;
  else if (req.body.url) url = req.body.url;

  db.prepare('UPDATE videos SET title = ?, description = ?, cover = ?, url = ? WHERE id = ?').run(title, description, cover, url, req.params.id);
  res.json({ id: video.id, title, description, cover, url });
});

router.delete('/videos/:id', requireAdmin, (req, res) => {
  const video = db.prepare('SELECT url, cover FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).json({ error: 'Vidéo introuvable' });

  db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);

  for (const field of [video.url, video.cover]) {
    if (field?.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, '../../', field), () => {});
    }
  }

  res.json({ success: true });
});

module.exports = router;

// Liste des inscrits avec filtres
router.get('/inscrits', requireAdmin, (req, res) => {
  const { role, period } = req.query;
  let query = 'SELECT id, username, email, role, firstname, lastname, created_at FROM users WHERE 1=1';
  const params = [];

  if (role && role !== 'all') {
    query += ' AND role = ?';
    params.push(role);
  }

  if (period && period !== 'all') {
    const days = parseInt(period);
    query += ` AND created_at >= datetime('now', '-${days} days')`;
  }

  query += ' ORDER BY created_at DESC';

  const users = db.prepare(query).all(...params);
  res.json({ users });
});

// Export CSV inscrits community
router.get('/inscrits/export', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT email, firstname, lastname, role, created_at FROM users WHERE role = 'community' ORDER BY created_at DESC").all();
  const csv = ['Email,Prenom,Nom,Role,Date inscription']
    .concat(users.map(u => `${u.email},${u.firstname||''},${u.lastname||''},${u.role},${u.created_at}`))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="community_export.csv"');
  res.send(csv);
});

// Marquer un paiement comme paid (stopper les retries)
router.patch('/payments/:email/paid', requireAdmin, (req, res) => {
  const email = req.params.email.toLowerCase();
  const payment = db.prepare("SELECT * FROM payments WHERE LOWER(email) = ?").get(email);
  if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
  db.prepare("UPDATE payments SET status = 'paid', retry_count = 99 WHERE LOWER(email) = ?").run(email);
  res.json({ success: true, message: `Paiement de ${email} marqué comme payé` });
});



// OTE705_STRIPE_RECON_V2 — lecture Stripe + rattachement vérifié, sans débit
const oteStripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
router.get('/student-stripe-payments', requireAdmin, async (req,res) => {
 try {
  const page = await oteStripe.paymentIntents.list({limit:100, ...(req.query.before ? {starting_after:String(req.query.before)} : {})});
  const ids = page.data.map(p=>p.id);
  const attached = ids.length ? db.prepare(`SELECT stripe_payment_id,user_id FROM ote_student_receipts WHERE stripe_payment_id IN (${ids.map(()=>'?').join(',')})`).all(...ids) : [];
  const attachedMap = new Map(attached.map(x=>[x.stripe_payment_id,x.user_id]));
  res.json({payments:page.data.filter(p=>p.status==='succeeded' && p.currency==='eur').map(p=>({
   id:p.id,amount_cents:p.amount_received||p.amount,created:p.created,
   email:p.receipt_email||p.metadata?.email||null,customer:p.customer||null,
   description:p.description||'',attached_user_id:attachedMap.get(p.id)||null
  })),has_more:page.has_more,next_cursor:page.data.at(-1)?.id||null});
 }catch(e){console.error('Stripe reconciliation:',e.message);res.status(502).json({error:'Impossible de consulter Stripe. Vérifiez la clé et le mode Stripe du serveur.'});}
});
router.post('/student-finances/:id/stripe-attach', requireAdmin, async (req,res) => {
 const id=Number(req.params.id), ref=String(req.body?.payment_intent_id||'');
 if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM users WHERE id=?').get(id))return res.status(404).json({error:'Élève introuvable'});
 if(!/^pi_[a-zA-Z0-9_]+$/.test(ref))return res.status(400).json({error:'Référence Stripe invalide'});
 try {
  const pi=await oteStripe.paymentIntents.retrieve(ref);
  if(pi.status!=='succeeded'||pi.currency!=='eur'||!(pi.amount_received>0))return res.status(400).json({error:'Paiement non confirmé en EUR'});
  const existing=db.prepare('SELECT user_id FROM ote_student_receipts WHERE stripe_payment_id=?').get(ref);
  if(existing)return res.status(409).json({error:'Paiement déjà rattaché à un élève'});
  // Les anciennes saisies avec un identifiant ch_ peuvent représenter le même paiement.
  const chargeId=typeof pi.latest_charge==='string'?pi.latest_charge:null;
  if(chargeId && db.prepare('SELECT id FROM ote_student_receipts WHERE stripe_payment_id=?').get(chargeId))return res.status(409).json({error:'Paiement déjà saisi avec sa référence ch_'});
  db.prepare('INSERT INTO ote_student_receipts(user_id,amount_cents,paid_on,stripe_payment_id,source,note) VALUES(?,?,?,?,?,?)')
   .run(id,pi.amount_received,new Date(pi.created*1000).toISOString().slice(0,10),ref,'stripe_personnalise','Import vérifié depuis Stripe');
  res.json({ok:true});
 }catch(e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Paiement déjà enregistré'});if(e.type?.startsWith('Stripe'))return res.status(400).json({error:'Transaction introuvable dans le compte Stripe configuré'});console.error('Stripe attach:',e);res.status(500).json({error:'Échec du rattachement'});}
});

// OTE705_SYNC_V1 : import en lecture seule Stripe, sans prélèvement ni changement d'accès.
let oteSyncRunning = false;
let oteLastSync = null;
async function oteRunStripeSync() {
 if (oteSyncRunning) return {ok:true, busy:true};
 oteSyncRunning = true;
 try {
  const users=db.prepare("SELECT id, LOWER(TRIM(email)) AS email FROM users WHERE email IS NOT NULL AND role='student'").all();
  const byEmail=new Map();
  for(const u of users){if(!byEmail.has(u.email))byEmail.set(u.email,[]);byEmail.get(u.email).push(u.id);}
  const sessions=new Map();
  let cursor, sessionCount=0;
  for(let page=0;page<10;page++){
   const batch=await oteStripe.checkout.sessions.list({limit:100,...(cursor?{starting_after:cursor}:{})});
   for(const sess of batch.data){
    if(sess.mode!=='payment'||!sess.payment_intent)continue;
    const pi=typeof sess.payment_intent==='string'?sess.payment_intent:sess.payment_intent.id;
    sessions.set(pi,sess);
   }
   sessionCount+=batch.data.length;
   if(!batch.has_more||!batch.data.length)break;
   cursor=batch.data[batch.data.length-1].id;
  }
  let imported=0,existing=0,unmatched=0,offersCreated=0,scanned=0;
  const customers=new Map();
  cursor=undefined;
  for(let page=0;page<10;page++){
   const batch=await oteStripe.paymentIntents.list({limit:100,...(cursor?{starting_after:cursor}:{})});
   for(const pi of batch.data){
    scanned++;
    if(pi.status!=='succeeded'||pi.currency!=='eur'||!(pi.amount_received>0))continue;
    const session=sessions.get(pi.id);
    const meta=pi.metadata||{};
    // Ne pas importer d'autres produits : achat OTE identifié par ses métadonnées,
    // ou par une ligne de commande Checkout explicitement OTE 705.
    const native=meta.plan==='full'||meta.plan==='split'||meta.plan==='split-retry'||meta.type==='second_installment';
    let lineItems=[];
    if(!native&&session){
     const lines=await oteStripe.checkout.sessions.listLineItems(session.id,{limit:20});
     lineItems=lines.data||[];
    }
    const isOte=native||lineItems.some(l=>/OTE\s*705|accompagnement\s+OTE/i.test(l.description||''));
    if(!isOte)continue;
    let email=(session?.customer_details?.email||session?.customer_email||meta.email||pi.receipt_email||'').trim().toLowerCase();
    if(email==='pending@esprittrading.fr')email='';
    const customerId=typeof pi.customer==='string'?pi.customer:pi.customer?.id;
    if(!email&&customerId){
     if(!customers.has(customerId)){
      try{const c=await oteStripe.customers.retrieve(customerId);customers.set(customerId,!c.deleted?c.email||'':'');}
      catch(e){customers.set(customerId,'');}
     }
     email=String(customers.get(customerId)||'').trim().toLowerCase();
    }
    const ids=byEmail.get(email)||[];
    if(ids.length!==1){unmatched++;continue;}
    const id=ids[0];
    const chargeId=typeof pi.latest_charge==='string'?pi.latest_charge:null;
    const prev=db.prepare('SELECT user_id FROM ote_student_receipts WHERE stripe_payment_id=?').get(pi.id);
    const prevCharge=chargeId?db.prepare('SELECT user_id FROM ote_student_receipts WHERE stripe_payment_id=?').get(chargeId):null;
    if((prev&&prev.user_id!==id)||(prevCharge&&prevCharge.user_id!==id)){unmatched++;continue;}
    const alreadyAttached=!!(prev||prevCharge);
    if(alreadyAttached)existing++;
    const paidOn=new Date(pi.created*1000).toISOString().slice(0,10);
    db.transaction(()=>{
     if(!alreadyAttached)db.prepare(`INSERT OR IGNORE INTO ote_student_receipts(user_id,amount_cents,paid_on,stripe_payment_id,source,note)
       VALUES(?,?,?,?,?,?)`).run(id,pi.amount_received,paidOn,pi.id,session?'stripe_personnalise':'stripe_standard','Synchronisation Stripe vérifiée');
     const offer=db.prepare('SELECT user_id FROM ote_student_offers WHERE user_id=?').get(id);
     if(!offer){
      let agreed=null,installments=1;
      if(meta.plan==='full')agreed=pi.amount_received;
      else if(meta.plan==='split'){
       const scheduled=db.prepare("SELECT amount_due FROM payments WHERE LOWER(email)=? AND stripe_payment_intent_id LIKE ?").all(email,pi.id+'-installment-%');
       if(scheduled.length===2){agreed=pi.amount_received+scheduled.reduce((a,p)=>a+Number(p.amount_due),0);installments=3;}
      }else if(session&&lineItems.length===1&&lineItems[0].quantity===1&&session.amount_total===pi.amount_received){
       // Uniquement un achat OTE en une fois explicitement identifié dans Checkout.
       agreed=pi.amount_received;
      }
      if(agreed!==null){
       const result=db.prepare(`INSERT OR IGNORE INTO ote_student_offers
        (user_id,offer_name,agreed_cents,installments,first_due,payment_source)
        VALUES(?,'OTE 705',?,?,?,?)`).run(id,agreed,installments,paidOn,session?'stripe_personnalise':'stripe_standard');
       offersCreated+=result.changes;
      }
     }
    })();
    if(!alreadyAttached)imported++;
   }
   if(!batch.has_more||!batch.data.length)break;
   cursor=batch.data[batch.data.length-1].id;
  }
  oteLastSync = new Date().toISOString();
  return {ok:true,scanned,sessionCount,imported,existing,unmatched,offersCreated,limitReached:scanned>=1000, lastSync:oteLastSync};
 } finally { oteSyncRunning = false; }
}
router.post('/student-finances/sync-stripe', requireAdmin, async (req,res) => {
 try { res.json(await oteRunStripeSync()); }
 catch(e){console.error('[OTE Finance] Sync Stripe:',e);res.status(502).json({error:'Synchronisation Stripe interrompue'});}
});
// Lecture Stripe uniquement. Démarrage différé et synchronisation régulière,
// sans requête admin, sans prélèvement ni modification des accès.
if (process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
 const run = () => oteRunStripeSync()
   .then(r => console.log('[OTE Finance] Sync automatique:', JSON.stringify(r)))
   .catch(e => console.error('[OTE Finance] Sync automatique échouée:', e));
 const initial = setTimeout(run, 90 * 1000);
 initial.unref?.();
 const periodic = setInterval(run, 15 * 60 * 1000);
 periodic.unref?.();
}


// OTE705_FINANCE_V1 — suivi administratif ; ne modifie pas les prélèvements existants
router.get('/student-finances', requireAdmin, (req,res) => {
 const offers=db.prepare(`SELECT u.id AS user_id, o.offer_name, o.agreed_cents, o.installments, o.first_due,
 o.payment_source, o.stripe_link, o.notes, o.updated_at,
 COALESCE((SELECT MIN(r.paid_on) FROM ote_student_receipts r WHERE r.user_id=u.id), o.first_due) AS first_payment_on,
 COALESCE((SELECT SUM(r.amount_cents) FROM ote_student_receipts r WHERE r.user_id=u.id),0) AS paid_cents
 FROM users u LEFT JOIN ote_student_offers o ON o.user_id=u.id
 WHERE o.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM ote_student_receipts r WHERE r.user_id=u.id)`).all();
 // Prévisions indicatives : mensualités égales, sans modifier les prélèvements existants.
 // Une date non renseignée ou un prix soldé ne génère aucune échéance.
 const today=new Date().toISOString().slice(0,10);
 const limit=new Date();limit.setUTCDate(limit.getUTCDate()+30);
 const limitISO=limit.toISOString().slice(0,10);
 const addMonths=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);const first=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);};

 for(const o of offers){
  o.next_due=null;o.next_due_cents=0;o.due_status=null;
  o.schedule=[];o.late_count=0;o.late_cents=0;
  o.upcoming_count=0;o.upcoming_cents=0;
  const price=Number(o.agreed_cents||0);
  const paid=Number(o.paid_cents||0);
  const count=Number(o.installments||0);
  if(!o.first_due||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(o.first_due)||!price||count<1)continue;
  const base=Math.floor(price/count),remainder=price-base*count;
  let covered=Math.max(0,paid);
  for(let i=0;i<count;i++){
   const amount=base+(i===count-1?remainder:0);
   const applied=Math.min(covered,amount);
   covered-=applied;
   const outstanding=amount-applied;
   const due=addMonths(o.first_due,i);
   const status=outstanding===0?'paid':due<today?'late':due<=limitISO?'upcoming':'later';
   o.schedule.push({number:i+1,due,amount_cents:amount,remaining_cents:outstanding,status});
   if(!outstanding)continue;
   if(!o.next_due){
    o.next_due=due;o.next_due_cents=outstanding;o.due_status=status;
   }
   if(status==='late'){o.late_count++;o.late_cents+=outstanding;}
   if(status==='upcoming'){o.upcoming_count++;o.upcoming_cents+=outstanding;}
  }
 }

 res.json({offers});
});
router.get('/student-finances/:id', requireAdmin, (req,res) => {
 const user=db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
 if(!user) return res.status(404).json({error:'Élève introuvable'});
 const offer=db.prepare('SELECT * FROM ote_student_offers WHERE user_id=?').get(user.id)||null;
 const receipts=db.prepare('SELECT * FROM ote_student_receipts WHERE user_id=? ORDER BY paid_on DESC,id DESC').all(user.id);
 res.json({offer,receipts});
});
router.put('/student-finances/:id', requireAdmin, (req,res) => {
 const id=Number(req.params.id), b=req.body||{};
 if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM users WHERE id=?').get(id))return res.status(404).json({error:'Élève introuvable'});
 const euros=Number(b.agreed_euros), n=Number(b.installments);
 if(!Number.isFinite(euros)||euros<0||euros>1000000||!Number.isInteger(n)||n<1||n>24)return res.status(400).json({error:'Prix ou échéancier invalide'});
 const cents=Math.round(euros*100);
 const due=String(b.first_due||'');
 if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return res.status(400).json({error:'Date invalide'});
 const source=String(b.payment_source||'stripe_standard');
 if(!['stripe_standard','stripe_personnalise','manuel','autre'].includes(source))return res.status(400).json({error:'Source invalide'});
 const name=String(b.offer_name||'OTE 705').slice(0,120), link=String(b.stripe_link||'').slice(0,1000), notes=String(b.notes||'').slice(0,2000);
 if(link && !/^https:\/\//i.test(link))return res.status(400).json({error:'Lien HTTPS requis'});
 db.prepare(`INSERT INTO ote_student_offers(user_id,offer_name,agreed_cents,installments,first_due,payment_source,stripe_link,notes) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET offer_name=excluded.offer_name,agreed_cents=excluded.agreed_cents,installments=excluded.installments,first_due=excluded.first_due,payment_source=excluded.payment_source,stripe_link=excluded.stripe_link,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).run(id,name,cents,n,due||null,source,link||null,notes);
 res.json({ok:true});
});
router.post('/student-finances/:id/receipts', requireAdmin, (req,res) => {
 const id=Number(req.params.id),b=req.body||{};
 if(!db.prepare('SELECT id FROM users WHERE id=?').get(id))return res.status(404).json({error:'Élève introuvable'});
 const amount=Number(b.amount_euros),paidOn=String(b.paid_on||''),ref=String(b.stripe_payment_id||'').trim();
 if(!Number.isFinite(amount)||amount<=0||amount>1000000||!/^\d{4}-\d{2}-\d{2}$/.test(paidOn))return res.status(400).json({error:'Montant ou date invalide'});
 if(ref&&!/^(pi_|ch_)[A-Za-z0-9_]+$/.test(ref))return res.status(400).json({error:'Référence Stripe invalide (pi_ ou ch_)'});
 const source=String(b.source||'manuel');
 if(!['stripe_standard','stripe_personnalise','manuel','autre'].includes(source))return res.status(400).json({error:'Source invalide'});
 try {
  db.prepare('INSERT INTO ote_student_receipts(user_id,amount_cents,paid_on,stripe_payment_id,source,note) VALUES(?,?,?,?,?,?)').run(id,Math.round(amount*100),paidOn,ref||null,source,String(b.note||'').slice(0,1000));
  res.json({ok:true});
 } catch(e) { if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Cette référence Stripe est déjà enregistrée'});throw e; }
});
