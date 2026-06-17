const Database = require('better-sqlite3');
const db = new Database('./data/trades.db');
const trades = db.prepare('SELECT id, user_id, pair FROM trades ORDER BY id DESC LIMIT 5').all();
console.log('Derniers trades:', trades);
const users = db.prepare('SELECT id, username FROM users').all();
console.log('Users:', users);
