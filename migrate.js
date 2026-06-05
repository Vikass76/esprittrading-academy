const Database = require('better-sqlite3');
const db = new Database('data.db');
const cols = db.prepare('PRAGMA table_info(trades)').all().map(c => c.name);
const add = ['direction','pnl','lot_size','entry_price','exit_price','stop_loss','take_profit','session','setup','timeframe','emotions','screenshot2','entry_time','exit_time','account_id'];
add.forEach(col => {
  if (!cols.includes(col)) {
    try { db.exec('ALTER TABLE trades ADD COLUMN ' + col + ' TEXT'); console.log('Added: ' + col); }
    catch(e) {}
  }
});
try {
  db.exec('CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT DEFAULT "live", currency TEXT DEFAULT "USD", initial_balance REAL DEFAULT 10000, current_balance REAL DEFAULT 10000, broker TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  console.log('accounts OK');
} catch(e) {}
console.log('Done!');
