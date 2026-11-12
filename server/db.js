const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = process.env.RENDER ? '/data/data.db' : path.join(__dirname, '../data.db');
const db = new Database(dbPath);

// Auto-migration
const existingCols = db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
const addCol = (col, type) => { if(!existingCols.includes(col)) db.exec('ALTER TABLE users ADD COLUMN '+col+' '+type); };
addCol('firstname', 'TEXT');
addCol('lastname', 'TEXT');
addCol('email', 'TEXT');
addCol('google_id', 'TEXT');
addCol('verification_token', 'TEXT');
addCol('email_verified', 'INTEGER DEFAULT 1');
addCol('reset_token', 'TEXT');
addCol('reset_token_expiry', 'INTEGER');
addCol('premium_until', 'INTEGER DEFAULT 0');
addCol('stripe_subscription_id', 'TEXT');

// Migration trades
const tradesCols = db.prepare("PRAGMA table_info(trades)").all().map(c=>c.name);
const addTradeCol = (col, type) => { if(!tradesCols.includes(col)) db.exec('ALTER TABLE trades ADD COLUMN '+col+' '+type); };
addTradeCol('direction', 'TEXT');
addTradeCol('pnl', 'REAL');
addTradeCol('lot_size', 'REAL');
addTradeCol('entry_price', 'REAL');
addTradeCol('exit_price', 'REAL');
addTradeCol('stop_loss', 'REAL');
addTradeCol('take_profit', 'REAL');
addTradeCol('session', 'TEXT');
addTradeCol('setup', 'TEXT');
addTradeCol('timeframe', 'TEXT');
addTradeCol('emotions', 'TEXT');
addTradeCol('screenshot2', 'TEXT');
addTradeCol('entry_time', 'TEXT');
addTradeCol('exit_time', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    email TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    cover TEXT,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'live',
    currency TEXT NOT NULL DEFAULT 'USD',
    initial_balance REAL NOT NULL DEFAULT 10000,
    current_balance REAL NOT NULL DEFAULT 10000,
    broker TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'LONG',
    result TEXT NOT NULL CHECK(result IN ('WIN', 'LOSS', 'BE')),
    rr REAL NOT NULL DEFAULT 0,
    pnl REAL DEFAULT 0,
    lot_size REAL DEFAULT 0,
    entry_price REAL,
    exit_price REAL,
    stop_loss REAL,
    take_profit REAL,
    session TEXT,
    setup TEXT,
    timeframe TEXT,
    emotions TEXT,
    screenshot TEXT,
    screenshot2 TEXT,
    notes TEXT,
    trade_date DATE NOT NULL,
    entry_time TEXT,
    exit_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );
`);

// V25 : progression des vidéos par élève.
db.exec(`
  CREATE TABLE IF NOT EXISTS video_progress (
    user_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    position_seconds REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  );
`);

// V67 : statut terminé, indépendant de la reprise de lecture.
const progressCols = db.prepare('PRAGMA table_info(video_progress)')
  .all().map(c => c.name);
if (!progressCols.includes('completed')) {
  db.exec('ALTER TABLE video_progress ADD COLUMN completed INTEGER NOT NULL DEFAULT 0');
}

// Migrations pour colonnes manquantes
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT');
if (!userCols.includes('avatar')) db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');

const videoCols = db.prepare('PRAGMA table_info(videos)').all().map(c => c.name);
if (!videoCols.includes('cover')) db.exec('ALTER TABLE videos ADD COLUMN cover TEXT');

const tradeCols = db.prepare('PRAGMA table_info(trades)').all().map(c => c.name);
const newTradeCols = ['account_id','direction','pnl','lot_size','entry_price','exit_price','stop_loss','take_profit','session','setup','timeframe','emotions','screenshot2','entry_time','exit_time'];
newTradeCols.forEach(col => {
  if (!tradeCols.includes(col)) {
    const def = ['pnl','lot_size','entry_price','exit_price','stop_loss','take_profit'].includes(col)
      ? `ALTER TABLE trades ADD COLUMN ${col} REAL DEFAULT 0`
      : `ALTER TABLE trades ADD COLUMN ${col} TEXT`;
    try { db.exec(def); } catch(e) {}
  }
});

// Résultat BE
try {
  db.exec(`CREATE TABLE IF NOT EXISTS trades_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'LONG',
    result TEXT NOT NULL,
    rr REAL NOT NULL DEFAULT 0,
    pnl REAL DEFAULT 0,
    lot_size REAL DEFAULT 0,
    entry_price REAL,
    exit_price REAL,
    stop_loss REAL,
    take_profit REAL,
    session TEXT,
    setup TEXT,
    timeframe TEXT,
    emotions TEXT,
    screenshot TEXT,
    screenshot2 TEXT,
    notes TEXT,
    trade_date DATE NOT NULL,
    entry_time TEXT,
    exit_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch(e) {}

// Admin par défaut
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('Compte admin créé — admin / admin123');
}


// Table de suivi des paiements en plusieurs fois (Stripe)
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    stripe_payment_method_id TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'split',
    amount_due REAL NOT NULL,
    due_date INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);


// Protection contre les echeances Stripe en double
const paymentCols = db.prepare('PRAGMA table_info(payments)').all().map(c => c.name);

if (!paymentCols.includes('stripe_payment_intent_id')) {
  db.exec('ALTER TABLE payments ADD COLUMN stripe_payment_intent_id TEXT');
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_intent
  ON payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL
`);

// Table de suivi des RDV mensuels
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    calendly_event_id TEXT,
    booked_at INTEGER NOT NULL,
    unlocked_at INTEGER NOT NULL,
    meeting_link TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration meeting_link
const apptCols = db.prepare('PRAGMA table_info(appointments)').all().map(c => c.name);
if (apptCols.indexOf('meeting_link') < 0) db.exec('ALTER TABLE appointments ADD COLUMN meeting_link TEXT');
if (apptCols.indexOf('calendly_invitee_id') < 0) db.exec('ALTER TABLE appointments ADD COLUMN calendly_invitee_id TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS nathan_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL,
    result TEXT NOT NULL,
    rr TEXT NOT NULL,
    image_path TEXT,
    video_url TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    discount_percent INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insérer le code OTE20 si pas encore là
const existing = db.prepare("SELECT id FROM promo_codes WHERE code = 'OTE20'").get();
if (!existing) {
  db.prepare("INSERT INTO promo_codes (code, discount_percent) VALUES ('OTE20', 20)").run();
}
db.prepare("UPDATE promo_codes SET discount_percent = 20 WHERE code = 'OTE20' AND discount_percent != 20").run();


// V87 - Progression du parcours OTE 705
db.exec(`
  CREATE TABLE IF NOT EXISTS parcours_progress (
    user_id INTEGER NOT NULL,
    step INTEGER NOT NULL CHECK(step BETWEEN 1 AND 7),
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, step),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);


// OTE705_FINANCE_V1 : suivi administratif indépendant des prélèvements Stripe
// Montants stockés en centimes ; les écritures manuelles ne déclenchent aucun paiement.
db.exec(`
 CREATE TABLE IF NOT EXISTS ote_student_offers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  offer_name TEXT NOT NULL DEFAULT 'OTE 705',
  agreed_cents INTEGER NOT NULL CHECK(agreed_cents >= 0),
  installments INTEGER NOT NULL DEFAULT 1 CHECK(installments BETWEEN 1 AND 24),
  first_due TEXT,
  payment_source TEXT NOT NULL DEFAULT 'stripe_standard',
  stripe_link TEXT,
  notes TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS ote_student_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  paid_on TEXT NOT NULL,
  stripe_payment_id TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'manuel',
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
 );
 CREATE INDEX IF NOT EXISTS idx_ote_receipts_user ON ote_student_receipts(user_id);
`);

module.exports = db;
