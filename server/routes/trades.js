const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `trade_${req.session.userId}_${Date.now()}_${Math.random().toString(36).substr(2,5)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images uniquement'));
  }
});

router.get('/accounts', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(req.session.userId));
});

router.post('/accounts', requireAuth, (req, res) => {
  const { name, type, currency, initial_balance, broker } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const bal = parseFloat(initial_balance) || 10000;
  const row = db.prepare('INSERT INTO accounts (user_id, name, type, currency, initial_balance, current_balance, broker) VALUES (?,?,?,?,?,?,?)')
    .run(req.session.userId, name, type||'live', currency||'USD', bal, bal, broker||'');
  res.json({ id: row.lastInsertRowid });
});

router.delete('/accounts/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ success: true });
});

router.get('/stats', requireAuth, (req, res) => {
  const { account_id, from, to } = req.query;
  let q = 'SELECT * FROM trades WHERE user_id = ?';
  const p = [req.session.userId];
  if (account_id) { q += ' AND account_id = ?'; p.push(account_id); }
  if (from) { q += ' AND trade_date >= ?'; p.push(from); }
  if (to)   { q += ' AND trade_date <= ?'; p.push(to); }
  const trades = db.prepare(q).all(...p);

  const total = trades.length;
  const wins = trades.filter(t => t.result === 'WIN').length;
  const losses = trades.filter(t => t.result === 'LOSS').length;
  const be = trades.filter(t => t.result === 'BE').length;
  const winRate = total > 0 ? (wins / total * 100).toFixed(1) : 0;
  const totalRR = trades.reduce((s, t) => s + (parseFloat(t.rr) || 0), 0);
  const totalPnl = trades.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0);
  const avgRR = total > 0 ? totalRR / total : 0;
  const avgWinRR = wins > 0 ? trades.filter(t=>t.result==='WIN').reduce((s,t)=>s+(parseFloat(t.rr)||0),0)/wins : 0;
  const avgLossRR = losses > 0 ? trades.filter(t=>t.result==='LOSS').reduce((s,t)=>s+(parseFloat(t.rr)||0),0)/losses : 0;
  const rrVals = trades.map(t => parseFloat(t.rr)||0);
  const bestRR = rrVals.length ? Math.max(...rrVals) : 0;
  const worstRR = rrVals.length ? Math.min(...rrVals) : 0;
  let maxStreak = 0, curStreak = 0;
  const sorted = [...trades].sort((a,b) => a.trade_date.localeCompare(b.trade_date));
  for (const t of sorted) {
    if (t.result === 'WIN') { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  }
  let curStreakType = null, curStreakCount = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (curStreakType === null) { curStreakType = r; curStreakCount = 1; }
    else if (r === curStreakType) curStreakCount++;
    else break;
  }
  const byPair = {};
  for (const t of trades) {
    if (!byPair[t.pair]) byPair[t.pair] = { pair: t.pair, total: 0, wins: 0, losses: 0, rr: 0, pnl: 0 };
    byPair[t.pair].total++;
    if (t.result === 'WIN') byPair[t.pair].wins++;
    if (t.result === 'LOSS') byPair[t.pair].losses++;
    byPair[t.pair].rr += parseFloat(t.rr) || 0;
    byPair[t.pair].pnl += parseFloat(t.pnl) || 0;
  }
  const bySession = {};
  for (const t of trades) {
    const s = t.session || 'Non définie';
    if (!bySession[s]) bySession[s] = { session: s, total: 0, wins: 0, rr: 0 };
    bySession[s].total++;
    if (t.result === 'WIN') bySession[s].wins++;
    bySession[s].rr += parseFloat(t.rr) || 0;
  }
  const byDay = { Mon:{total:0,wins:0,rr:0}, Tue:{total:0,wins:0,rr:0}, Wed:{total:0,wins:0,rr:0}, Thu:{total:0,wins:0,rr:0}, Fri:{total:0,wins:0,rr:0} };
  const dayKeys = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for (const t of trades) {
    const d = dayKeys[new Date(t.trade_date + 'T12:00:00').getDay()];
    if (byDay[d]) { byDay[d].total++; if (t.result === 'WIN') byDay[d].wins++; byDay[d].rr += parseFloat(t.rr) || 0; }
  }
  let cumRR = 0;
  const equityCurve = sorted.map(t => {
    cumRR = parseFloat((cumRR + (parseFloat(t.rr)||0)).toFixed(3));
    return { date: t.trade_date, rr: cumRR, result: t.result };
  });

  res.json({
    total, wins, losses, be, winRate: parseFloat(winRate),
    totalRR: parseFloat(totalRR.toFixed(2)), totalPnl: parseFloat(totalPnl.toFixed(2)),
    avgRR: parseFloat(avgRR.toFixed(2)), avgWinRR: parseFloat(avgWinRR.toFixed(2)),
    avgLossRR: parseFloat(avgLossRR.toFixed(2)), bestRR, worstRR, maxStreak,
    currentStreak: { type: curStreakType, count: curStreakCount },
    byPair: Object.values(byPair).sort((a,b) => b.total - a.total),
    bySession: Object.values(bySession).sort((a,b) => b.total - a.total),
    byDay, equityCurve
  });
});


function recalcBalance(db, account_id, user_id) {
  if (!account_id) return;
  const tot = db.prepare('SELECT COALESCE(SUM(pnl),0) as total FROM trades WHERE account_id = ?').get(String(account_id));
  const acc = db.prepare('SELECT initial_balance FROM accounts WHERE id = ?').get(account_id);
  if (acc) db.prepare('UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?')
    .run(acc.initial_balance + tot.total, account_id, user_id);
}

router.get('/', requireAuth, (req, res) => {
  const { pair, result, from, to, session, setup, direction, account_id } = req.query;
  let query = 'SELECT t.*, a.name as account_name FROM trades t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.user_id = ?';
  const params = [req.session.userId];
  if (pair)       { query += ' AND t.pair = ?';        params.push(pair); }
  if (result)     { query += ' AND t.result = ?';      params.push(result); }
  if (from)       { query += ' AND t.trade_date >= ?'; params.push(from); }
  if (to)         { query += ' AND t.trade_date <= ?'; params.push(to); }
  if (session)    { query += ' AND t.session = ?';     params.push(session); }
  if (setup)      { query += ' AND t.setup = ?';       params.push(setup); }
  if (direction)  { query += ' AND t.direction = ?';   params.push(direction); }
  if (account_id) { query += ' AND t.account_id = ?';  params.push(account_id); }
  query += ' ORDER BY t.trade_date DESC, t.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', requireAuth, upload.fields([{name:'screenshot',maxCount:1},{name:'screenshot2',maxCount:1}]), (req, res) => {
  const { pair, result, rr, pnl, lot_size, entry_price, exit_price, stop_loss, take_profit,
          direction, session, setup, timeframe, emotions, notes, trade_date, entry_time, exit_time, account_id } = req.body;
  if (!pair || !result || !trade_date) return res.status(400).json({ error: 'Paire, résultat et date requis' });
  if (!['WIN','LOSS','BE'].includes(result)) return res.status(400).json({ error: 'Résultat invalide' });
  const screenshot  = req.files?.screenshot?.[0]  ? `/uploads/${req.files.screenshot[0].filename}` : null;
  const screenshot2 = req.files?.screenshot2?.[0] ? `/uploads/${req.files.screenshot2[0].filename}` : null;
  const row = db.prepare(`
    INSERT INTO trades (user_id, account_id, pair, direction, result, rr, pnl, lot_size,
      entry_price, exit_price, stop_loss, take_profit, session, setup, timeframe,
      emotions, screenshot, screenshot2, notes, trade_date, entry_time, exit_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.session.userId, account_id||null, pair, direction||'LONG', result,
    parseFloat(rr)||0, parseFloat(pnl)||0, parseFloat(lot_size)||0,
    entry_price||null, exit_price||null, stop_loss||null, take_profit||null,
    session||null, setup||null, timeframe||null, emotions||null,
    screenshot, screenshot2, notes||'', trade_date, entry_time||null, exit_time||null
  );
  recalcBalance(db, account_id, req.session.userId);
  res.json({ id: row.lastInsertRowid });
});

router.patch('/:id', requireAuth, upload.fields([{name:'screenshot',maxCount:1},{name:'screenshot2',maxCount:1}]), (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!trade) return res.status(404).json({ error: 'Trade introuvable' });
  const fields = ['pair','direction','result','rr','pnl','lot_size','entry_price','exit_price',
    'stop_loss','take_profit','session','setup','timeframe','emotions','notes','trade_date','entry_time','exit_time','account_id'];
  const updates = {};
  fields.forEach(f => updates[f] = req.body[f] !== undefined ? req.body[f] : trade[f]);
  if (!['WIN','LOSS','BE'].includes(updates.result)) return res.status(400).json({ error: 'Résultat invalide' });
  let screenshot = trade.screenshot;
  let screenshot2 = trade.screenshot2;
  if (req.files?.screenshot?.[0]) {
    if (trade.screenshot?.startsWith('/uploads/')) fs.unlink(path.join(__dirname,'../../', trade.screenshot), ()=>{});
    screenshot = `/uploads/${req.files.screenshot[0].filename}`;
  }
  if (req.files?.screenshot2?.[0]) {
    if (trade.screenshot2?.startsWith('/uploads/')) fs.unlink(path.join(__dirname,'../../', trade.screenshot2), ()=>{});
    screenshot2 = `/uploads/${req.files.screenshot2[0].filename}`;
  }
  db.prepare(`UPDATE trades SET pair=?,direction=?,result=?,rr=?,pnl=?,lot_size=?,
    entry_price=?,exit_price=?,stop_loss=?,take_profit=?,session=?,setup=?,timeframe=?,
    emotions=?,screenshot=?,screenshot2=?,notes=?,trade_date=?,entry_time=?,exit_time=?,account_id=?
    WHERE id=?`).run(
    updates.pair, updates.direction, updates.result,
    parseFloat(updates.rr)||0, parseFloat(updates.pnl)||0, parseFloat(updates.lot_size)||0,
    updates.entry_price||null, updates.exit_price||null, updates.stop_loss||null, updates.take_profit||null,
    updates.session||null, updates.setup||null, updates.timeframe||null, updates.emotions||null,
    screenshot, screenshot2, updates.notes||'', updates.trade_date,
    updates.entry_time||null, updates.exit_time||null, updates.account_id||null,
    req.params.id
  );
  recalcBalance(db, trade.account_id, req.session.userId);
  if (updates.account_id && updates.account_id !== trade.account_id) recalcBalance(db, updates.account_id, req.session.userId);
  res.json({ id: Number(req.params.id), ...updates, screenshot, screenshot2 });
});

router.delete('/:id', requireAuth, (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!trade) return res.status(404).json({ error: 'Trade introuvable' });
  if (trade.screenshot?.startsWith('/uploads/')) fs.unlink(path.join(__dirname,'../../', trade.screenshot), ()=>{});
  if (trade.screenshot2?.startsWith('/uploads/')) fs.unlink(path.join(__dirname,'../../', trade.screenshot2), ()=>{});
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  if (trade.account_id) {
    const tot = db.prepare('SELECT COALESCE(SUM(pnl),0) as total FROM trades WHERE account_id = ?').get(String(trade.account_id));
    const acc = db.prepare('SELECT initial_balance FROM accounts WHERE id = ?').get(trade.account_id);
    if (acc) db.prepare('UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?')
      .run(acc.initial_balance + tot.total, trade.account_id, req.session.userId);
  }
  res.json({ success: true });
});

module.exports = router;
