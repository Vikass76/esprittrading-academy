/* ═══════════════════════════════════
   ESPRIT TRADING — app.js v3.0
═══════════════════════════════════ */
const $ = id => document.getElementById(id);
const api = async (m, p, b, isForm) => {
  const o = { method: m, headers: {} };
  if (b) { if (isForm) o.body = b; else { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(b); } }
  const r = await fetch('/api' + p, o);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return d;
};
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast t-${type === 'success' ? 'ok' : type === 'error' ? 'err' : 'info'}`;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric'}); }
function ytId(url) { const m = url?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?\s]+)/); return m ? m[1] : null; }
function isLocal(url) { return url?.startsWith('/uploads/'); }

/* ── STATE ── */
let role = '', user = null, trades = [], accounts = [], selAcc = null, stats = null;
const vcache = new Map();
let cY = new Date().getFullYear(), cM = new Date().getMonth();
let detailId = null;

/* ── CHARTS ── */
let cEq=null,cPair=null,cSess=null,cDay=null,cRRD=null,cSetup=null,cMo=null;
const G='#16a34a', R='#dc2626', GOLD='rgb(244,199,15)';
const axOpts = { grid:{color:'rgba(0,0,0,0.04)'}, ticks:{color:'#9ca3af',font:{size:10}} };
function kill(c) { if(c) c.destroy(); return null; }
function mkChart(id, type, data, opts={}) {
  const canvas = $(id); if (!canvas) return null;
  const ex = Chart.getChart(canvas); if (ex) ex.destroy();
  return new Chart(canvas, { type, data, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, ...opts }});
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  try { const me = await api('GET','/auth/me'); showApp(me); }
  catch { showLogin(); }
});

function showLogin() { $('login-page').classList.remove('hidden'); $('app').classList.add('hidden'); }

function showApp(me) {
  role = me.role; user = me;
  $('login-page').classList.add('hidden'); $('app').classList.remove('hidden');
  $('nav-username').textContent = me.username;
  $('user-initials').textContent = me.username.slice(0,2).toUpperCase();
  if (me.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  if (me.role === 'student' || me.role === 'admin') { $('formation-student').classList.remove('hidden'); $('formation-community').classList.add('hidden'); }
  else { $('formation-student').classList.add('hidden'); $('formation-community').classList.remove('hidden'); }
  loadAccounts().then(() => { switchTab('dashboard'); loadDashboard(); });
}

/* ── LOGIN ── */
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn=$('login-btn'), err=$('login-error');
  err.classList.add('hidden'); btn.textContent='Connexion...'; btn.disabled=true;
  try { const d = await api('POST','/auth/login',{username:$('username').value,password:$('password').value}); showApp(d); }
  catch(ex) { err.textContent=ex.message; err.classList.remove('hidden'); }
  finally { btn.textContent='Se connecter'; btn.disabled=false; }
});

$('logout-btn').addEventListener('click', async () => {
  await api('POST','/auth/logout');
  role=''; user=null; trades=[]; accounts=[]; stats=null;
  $('login-form').reset(); showLogin();
});

/* ── TABS ── */
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => btn.addEventListener('click', () => {
  const t = btn.dataset.tab;
  switchTab(t); closeSb();
  if (t==='dashboard') loadDashboard();
  if (t==='journal') loadTrades();
  if (t==='calendar') renderCal();
  if (t==='analytics') loadAnalytics();
  if (t==='formation') loadFormation();
  if (t==='admin') loadAdmin();
  if (t==='eco-cal') loadEcoCalendar();
}));

function switchTab(t) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item[data-tab]').forEach(b => b.classList.remove('active'));
  $(`tab-${t}`)?.classList.remove('hidden');
  document.querySelectorAll(`.nav-item[data-tab="${t}"]`).forEach(b => b.classList.add('active'));
}

/* ── ACCOUNTS ── */
async function loadAccounts() {
  try { accounts = await api('GET','/trades/accounts'); renderAccBar(); updateAccSel(); } catch {}
}
function renderAccBar() {
  const list = document.getElementById('sb-acc-list');
  if (!list) return;
  if (!accounts.length) {
    list.innerHTML = '<div style="font-size:.72rem;color:var(--text-muted);padding:2px 4px">Aucun compte</div>';
  } else {
    list.innerHTML = accounts.map(a => {
      const pct = a.initial_balance ? ((a.current_balance - a.initial_balance)/a.initial_balance*100).toFixed(1) : 0;
      const on = selAcc === a.id;
      const bg = on ? 'var(--gold-light)' : 'transparent';
      const border = on ? 'var(--gold)' : 'transparent';
      const nameColor = on ? 'var(--gold-dark)' : 'var(--text)';
      const typeBg = a.type==='live' ? '#dcfce7' : a.type==='demo' ? '#dbeafe' : 'var(--gold-light)';
      const typeColor = a.type==='live' ? 'var(--green)' : a.type==='demo' ? 'var(--blue)' : 'var(--gold-dark)';
      const pctColor = parseFloat(pct)>=0 ? 'var(--green)' : 'var(--red)';
      const bal = Number(a.current_balance).toLocaleString('fr-FR',{maximumFractionDigits:0});
      return '<div class="sb-acc-item" data-id="'+a.id+'" style="display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;cursor:pointer;margin-bottom:2px;background:'+bg+';border:1px solid '+border+'">'
        +'<div><div style="font-size:.78rem;font-weight:600;color:'+nameColor+'">'+a.name+'</div>'
        +'<div style="font-size:.68rem;color:var(--text-muted)">$'+bal+' <span style="color:'+pctColor+'">'+(parseFloat(pct)>=0?'+':'')+pct+'%</span></div></div>'
        +'<div style="display:flex;align-items:center;gap:3px">'
        +'<span style="font-size:.58rem;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:3px;background:'+typeBg+';color:'+typeColor+'">'+a.type+'</span>'
        +'<button onclick="delAcc('+a.id+',event)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.7rem;padding:2px"><i class="ti ti-x"></i></button>'
        +'</div></div>';
    }).join('');
    list.querySelectorAll('.sb-acc-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const id = parseInt(el.dataset.id);
        selAcc = selAcc === id ? null : id;
        renderAccBar();
        loadDashboard();
        if (!document.getElementById('tab-journal').classList.contains('hidden')) loadTrades();
        if (!document.getElementById('tab-calendar').classList.contains('hidden')) renderCal();
        if (!document.getElementById('tab-analytics').classList.contains('hidden')) loadAnalytics();
      });
    });
  }
  const addBtn = document.getElementById('sb-add-acc');
  if (addBtn) addBtn.onclick = () => document.getElementById('acc-modal').classList.remove('hidden');
}
async function delAcc(id, e) {
  e.stopPropagation();
  if (!confirm('Supprimer ce compte ?')) return;
  await api('DELETE',`/trades/accounts/${id}`);
  selAcc = null;
  await loadAccounts();
  if (accounts.length) { selAcc = accounts[0].id; }
  renderAccBar(); loadDashboard(); loadTrades();
  toast('Compte supprimé','success');
}
function updateAccSel() {
  const s = $('trade-acc-sel');
  s.innerHTML = '<option value="">Aucun compte lié</option>' + accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
}
$('acm-close').addEventListener('click', () => $('acc-modal').classList.add('hidden'));
$('acm-cancel').addEventListener('click', () => $('acc-modal').classList.add('hidden'));
$('acc-form').addEventListener('submit', async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData($('acc-form')).entries());
  await api('POST','/trades/accounts',d);
  $('acc-modal').classList.add('hidden'); $('acc-form').reset();
  await loadAccounts(); loadDashboard(); toast('Compte créé !','success');
});

/* ── DASHBOARD ── */

/* ── DASHBOARD ── */
async function loadDashboard() {
  try {
    if (!selAcc && accounts.length) { selAcc = accounts[0].id; renderAccBar(); }
    if (!selAcc) {
      renderKPIs({total:0,wins:0,losses:0,be:0,winRate:0,totalRR:0,totalPnl:0,avgRR:0,avgWinRR:0,avgLossRR:0,bestRR:0,worstRR:0,maxStreak:0,currentStreak:{type:null,count:0}}, 'dash-kpis', 8);
      cEq=kill(cEq); cPair=kill(cPair); cSess=kill(cSess);
      renderEmptyChart('c-equity','line',['','','','','']);
      renderEmptyChart('c-pair','bar',['EURUSD','GBPUSD','GOLD','NASDAQ','BTCUSD']);
      renderEmptyChart('c-session','doughnut',[]);
      return;
    }
    const p = '?account_id=' + selAcc;
    stats = await api('GET', '/trades/stats' + p);
    renderKPIs(stats, 'dash-kpis', 8);
    const acc = accounts.find(a => a.id === selAcc);
    if (acc) {
      const allT = await api('GET', '/trades?account_id=' + selAcc);
      const sorted = [...allT].sort((a,b) => a.trade_date.localeCompare(b.trade_date));
      cEq = kill(cEq);
      if (sorted.length) {
        let bal = acc.initial_balance;
        const labels = sorted.map(t => fmtDate(t.trade_date));
        const data = sorted.map(t => { bal = parseFloat((bal + (parseFloat(t.pnl)||0)).toFixed(2)); return bal; });
        const fmt = v => '$' + Number(v).toLocaleString('fr-FR');
        cEq = mkChart('c-equity','line',{ labels, datasets:[{ data, borderColor: GOLD, backgroundColor: 'rgba(244,199,15,0.05)', pointBackgroundColor: data.map(v => v >= acc.initial_balance ? G : R), pointBorderColor: 'transparent', pointRadius: data.length <= 50 ? 3.5 : 1.5, borderWidth: 2.5, tension: 0.3, fill: true }]},{ plugins:{ legend:{display:false}, tooltip:{callbacks:{label: c => fmt(c.parsed.y)}}}, scales:{ x:{...axOpts,ticks:{...axOpts.ticks,maxTicksLimit:8,maxRotation:0}}, y:{...axOpts,ticks:{...axOpts.ticks,callback: fmt}}}});
      } else {
        renderEmptyChart('c-equity','line',['','','','','']);
      }
    } else {
      renderEquity(stats.equityCurve);
    }
    renderPairChart(stats.byPair);
    renderSessChart(stats.bySession);
  } catch(ex) { console.error(ex); }
}

function renderKPIs(s, elId, count=8) {
  const el = $(elId); if (!el) return;
  const streak = s.currentStreak;
  const all = [
    { label:'Total trades', val: s.total||'—', sub: s.total?`${s.wins}W · ${s.losses}L · ${s.be}BE`:'Aucun trade', cls:'', icon:'ti-chart-bar' },
    { label:'Win Rate', val: s.total?s.winRate+'%':'—', sub: s.total?`${s.wins} gagnant${s.wins>1?'s':''}`:'—', cls: s.total?(s.winRate>=50?'g':'r'):'', icon:'ti-percentage', accent: s.total?(s.winRate>=50?'accent-g':'accent-r'):'' },
    { label:'RR cumulé', val: s.total?(s.totalRR>=0?'+':'')+s.totalRR+'R':'—', sub: s.total?`Moy: ${s.avgRR>=0?'+':''}${s.avgRR}R`:'—', cls: s.total?(s.totalRR>=0?'o':'r'):'', icon:'ti-trending-up', accent: s.total?(s.totalRR>=0?'accent-o':'accent-r'):'' },
    { label:'P&L Net', val: s.total&&s.totalPnl?(s.totalPnl>=0?'+$':'-$')+Math.abs(s.totalPnl).toFixed(0):'—', sub:'Résultat net', cls: s.total&&s.totalPnl?(s.totalPnl>=0?'g':'r'):'', icon:'ti-currency-dollar', accent: s.total&&s.totalPnl?(s.totalPnl>=0?'accent-g':'accent-r'):'' },
    { label:'Avg RR / Trade', val: s.total?(s.avgRR>=0?'+':'')+s.avgRR+'R':'—', sub:'Moyenne par trade', cls:'o', icon:'ti-math-avg' },
    { label:'Best Trade', val: s.total?'+'+s.bestRR+'R':'—', sub:'Meilleur RR', cls:'o', icon:'ti-star' },
    { label:'Série en cours', val: streak?.count>0?streak.count:'—', sub: streak?.type||'—', cls: streak?.type==='WIN'?'g':streak?.type==='LOSS'?'r':'', icon:'ti-flame' },
    { label:'Max streak WIN', val: s.maxStreak||'—', sub:'Meilleure série', cls:'o', icon:'ti-trophy' },
  ];
  el.innerHTML = all.slice(0,count).map(k=>`
    <div class="kpi ${k.accent||''}">
      <div class="kpi-label"><i class="ti ${k.icon}"></i>${k.label}</div>
      <div class="kpi-val ${k.cls}">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');
}

function renderEquity(curve) {
  cEq = kill(cEq);
  if (!curve?.length) return;
  const labels = curve.map(p => fmtDate(p.date));
  const data = curve.map(p => p.rr);
  cEq = mkChart('c-equity','line',{
    labels,
    datasets:[{ data, borderColor:GOLD, backgroundColor:'rgba(244,199,15,0.05)',
      pointBackgroundColor:data.map(v=>v>=0?G:R), pointBorderColor:data.map(v=>v>=0?G:R),
      pointRadius:data.length<=50?3.5:1.5, borderWidth:2, tension:0.3, fill:true }]
  },{
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.y>=0?'+':''}${c.parsed.y}R`}}},
    scales:{ x:{...axOpts,ticks:{...axOpts.ticks,maxTicksLimit:8,maxRotation:0}}, y:{...axOpts,ticks:{...axOpts.ticks,callback:v=>`${v>=0?'+':''}${v}R`}} }
  });
}

function renderPairChart(byPair) {
  cPair = kill(cPair);
  if (!byPair?.length) return;
  const top = byPair.slice(0,8);
  cPair = mkChart('c-pair','bar',{
    labels:top.map(p=>p.pair),
    datasets:[
      {label:'WIN',data:top.map(p=>p.wins),backgroundColor:'rgba(22,163,74,0.75)',borderRadius:4,borderSkipped:false},
      {label:'LOSS',data:top.map(p=>p.losses),backgroundColor:'rgba(220,38,38,0.7)',borderRadius:4,borderSkipped:false}
    ]
  },{
    plugins:{legend:{display:true,labels:{font:{size:10},color:'#9ca3af',boxWidth:10,padding:12}}},
    scales:{ x:{...axOpts,stacked:true}, y:{...axOpts,stacked:true,ticks:{...axOpts.ticks,stepSize:1}} }
  });
}

function renderSessChart(bySess) {
  cSess = kill(cSess);
  if (!bySess?.length) return;
  cSess = mkChart('c-session','doughnut',{
    labels:bySess.map(s=>s.session),
    datasets:[{data:bySess.map(s=>s.total),backgroundColor:[GOLD,'#3b82f6','#8b5cf6','#10b981','#f97316'],borderWidth:0,hoverOffset:4}]
  },{
    cutout:'65%',
    plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10},color:'#9ca3af',boxWidth:10,padding:10}}}
  });
}

/* ── JOURNAL ── */
async function loadTrades() {
  try {
    if (!selAcc) { renderTrades([]); return; }
    const p = new URLSearchParams();
    const pair=$('f-pair').value, res=$('f-result').value, dir=$('f-dir').value;
    const sess=$('f-sess').value, from=$('f-from').value, to=$('f-to').value;
    if(pair) p.set('pair',pair); if(res) p.set('result',res); if(dir) p.set('direction',dir);
    if(sess) p.set('session',sess); if(from) p.set('from',from); if(to) p.set('to',to);
    if (selAcc) p.set('account_id', selAcc); trades = await api('GET','/trades?'+p);
    renderTrades(trades);
  } catch { toast('Erreur chargement trades','error'); }
}

function renderTrades(list) {
  const tbody = $('trades-body'), cnt = $('f-count');
  cnt.textContent = list.length ? `${list.length} trade${list.length>1?'s':''}` : '';
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="9"><div class="empty"><div class="empty-ico"><i class="ti ti-chart-line"></i></div><p>Aucun trade enregistré.</p></div></td></tr>`; return; }
  tbody.innerHTML = list.map(t => {
    const rr=parseFloat(t.rr)||0, pnl=parseFloat(t.pnl)||0;
    return `<tr data-id="${t.id}">
      <td style="white-space:nowrap;color:var(--text-muted);font-size:.78rem">${fmtDate(t.trade_date)}</td>
      <td><span class="pair-tag">${t.pair}</span></td>
      <td><span class="dir dir-${(t.direction||'LONG').toLowerCase()}">${t.direction||'LONG'}</span></td>
      <td>${rbadge(t.result)}</td>
      <td><span class="rr rr-${rr>0?'p':rr<0?'n':'z'}">${rr>=0?'+':''}${rr}R</span></td>
      <td class="${pnl>=0?'pnl-p':'pnl-n'}">${pnl?(pnl>=0?'+$':'-$')+Math.abs(pnl).toFixed(2):'—'}</td>
      <td style="font-size:.76rem;color:var(--text-muted)">${t.session||'—'}</td>
      <td style="font-size:.76rem">${t.setup||'—'}</td>
      <td>${t.screenshot?`<img class="ss-thumb" src="${t.screenshot}" title="LTF" onclick="openImg('${t.screenshot}',event)"/>`:'—'}</td><td>${t.screenshot2?`<img class="ss-thumb" src="${t.screenshot2}" title="HTF" onclick="openImg('${t.screenshot2}',event)"/>`:'—'}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', e => {
    if (e.target.tagName==='IMG') return;
    const t = trades.find(x=>String(x.id)===row.dataset.id);
    if(t) openDetail(t);
  }));
}

function rbadge(r) {
  if(r==='WIN') return `<span class="badge b-win">WIN</span>`;
  if(r==='LOSS') return `<span class="badge b-loss">LOSS</span>`;
  return `<span class="badge b-be">BE</span>`;
}

['f-pair','f-result','f-dir','f-sess','f-from','f-to'].forEach(id => $(id)?.addEventListener('change', loadTrades));
$('f-reset').addEventListener('click', () => {
  ['f-pair','f-result','f-dir','f-sess'].forEach(id => $(id).value='');
  ['f-from','f-to'].forEach(id => $(id).value='');
  loadTrades();
});

/* ── NOUVEAU TRADE ── */
function openAddTrade() {
  $('trade-form').reset();
  setTimeout(()=>{ initPairSearch(); const pi=document.getElementById('pair-search-input');if(pi)pi.value=''; const ph=document.getElementById('pair-search-hidden');if(ph)ph.value=''; },50);
  $('trade-form').querySelector('[name="trade_date"]').value = new Date().toISOString().split('T')[0];
  $('trade-modal').classList.remove('hidden');
}
['add-trade-btn','dash-add-btn','mob-add'].forEach(id => $(id)?.addEventListener('click', openAddTrade));
$('tm-close').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('tm-cancel').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('trade-modal').addEventListener('click', e => { if(e.target===$('trade-modal')) $('trade-modal').classList.add('hidden'); });
$('trade-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const form = new FormData($('trade-form'));
    const result = form.get('result');
    let rr = parseFloat(form.get('rr')) || 0;
    let pnl = parseFloat(form.get('pnl')) || 0;
    if (result === 'WIN')  { rr = Math.abs(rr); pnl = Math.abs(pnl); }
    if (result === 'LOSS') { rr = -Math.abs(rr); pnl = -Math.abs(pnl); }
    if (result === 'BE')   { rr = 0; pnl = 0; }
    form.set('rr', rr); form.set('pnl', pnl);
    await api('POST','/trades', form, true);
    $('trade-modal').classList.add('hidden');
    toast('Trade enregistré','success');
    trades=[]; loadTrades(); await loadAccounts(); await loadDashboard(); stats=null;
    if(!$('tab-calendar').classList.contains('hidden')) renderCal();
  } catch(ex) { toast(ex.message,'error'); }
});

/* ── DETAIL ── */
function openDetail(t) {
  detailId = t.id;
  $('d-pair').textContent = t.pair;
  $('d-badge').innerHTML = rbadge(t.result);
  $('d-date').textContent = fmtDate(t.trade_date);
  $('d-dir').innerHTML = `<span class="dir dir-${(t.direction||'LONG').toLowerCase()}">${t.direction||'LONG'}</span>`;
  const rr=parseFloat(t.rr)||0, pnl=parseFloat(t.pnl)||0;
  const rrEl=$('d-rr'); rrEl.textContent=`${rr>=0?'+':''}${rr}R`; rrEl.className=`dv big ${rr>0?'g':rr<0?'r':''}`;
  const pnlEl=$('d-pnl'); pnlEl.textContent=pnl?`${pnl>=0?'+$':'-$'}${Math.abs(pnl).toFixed(2)}`:'—'; pnlEl.className=`dv big ${pnl>0?'g':pnl<0?'r':''}`;
  $('d-lot').textContent=t.lot_size||'—'; $('d-sess').textContent=t.session||'—';
  $('d-setup').textContent=t.setup||'—'; $('d-tf').textContent=t.timeframe||'—';
  $('d-entry').textContent=t.entry_price||'—'; $('d-sl').textContent=t.stop_loss||'—';
  $('d-tp').textContent=t.take_profit||'—'; $('d-emo').textContent=t.emotions||'—';
  const nw=$('d-notes-wrap');
  if(t.notes){$('d-notes').textContent=t.notes;nw.style.display='';}else nw.style.display='none';
  const ss=$('d-ss'); ss.innerHTML='';
  [t.screenshot,t.screenshot2].filter(Boolean).forEach(src=>{
    const img=document.createElement('img');img.src=src;
    img.addEventListener('click',()=>openImg(src));ss.appendChild(img);
  });
  $('detail-modal').classList.remove('hidden');
}
function closeDetail(){$('detail-modal').classList.add('hidden');detailId=null;}
$('dm-close').addEventListener('click',closeDetail);
$('dm-close2').addEventListener('click',closeDetail);
$('detail-modal').addEventListener('click',e=>{if(e.target===$('detail-modal'))closeDetail();});
$('d-del').addEventListener('click',async()=>{
  if(!detailId||!confirm('Supprimer ce trade ?')) return;
  await api('DELETE',`/trades/${detailId}`);
  toast('Trade supprimé','success'); closeDetail(); loadTrades(); loadDashboard();
});
$('d-edit').addEventListener('click',()=>{
  const t=trades.find(x=>x.id===detailId); if(!t) return;
  closeDetail(); openEditTrade(t);
});

/* ── EDIT TRADE ── */
function openEditTrade(t) {
  $('e-id').value=t.id; $('e-pair').value=t.pair; $('e-dir').value=t.direction||'LONG';
  $('e-res').value=t.result; $('e-rr').value=t.rr; $('e-pnl').value=t.pnl||'';
  $('e-date').value=t.trade_date; $('e-sess').value=t.session||'';
  $('e-setup').value=t.setup||''; $('e-emo').value=t.emotions||''; $('e-notes').value=t.notes||'';
  $('edit-modal').classList.remove('hidden');
}
$('em-close').addEventListener('click',()=>$('edit-modal').classList.add('hidden'));
$('em-cancel').addEventListener('click',()=>$('edit-modal').classList.add('hidden'));
$('edit-modal').addEventListener('click',e=>{if(e.target===$('edit-modal'))$('edit-modal').classList.add('hidden');});
$('edit-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('e-id').value, form=new FormData($('edit-form'));
  try {
    const result = form.get('result');
    let rr = parseFloat(form.get('rr')) || 0;
    let pnl = parseFloat(form.get('pnl')) || 0;
    if (result === 'WIN')  { rr = Math.abs(rr); pnl = Math.abs(pnl); }
    if (result === 'LOSS') { rr = -Math.abs(rr); pnl = -Math.abs(pnl); }
    if (result === 'BE')   { rr = 0; pnl = 0; }
    form.set('rr', rr); form.set('pnl', pnl);
    await api('PATCH',`/trades/${id}`,form,true);
    toast('Trade mis à jour','success'); $('edit-modal').classList.add('hidden');
    loadTrades(); loadDashboard();
  } catch(ex){toast(ex.message,'error');}
});

/* ── CALENDRIER ── */
const MFR=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DFR=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

async function renderCal() {
  if (!selAcc) {
    $('cal-label').textContent = MFR[cM] + ' ' + cY;
    $('cal-heads').innerHTML = DFR.map(d => '<div class="cal-dh">'+d+'</div>').join('');
    const f2=new Date(cY,cM,1), d2=new Date(cY,cM+1,0).getDate(), s2=(f2.getDay()+6)%7;
    let h2=''; for(let i=0;i<s2;i++) h2+='<div class="cal-cell empty"></div>';
    for(let d=1;d<=d2;d++) h2+='<div class="cal-cell"><div class="cal-dn">'+d+'</div></div>';
    $('cal-grid').innerHTML=h2; return;
  }
  const first=new Date(cY,cM,1), last=new Date(cY,cM+1,0);
  const p=new URLSearchParams();
  p.set('from',first.toISOString().split('T')[0]); p.set('to',last.toISOString().split('T')[0]);
  if (selAcc) p.set('account_id', selAcc); const list = await api('GET','/trades?'+p);
  $('cal-label').textContent=`${MFR[cM]} ${cY}`;
  $('cal-heads').innerHTML=DFR.map(d=>`<div class="cal-dh">${d}</div>`).join('');
  const byDay={};
  list.forEach(t=>{if(!byDay[t.trade_date])byDay[t.trade_date]=[];byDay[t.trade_date].push(t);});
  const startDow=(first.getDay()+6)%7, days=last.getDate();
  const today=new Date().toISOString().split('T')[0];
  let html='';
  for(let i=0;i<startDow;i++) html+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=days;d++){
    const ds=`${cY}-${String(cM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dt=byDay[ds]||[];
    const rr=dt.reduce((s,t)=>s+(parseFloat(t.rr)||0),0);
    const wins=dt.filter(t=>t.result==='WIN').length, losses=dt.filter(t=>t.result==='LOSS').length;
    let cls='cal-cell';
    if(ds===today) cls+=' today';
    else if(dt.length) cls+=rr>=0?' win-day':' loss-day';
    html+=`<div class="${cls}">
      <div class="cal-dn">${d}</div>
      ${dt.length?`<div class="cal-rr ${rr>=0?'p':'n'}">${rr>=0?'+':''}${rr.toFixed(1)}R</div><div class="cal-cnt">${dt.length}t · ${wins}W${losses?' '+losses+'L':''}</div>`:''}
    </div>`;
  }
  $('cal-grid').innerHTML=html;
}
$('cal-prev').addEventListener('click',()=>{cM--;if(cM<0){cM=11;cY--;}renderCal();});
$('cal-next').addEventListener('click',()=>{cM++;if(cM>11){cM=0;cY++;}renderCal();});

/* ── ANALYTICS ── */
async function loadAnalytics() {
  try {
    if (!selAcc) {
      $('an-kpis').innerHTML=''; trades=[];
      cDay=kill(cDay); cRRD=kill(cRRD); cSetup=kill(cSetup); cMo=kill(cMo);
      renderEmptyChart('c-day','bar',['Lundi','Mardi','Mercredi','Jeudi','Vendredi']);
      renderEmptyChart('c-rrdist','bar',['-2R','-1R','0R','+1R','+2R','+3R']);
      renderEmptyChart('c-setup','bar',['OTE','FVG','BOS','MSS']);
      renderEmptyChart('c-monthly','bar',['Jan','Fév','Mar','Avr','Mai','Juin']);
      renderPairTable([]); return;
    }
    const p = '?account_id=' + selAcc;
    const s = await api('GET','/trades/stats'+p);
    renderKPIs(s,'an-kpis',4);
    renderDayChart(s.byDay);
    trades = await api('GET', '/trades' + p);
    renderRRDist(); renderSetupChart(); renderMonthly();
    renderPairTable(s.byPair);
  } catch(ex){console.error(ex);}
}

function renderDayChart(byDay) {
  cDay=kill(cDay);
  const keys=['Mon','Tue','Wed','Thu','Fri'], lbs={Mon:'Lundi',Tue:'Mardi',Wed:'Mercredi',Thu:'Jeudi',Fri:'Vendredi'};
  cDay=mkChart('c-day','bar',{
    labels:keys.map(k=>lbs[k]),
    datasets:[
      {label:'WIN',data:keys.map(k=>byDay[k]?.wins||0),backgroundColor:'rgba(22,163,74,0.75)',borderRadius:5,borderSkipped:false},
      {label:'LOSS',data:keys.map(k=>(byDay[k]?.total||0)-(byDay[k]?.wins||0)),backgroundColor:'rgba(220,38,38,0.7)',borderRadius:5,borderSkipped:false}
    ]
  },{
    plugins:{legend:{display:true,labels:{font:{size:10},color:'#9ca3af',boxWidth:10,padding:10}}},
    scales:{x:{...axOpts,stacked:true},y:{...axOpts,stacked:true,ticks:{...axOpts.ticks,stepSize:1}}}
  });
}

function renderRRDist() {
  cRRD=kill(cRRD);
  const buckets={};
  trades.forEach(t=>{ const b=Math.floor(parseFloat(t.rr)||0); const k=b>=0?`+${b}R`:`${b}R`; buckets[k]=(buckets[k]||0)+1; });
  const sorted=Object.entries(buckets).sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]));
  cRRD=mkChart('c-rrdist','bar',{
    labels:sorted.map(e=>e[0]),
    datasets:[{data:sorted.map(e=>e[1]),backgroundColor:sorted.map(e=>parseFloat(e[0])>=0?'rgba(22,163,74,0.75)':'rgba(220,38,38,0.7)'),borderRadius:5,borderSkipped:false}]
  },{scales:{x:axOpts,y:{...axOpts,ticks:{...axOpts.ticks,stepSize:1}}}});
}

function renderSetupChart() {
  cSetup=kill(cSetup);
  const byS={};
  trades.forEach(t=>{ const s=t.setup||'Autre'; if(!byS[s])byS[s]={w:0,t:0}; byS[s].t++; if(t.result==='WIN')byS[s].w++; });
  const ent=Object.entries(byS).filter(e=>e[1].t>=1).sort((a,b)=>b[1].t-a[1].t).slice(0,8);
  cSetup=mkChart('c-setup','bar',{
    labels:ent.map(e=>e[0]),
    datasets:[{label:'Win Rate %',data:ent.map(e=>Math.round(e[1].w/e[1].t*100)),backgroundColor:'rgba(244,199,15,0.8)',borderRadius:5,borderSkipped:false}]
  },{scales:{x:axOpts,y:{...axOpts,max:100,ticks:{...axOpts.ticks,callback:v=>v+'%'}}}});
}

function renderMonthly() {
  cMo=kill(cMo);
  const bM={};
  trades.forEach(t=>{ const m=t.trade_date?.substring(0,7); if(!m) return; bM[m]=(bM[m]||0)+(parseFloat(t.pnl)||0); });
  const months=Object.keys(bM).sort().slice(-12);
  cMo=mkChart('c-monthly','bar',{
    labels:months.map(m=>{const[y,mo]=m.split('-');return `${MFR[parseInt(mo)-1].slice(0,3)} ${y.slice(2)}`;}),
    datasets:[{data:months.map(m=>parseFloat(bM[m].toFixed(2))),backgroundColor:months.map(m=>bM[m]>=0?'rgba(22,163,74,0.75)':'rgba(220,38,38,0.7)'),borderRadius:5,borderSkipped:false}]
  },{scales:{x:axOpts,y:{...axOpts,ticks:{...axOpts.ticks,callback:v=>`$${v}`}}}});
}

function renderPairTable(byPair) {
  const tbl=$('pair-tbl');
  if(!byPair?.length){tbl.innerHTML='<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>';return;}
  tbl.innerHTML=`<thead><tr><th>Paire</th><th>Trades</th><th>Win Rate</th><th>RR Total</th><th>P&L</th></tr></thead>
  <tbody>${byPair.map(p=>{
    const wr=p.total?Math.round(p.wins/p.total*100):0;
    return `<tr>
      <td><span class="pair-tag">${p.pair}</span></td>
      <td>${p.total}</td>
      <td><div class="wr-row"><div class="wr-track"><div class="wr-fill" style="width:${wr}%"></div></div><span style="font-size:.75rem;font-weight:600;min-width:32px">${wr}%</span></div></td>
      <td class="${p.rr>=0?'pnl-p':'pnl-n'}">${p.rr>=0?'+':''}${p.rr.toFixed(2)}R</td>
      <td class="${p.pnl>=0?'pnl-p':'pnl-n'}">${p.pnl>=0?'+$':'-$'}${Math.abs(p.pnl).toFixed(2)}</td>
    </tr>`;
  }).join('')}</tbody>`;
}

/* ── FORMATION ── */
async function loadFormation() {
  if(role!=='student'&&role!=='admin') return;
  try {
    const mods=await api('GET','/videos');
    const el=$('formation-student');
    if(!mods.length){el.innerHTML=`<div class="empty"><div class="empty-ico"><i class="ti ti-books"></i></div><p>Aucun module disponible.</p></div>`;return;}
    el.innerHTML=mods.map((m,i)=>`
      <div class="mod${i===0?' open':''}" data-id="${m.id}">
        <div class="mod-head">
          <div class="mod-title"><i class="ti ti-folder" style="color:var(--gold-dark)"></i>${m.title}<span class="mod-cnt">${m.videos.length}</span></div>
          <span class="mod-chev"><i class="ti ti-chevron-down"></i></span>
        </div>
        <div class="vid-list">
          ${m.videos.map(v=>{
            const yt=ytId(v.url), th=v.cover||(yt?`https://img.youtube.com/vi/${yt}/mqdefault.jpg`:null);
            const thumbHtml=th?`<div class="vid-thumb"><img src="${th}" alt=""/></div>`:`<div class="vid-thumb"><i class="ti ti-player-play"></i></div>`;
            if(isLocal(v.url)) return `<div class="vid-item lv" data-src="${v.url}" data-title="${v.title}">${thumbHtml}<div class="vid-info"><div class="vt">${v.title}</div>${v.description?`<div class="vd">${v.description}</div>`:''}</div><i class="ti ti-player-play" style="color:var(--text-muted);flex-shrink:0"></i></div>`;
            return `<a class="vid-item" href="${v.url}" target="_blank" rel="noopener">${thumbHtml}<div class="vid-info"><div class="vt">${v.title}</div>${v.description?`<div class="vd">${v.description}</div>`:''}</div><i class="ti ti-external-link" style="color:var(--text-muted);flex-shrink:0"></i></a>`;
          }).join('')}
        </div>
      </div>`).join('');
    el.querySelectorAll('.mod-head').forEach(h=>h.addEventListener('click',()=>h.closest('.mod').classList.toggle('open')));
    el.querySelectorAll('.lv').forEach(el=>el.addEventListener('click',()=>openVid(el.dataset.src,el.dataset.title)));
  } catch{toast('Erreur formation','error');}
}

function openVid(src,title) { $('vid-player').src=src; $('vid-modal-title').textContent=title; $('vid-modal').classList.remove('hidden'); $('vid-player').play().catch(()=>{}); }
$('vid-close').addEventListener('click',()=>{ $('vid-player').pause(); $('vid-player').src=''; $('vid-modal').classList.add('hidden'); });
$('vid-modal').addEventListener('click',e=>{ if(e.target===$('vid-modal')){ $('vid-player').pause(); $('vid-player').src=''; $('vid-modal').classList.add('hidden'); } });

/* ── OUTILS ── */
const PV={EURUSD:10,GBPUSD:10,USDJPY:9,GOLD:1,NASDAQ:1,US30:1,BTCUSD:1,GBPJPY:9};
const LU={EURUSD:100000,GBPUSD:100000,USDJPY:100000,GOLD:100,NASDAQ:1,US30:1,BTCUSD:1,GBPJPY:100000};
function calcLot(){
  const inst=$('l-inst').value,bal=parseFloat($('l-bal').value),risk=parseFloat($('l-risk').value),sl=parseFloat($('l-sl').value);
  if(!bal||!risk||!sl){$('l-res').classList.add('hidden');return;}
  const pv=PV[inst]||10,risked=bal*risk/100,lot=risked/(sl*pv);
  $('l-out-sz').textContent=lot.toFixed(2); $('l-out-un').textContent=Math.round(lot*(LU[inst]||100000)).toLocaleString('fr-FR'); $('l-out-ri').textContent='$'+risked.toFixed(2);
  $('l-res').classList.remove('hidden');
}
$('l-inst').addEventListener('change',calcLot); ['l-bal','l-risk','l-sl'].forEach(id=>$(id)?.addEventListener('input',calcLot));
function calcRR(){
  const en=parseFloat($('r-entry').value),sl=parseFloat($('r-sl').value),tp=parseFloat($('r-tp').value);
  if(!en||!sl||!tp){$('r-res').classList.add('hidden');return;}
  const risk=Math.abs(en-sl),rew=Math.abs(tp-en);
  $('r-risk').textContent=risk.toFixed(5); $('r-rew').textContent=rew.toFixed(5); $('r-rat').textContent=(rew/risk).toFixed(2)+'R';
  $('r-res').classList.remove('hidden');
}
['r-entry','r-sl','r-tp'].forEach(id=>$(id)?.addEventListener('input',calcRR));
function calcPip(){
  const inst=$('p-inst').value,lots=parseFloat($('p-lots').value),pips=parseFloat($('p-pips').value);
  if(!lots||!pips){$('p-res').classList.add('hidden');return;}
  const pv=PV[inst]||10,perPip=lots*pv;
  $('p-val').textContent='$'+perPip.toFixed(2); $('p-pnl').textContent='$'+(perPip*pips).toFixed(2);
  $('p-res').classList.remove('hidden');
}
$('p-inst').addEventListener('change',calcPip); ['p-lots','p-pips'].forEach(id=>$(id)?.addEventListener('input',calcPip));
function calcObj(){
  const cap=parseFloat($('o-cap').value),tgt=parseFloat($('o-tgt').value),pct=parseFloat($('o-pct').value),tr=parseFloat($('o-tr').value);
  if(!cap||!tgt||!pct||pct<=0){$('o-res').classList.add('hidden');return;}
  let bal=cap,months=0; while(bal<tgt&&months<1200){bal*=(1+pct/100);months++;}
  $('o-mo').textContent=months+' mois'; $('o-gain').textContent='+$'+(bal-cap).toFixed(0); $('o-tot').textContent=tr?(months*tr).toLocaleString('fr-FR'):'—';
  $('o-res').classList.remove('hidden');
}
['o-cap','o-tgt','o-pct','o-tr'].forEach(id=>$(id)?.addEventListener('input',calcObj));

/* ── MDP ── */
$('change-pwd-btn').addEventListener('click',()=>{$('pwd-form').reset();$('pwd-modal').classList.remove('hidden');});
$('pm-close').addEventListener('click',()=>$('pwd-modal').classList.add('hidden'));
$('pm-cancel').addEventListener('click',()=>$('pwd-modal').classList.add('hidden'));
$('pwd-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if($('pwd-new').value!==$('pwd-cf').value){toast('Mots de passe différents','error');return;}
  try{await api('POST','/auth/change-password',{currentPassword:$('pwd-cur').value,newPassword:$('pwd-new').value});$('pwd-modal').classList.add('hidden');toast('Mot de passe mis à jour','success');}
  catch(ex){toast(ex.message,'error');}
});

/* ── IMAGE VIEWER ── */
function openImg(src, e) { if(e) e.stopPropagation(); $('img-src').src=src; $('img-modal').classList.remove('hidden'); }
$('img-modal').addEventListener('click',()=>$('img-modal').classList.add('hidden'));

/* ── MOBILE ── */
function closeSb(){$('sidebar').classList.remove('on');$('sb-ov').classList.remove('on');$('hbg').classList.remove('on');}
$('hbg').addEventListener('click',()=>{const on=$('sidebar').classList.toggle('on');$('sb-ov').classList.toggle('on',on);$('hbg').classList.toggle('on',on);});
$('sb-ov').addEventListener('click',closeSb);

/* ── ADMIN ── */
document.querySelectorAll('.atab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.atab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('#atab-modules,#atab-users').forEach(s=>s.classList.add('hidden'));
  btn.classList.add('on'); $(`atab-${btn.dataset.atab}`).classList.remove('hidden');
  if(btn.dataset.atab==='users') loadAdminUsers();
}));
async function loadAdmin(){await loadAdminMods();}

async function loadAdminUsers(){
  try{
    const users=await api('GET','/admin/users'), el=$('users-list');
    if(!users.length){el.innerHTML=`<p class="text-muted" style="font-size:.82rem">Aucun élève.</p>`;return;}
    el.innerHTML=users.map(u=>`<div class="user-row">
      <div><div class="u-name">${u.username}</div><div class="u-date">Créé le ${fmtDate(u.created_at?.split('T')[0])}</div></div>
      <div style="display:flex;gap:5px">
        <button class="btn btn-secondary btn-sm rst" data-id="${u.id}" data-n="${u.username}">Réinit.</button>
        <button class="btn btn-danger btn-sm del" data-id="${u.id}">Suppr.</button>
      </div></div>`).join('');
    el.querySelectorAll('.del').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Supprimer ?'))return;await api('DELETE',`/admin/users/${b.dataset.id}`);toast('Élève supprimé','success');loadAdminUsers();}));
    el.querySelectorAll('.rst').forEach(b=>b.addEventListener('click',async()=>{const p=prompt(`Nouveau MDP pour ${b.dataset.n} :`);if(!p)return;await api('PATCH',`/admin/users/${b.dataset.id}/password`,{password:p});toast('MDP réinitialisé','success');}));
  }catch{toast('Erreur élèves','error');}
}
$('user-form').addEventListener('submit',async e=>{e.preventDefault();await api('POST','/admin/users',{username:$('new-uname').value,password:$('new-upwd').value});$('user-form').reset();toast('Élève créé !','success');loadAdminUsers();});

function getThumb(v){const yt=ytId(v.url),th=v.cover||(yt?`https://img.youtube.com/vi/${yt}/mqdefault.jpg`:null);return th?`<img class="adm-thumb" src="${th}"/>`:`<div class="adm-thumb-ph"><i class="ti ti-video"></i></div>`;}

async function loadAdminMods(){
  try{
    const mods=await api('GET','/admin/modules'), el=$('adm-mods'), sel=$('vid-mod');
    if(!mods.length){el.innerHTML=`<div class="card"><div class="empty"><div class="empty-ico"><i class="ti ti-folder-open"></i></div><p>Aucun module.</p></div></div>`;sel.innerHTML='<option value="">Créez un module</option>';return;}
    const va=await api('GET','/videos'); vcache.clear();
    el.innerHTML=mods.map(m=>{
      const vids=(va.find(x=>x.id===m.id)||{videos:[]}).videos;
      vids.forEach(v=>vcache.set(String(v.id),v));
      return `<div class="adm-mod">
        <div class="adm-mod-h"><span class="adm-mod-n"><i class="ti ti-folder" style="color:var(--gold-dark)"></i>${m.title}<span class="mod-cnt">${vids.length}</span></span>
        <button class="btn btn-danger btn-sm dm" data-id="${m.id}">Supprimer</button></div>
        ${vids.map(v=>`<div class="adm-vid-row">${getThumb(v)}<span class="adm-vid-title">${v.title}</span><div class="adm-vid-acts"><button class="btn btn-secondary btn-sm ev" data-id="${v.id}">Modifier</button><button class="btn btn-danger btn-sm dv" data-id="${v.id}" data-t="${v.title}">Suppr.</button></div></div>`).join('')}
        ${!vids.length?`<div style="padding:10px 16px;font-size:.78rem;color:var(--text-muted)">Aucune vidéo.</div>`:''}
      </div>`;
    }).join('');
    el.querySelectorAll('.dm').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Supprimer ce module ?'))return;await api('DELETE',`/admin/modules/${b.dataset.id}`);toast('Module supprimé','success');loadAdminMods();}));
    el.querySelectorAll('.dv').forEach(b=>b.addEventListener('click',async()=>{if(!confirm(`Supprimer "${b.dataset.t}" ?`))return;await api('DELETE',`/admin/videos/${b.dataset.id}`);toast('Vidéo supprimée','success');loadAdminMods();}));
    el.querySelectorAll('.ev').forEach(b=>b.addEventListener('click',()=>openEditVid(vcache.get(b.dataset.id))));
    sel.innerHTML=mods.map(m=>`<option value="${m.id}">${m.title}</option>`).join('');
  }catch{toast('Erreur modules','error');}
}
$('mod-form').addEventListener('submit',async e=>{e.preventDefault();await api('POST','/admin/modules',{title:$('mod-title').value});$('mod-form').reset();toast('Module créé !','success');loadAdminMods();});
document.querySelectorAll('input[name="vsrc"]').forEach(r=>r.addEventListener('change',()=>{$('vurl-wrap').classList.toggle('hidden',$('vsrc-file').checked);$('vfile-wrap').classList.toggle('hidden',!$('vsrc-file').checked);}));
function xhrUp(url,form,bar,lbl){
  return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST',url);x.upload.addEventListener('progress',ev=>{if(ev.lengthComputable){const p=Math.round(ev.loaded/ev.total*100);bar.style.width=p+'%';lbl.textContent=p+'%';}});x.addEventListener('load',()=>x.status>=200&&x.status<300?res(JSON.parse(x.responseText)):rej(new Error('Erreur')));x.addEventListener('error',()=>rej(new Error('Réseau')));x.send(form);});
}
$('vid-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const isFile=$('vsrc-file').checked, modId=$('vid-mod').value, title=$('vid-title').value;
  if(!modId||!title){toast('Module et titre requis','error');return;}
  const form=new FormData(); form.append('module_id',modId); form.append('title',title); form.append('description',$('vid-desc').value);
  const cover=$('vid-cover').files[0]; if(cover) form.append('cover',cover);
  const btn=$('vid-btn');
  if(isFile){
    const file=$('vid-file').files[0]; if(!file){toast('Sélectionnez un fichier','error');return;}
    form.append('file',file); btn.disabled=true; btn.textContent='Upload...'; $('uprog-wrap').classList.remove('hidden');
    try{await xhrUp('/api/admin/videos',form,$('uprog'),$('uprog-lbl'));toast('Vidéo ajoutée !','success');$('vid-form').reset();$('vurl-wrap').classList.remove('hidden');$('vfile-wrap').classList.add('hidden');$('vsrc-url').checked=true;loadAdminMods();}
    catch(ex){toast(ex.message,'error');}
    finally{btn.disabled=false;btn.textContent='Ajouter';$('uprog-wrap').classList.add('hidden');$('uprog').style.width='0%';}
  }else{
    const url=$('vid-url').value; if(!url){toast('URL requise','error');return;}
    form.append('url',url);
    try{await xhrUp('/api/admin/videos',form,{style:{}},'');toast('Vidéo ajoutée !','success');$('vid-form').reset();loadAdminMods();}
    catch(ex){toast(ex.message,'error');}
  }
});
function openEditVid(v){
  if(!v)return; $('ev-id').value=v.id; $('ev-title').value=v.title; $('ev-desc').value=v.description||'';
  $('ev-cover').value=''; $('ev-file').value=''; $('ev-url').value='';
  $('evsrc-keep').checked=true; $('ev-url-wrap').classList.add('hidden'); $('ev-file-wrap').classList.add('hidden');
  if(v.cover){$('ev-cover-img').src=v.cover;$('ev-cover-prev').style.display='block';}else $('ev-cover-prev').style.display='none';
  $('evid-modal').classList.remove('hidden');
}
$('evm-close').addEventListener('click',()=>$('evid-modal').classList.add('hidden'));
$('evm-cancel').addEventListener('click',()=>$('evid-modal').classList.add('hidden'));
$('evid-modal').addEventListener('click',e=>{if(e.target===$('evid-modal'))$('evid-modal').classList.add('hidden');});
document.querySelectorAll('input[name="evsrc"]').forEach(r=>r.addEventListener('change',()=>{$('ev-url-wrap').classList.toggle('hidden',!$('evsrc-url').checked);$('ev-file-wrap').classList.toggle('hidden',!$('evsrc-file').checked);}));
$('evid-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('ev-id').value, btn=$('ev-btn'), form=new FormData();
  form.append('title',$('ev-title').value); form.append('description',$('ev-desc').value);
  const cover=$('ev-cover').files[0]; if(cover) form.append('cover',cover);
  const src=document.querySelector('input[name="evsrc"]:checked').value;
  if(src==='url'){const url=$('ev-url').value;if(!url){toast('URL requise','error');return;}form.append('url',url);}
  else if(src==='file'){const file=$('ev-file').files[0];if(!file){toast('Fichier requis','error');return;}form.append('file',file);}
  btn.disabled=true; btn.textContent='Sauvegarde...'; if(src==='file') $('eprog-wrap').classList.remove('hidden');
  try{
    await new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('PATCH',`/api/admin/videos/${id}`);if(src==='file')x.upload.addEventListener('progress',ev=>{if(ev.lengthComputable){const p=Math.round(ev.loaded/ev.total*100);$('eprog').style.width=p+'%';$('eprog-lbl').textContent=p+'%';}});x.addEventListener('load',()=>x.status>=200&&x.status<300?res():rej(new Error('Erreur')));x.addEventListener('error',()=>rej(new Error('Réseau')));x.send(form);});
    toast('Vidéo modifiée !','success'); $('evid-modal').classList.add('hidden'); loadAdminMods();
  }catch(ex){toast(ex.message,'error');}
  finally{btn.disabled=false;btn.textContent='Enregistrer';$('eprog-wrap').classList.add('hidden');$('eprog').style.width='0%';}
});


// ═══ RENDER ACC BAR (SIDEBAR) ═══
function renderAccBar() {
  const list = document.getElementById('sb-acc-list');
  if (!list) return;
  if (!accounts.length) {
    list.innerHTML = '<div style="font-size:.72rem;color:var(--text-muted);padding:2px 4px">Aucun compte</div>';
  } else {
    list.innerHTML = accounts.map(a => {
      const pct = a.initial_balance ? ((a.current_balance - a.initial_balance)/a.initial_balance*100).toFixed(1) : 0;
      const on = selAcc === a.id;
      const bg = on ? 'var(--gold-light)' : 'transparent';
      const border = on ? 'var(--gold)' : 'transparent';
      const nc = on ? 'var(--gold-dark)' : 'var(--text)';
      const tbg = a.type==='live'?'#dcfce7':a.type==='demo'?'#dbeafe':'var(--gold-light)';
      const tc = a.type==='live'?'var(--green)':a.type==='demo'?'var(--blue)':'var(--gold-dark)';
      const pc = parseFloat(pct)>=0?'var(--green)':'var(--red)';
      const bal = Number(a.current_balance).toLocaleString('fr-FR',{maximumFractionDigits:0});
      return '<div class="sb-acc-item" data-id="'+a.id+'" style="display:flex;align-items:center;justify-content:space-between;padding:7px 8px;border-radius:8px;cursor:pointer;margin-bottom:2px;background:'+bg+';border:1px solid '+border+'">'
        +'<div><div style="font-size:.78rem;font-weight:600;color:'+nc+'">'+a.name+'</div>'
        +'<div style="font-size:.68rem;color:var(--text-muted)">$'+bal+' <span style="color:'+pc+'">'+(parseFloat(pct)>=0?'+':'')+pct+'%</span></div></div>'
        +'<div style="display:flex;align-items:center;gap:3px">'
        +'<span style="font-size:.58rem;font-weight:700;text-transform:uppercase;padding:1px 5px;border-radius:3px;background:'+tbg+';color:'+tc+'">'+a.type+'</span>'
        +'<button onclick="delAcc('+a.id+',event)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.7rem;padding:2px"><i class="ti ti-x"></i></button>'
        +'</div></div>';
    }).join('');
    list.querySelectorAll('.sb-acc-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const id = parseInt(el.dataset.id);
        selAcc = selAcc === id ? null : id;
        renderAccBar(); loadDashboard();
        if (!document.getElementById('tab-journal').classList.contains('hidden')) loadTrades();
        if (!document.getElementById('tab-calendar').classList.contains('hidden')) renderCal();
        if (!document.getElementById('tab-analytics').classList.contains('hidden')) loadAnalytics();
      });
    });
  }
  const addBtn = document.getElementById('sb-add-acc');
  if (addBtn) addBtn.onclick = () => document.getElementById('acc-modal').classList.remove('hidden');
}

// ═══ EMPTY CHART ═══
function renderEmptyChart(id, type, xLabels) {
  const canvas = document.getElementById(id); if (!canvas) return;
  const ex = Chart.getChart(canvas); if (ex) ex.destroy();
  new Chart(canvas, { type: type||'bar', data: { labels: xLabels||[], datasets:[{data:[],borderColor:'rgba(0,0,0,0.05)',backgroundColor:'rgba(0,0,0,0.02)'}]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{color:'#9ca3af',font:{size:10}}}, y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{color:'#9ca3af',font:{size:10}},beginAtZero:true}}}});
}

// ═══ PAIR SEARCH ═══
const ALL_PAIRS = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','EURGBP','EURJPY','EURCHF','EURAUD','EURNZD','EURCAD','GBPJPY','GBPCHF','GBPAUD','GBPNZD','GBPCAD','AUDJPY','AUDCHF','AUDNZD','AUDCAD','NZDJPY','NZDCHF','NZDCAD','CADJPY','CADCHF','CHFJPY','XAUUSD','GOLD','XAGUSD','SILVER','NAS100','NASDAQ','US30','DOW','US500','SP500','UK100','GER40','DAX','FRA40','JPN225','AUS200','USOIL','UKOIL','NGAS','WTI','BRENT','BTCUSD','ETHUSD','XRPUSD','BNBUSD','SOLUSD','ADAUSD','DOTUSD','DOGEUSD','AVAXUSD','LTCUSD','LINKUSD','UNIUSD','ATOMUSD','XLMUSD','TRXUSD','ETCUSD','MATICUSD','ES','NQ','YM','RTY','CL','GC','SI','ZB','ZN'];

function initPairSearch() {
  const input = document.getElementById('pair-search-input');
  const hidden = document.getElementById('pair-search-hidden');
  if (!input || !hidden) return;
  const wrap = input.parentElement; wrap.style.position='relative';
  let drop = document.getElementById('pair-dropdown');
  if (!drop) { drop=document.createElement('div'); drop.id='pair-dropdown'; drop.style.cssText='position:absolute;top:calc(100% + 2px);left:0;right:0;background:#fff;border:1.5px solid var(--gold);border-radius:8px;max-height:200px;overflow-y:auto;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.12);display:none'; wrap.appendChild(drop); }
  function show(q) {
    const f=q?ALL_PAIRS.filter(p=>p.toLowerCase().includes(q.toLowerCase())).slice(0,15):ALL_PAIRS.slice(0,15);
    if (!f.length){drop.style.display='none';return;}
    drop.innerHTML=f.map(p=>'<div class="pair-opt" data-val="'+p+'" style="padding:8px 14px;cursor:pointer;font-size:.83rem;font-weight:600;transition:background .1s">'+p+'</div>').join('');
    drop.style.display='block';
    drop.querySelectorAll('.pair-opt').forEach(el=>{
      el.addEventListener('mouseover',()=>el.style.background='var(--gold-light)');
      el.addEventListener('mouseout',()=>el.style.background='');
      el.addEventListener('mousedown',e=>{e.preventDefault();input.value=el.dataset.val;hidden.value=el.dataset.val;drop.style.display='none';});
    });
  }
  input.addEventListener('input',()=>{hidden.value='';show(input.value);});
  input.addEventListener('focus',()=>show(input.value));
  input.addEventListener('blur',()=>{setTimeout(()=>{drop.style.display='none';if(!hidden.value&&input.value)hidden.value=input.value.toUpperCase();},200);});
}

// Init pair search on open
document.querySelectorAll('#add-trade-btn,#dash-add-btn,#mob-add').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(()=>{ initPairSearch(); const pi=document.getElementById('pair-search-input');if(pi)pi.value=''; const ph=document.getElementById('pair-search-hidden');if(ph)ph.value=''; },50);
  });
});

// ═══ REGISTER ═══
document.getElementById('show-register')?.addEventListener('click', () => {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('register-view').classList.remove('hidden');
});
document.getElementById('show-login')?.addEventListener('click', () => {
  document.getElementById('register-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
});

document.getElementById('register-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('register-error');
  err.classList.add('hidden');
  btn.textContent = 'Création...'; btn.disabled = true;
  try {
    const data = await api('POST', '/auth/register', {
      firstname: document.getElementById('reg-firstname').value,
      lastname: document.getElementById('reg-lastname').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value
    });
    showApp(data);
  } catch(ex) {
    err.textContent = ex.message; err.classList.remove('hidden');
  } finally { btn.textContent = 'Créer mon compte'; btn.disabled = false; }
});

// ═══ CALENDRIER ÉCONOMIQUE ═══
async function loadEcoCalendar() {
  const container = document.getElementById('eco-cal-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Chargement...</div>';
  try {
    const today = new Date();
    const from = today.toISOString().split('T')[0];
    const to = new Date(today.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];
    const res = await fetch('/api/eco-calendar?from=' + from + '&to=' + to);
    const data = await res.json();
    if (!data.length) { container.innerHTML = '<div class="empty"><p>Aucun événement.</p></div>'; return; }
    const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const FLAGS = {US:'🇺🇸',EU:'🇪🇺',GB:'🇬🇧',JP:'🇯🇵',CA:'🇨🇦',AU:'🇦🇺',NZ:'🇳🇿',CH:'🇨🇭',CN:'🇨🇳',DE:'🇩🇪',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',KR:'🇰🇷',IN:'🇮🇳',BR:'🇧🇷',MX:'🇲🇽',RU:'🇷🇺',ZA:'🇿🇦',SG:'🇸🇬',HK:'🇭🇰',SE:'🇸🇪',NO:'🇳🇴',DK:'🇩🇰',PL:'🇵🇱',CZ:'🇨🇿',HU:'🇭🇺',TR:'🇹🇷',ID:'🇮🇩',TH:'🇹🇭',MY:'🇲🇾',PH:'🇵🇭',VN:'🇻🇳',SA:'🇸🇦',AE:'🇦🇪',EG:'🇪🇬',NG:'🇳🇬',AR:'🇦🇷',CL:'🇨🇱',CO:'🇨🇴',PT:'🇵🇹',GR:'🇬🇷',AT:'🇦🇹',BE:'🇧🇪',NL:'🇳🇱',FI:'🇫🇮',IE:'🇮🇪',IL:'🇮🇱',BD:'🇧🇩',LT:'🇱🇹',LV:'🇱🇻',EE:'🇪🇪',RO:'🇷🇴',HR:'🇭🇷',BG:'🇧🇬',SK:'🇸🇰',SI:'🇸🇮'};
    const grouped = {};
    data.forEach(e => {
      const d = (e.time||'').substring(0,10);
      if (d.length < 10) return;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(e);
    });
    const sortedDates = Object.keys(grouped).sort();
    container.innerHTML = sortedDates.map(date => {
      const p = date.split('-');
      const d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
      const isToday = date === from;
      const label = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      return '<div style="margin-bottom:24px">'
        + '<div style="font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:8px 12px;border-radius:8px;margin-bottom:8px;background:' + (isToday?'var(--gold-light)':'var(--bg-subtle)') + ';color:' + (isToday?'var(--gold-dark)':'var(--text-muted)') + '">' + label + (isToday?' — Aujourd\'hui':'') + '</div>'
        + '<table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--text-light)">'
        + '<th style="text-align:left;padding:6px 10px">Heure</th><th style="text-align:left;padding:6px 10px">Dev.</th><th style="padding:6px 10px">Impact</th><th style="text-align:left;padding:6px 10px">Événement</th><th style="text-align:right;padding:6px 10px">Actuel</th><th style="text-align:right;padding:6px 10px">Prévu</th><th style="text-align:right;padding:6px 10px">Préc.</th>'
        + '</tr></thead><tbody>'
        + grouped[date].map((e,i) => {
          const impact = (e.impact||'').toLowerCase();
          const ic = impact==='high'?'var(--red)':impact==='medium'?'#f97316':'#9ca3af';
          const stars = impact==='high'?'<span style="color:var(--red)">●●●</span>':impact==='medium'?'<span style="color:#f97316">●●</span><span style="color:#e5e0d8">●</span>':'<span style="color:var(--green)">●</span><span style="color:#e5e0d8">●●</span>';
          const country = (e.country||'').toUpperCase();
          const flag = FLAGS[country] || '';
          const actual = e.actual !== null && e.actual !== undefined ? String(e.actual) : '—';
          const forecast = e.estimate !== null && e.estimate !== undefined ? String(e.estimate) : '—';
          const prev = e.prev !== null && e.prev !== undefined ? String(e.prev) : '—';
          const ac = actual !== '—' && forecast !== '—' ? (parseFloat(actual) >= parseFloat(forecast) ? 'var(--green)' : 'var(--red)') : 'var(--text)';
          return '<tr style="background:' + (i%2===0?'var(--bg-card)':'var(--bg-subtle)') + ';border-bottom:1px solid var(--border-2)">'
            + '<td style="padding:10px;font-size:.78rem;font-weight:600;color:var(--text-muted)">' + (e.time||'').substring(11,16) + '</td>'
            + '<td style="padding:10px"><span style="font-size:.72rem;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg-subtle);border:1px solid var(--border)">' + flag + ' ' + country + '</span></td>'
            + '<td style="padding:10px;text-align:center"><span style="font-size:.75rem;font-weight:700">' + stars + '</span></td>'
            + '<td style="padding:10px;font-size:.83rem">' + (e.event||'—') + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;font-weight:700;color:' + ac + '">' + actual + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;color:var(--text-muted)">' + forecast + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;color:var(--text-muted)">' + prev + '</td>'
            + '</tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
  } catch(ex) { container.innerHTML = '<div class="empty"><p>Erreur de chargement.</p></div>'; console.error(ex); }
}