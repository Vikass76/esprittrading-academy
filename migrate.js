const db = require('better-sqlite3')('data.db');
const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
['firstname','lastname','google_id'].forEach(col => {
  if (!cols.includes(col)) { db.exec('ALTER TABLE users ADD COLUMN ' + col + ' TEXT'); console.log('Added:', col); }
  else console.log('OK:', col);
});
console.log('Done');
