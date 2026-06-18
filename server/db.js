const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = process.env.RENDER ? '/data/data.db' : path.join(__dirname, '../data.db');
const db = new Database(dbPath);

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

module.exports = db;
