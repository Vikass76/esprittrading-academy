let ecoWeekOffset = 0;
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
function renameAction(title, currentValue) {
  return new Promise(resolve => {
    const modal = document.getElementById('rename-modal');
    document.getElementById('rename-title').textContent = title;
    const input = document.getElementById('rename-input');
    input.value = currentValue || '';
    modal.classList.remove('hidden');
    input.focus();
    function cleanup(result) {
      modal.classList.add('hidden');
      document.getElementById('rename-ok').replaceWith(document.getElementById('rename-ok').cloneNode(true));
      document.getElementById('rename-cancel').replaceWith(document.getElementById('rename-cancel').cloneNode(true));
      document.getElementById('rename-close').replaceWith(document.getElementById('rename-close').cloneNode(true));
      resolve(result);
    }
    document.getElementById('rename-ok').addEventListener('click', () => cleanup(input.value.trim() || null));
    document.getElementById('rename-cancel').addEventListener('click', () => cleanup(null));
    document.getElementById('rename-close').addEventListener('click', () => cleanup(null));
    input.addEventListener('keydown', e => { if(e.key==='Enter') cleanup(input.value.trim() || null); });
  });
}
function confirmAction(title, msg, okLabel) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg || '';
    document.getElementById('confirm-ok').textContent = okLabel || 'Supprimer';
    modal.classList.remove('hidden');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    function cleanup(result) {
      modal.classList.add('hidden');
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
      resolve(result);
    }
    document.getElementById('confirm-ok').addEventListener('click', () => cleanup(true));
    document.getElementById('confirm-cancel').addEventListener('click', () => cleanup(false));
    modal.addEventListener('click', e => { if(e.target===modal) cleanup(false); }, {once:true});
  });
}
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
const axOpts = { grid:{color:'rgba(255,255,255,0.07)',borderDash:[4,4]}, ticks:{color:'#9ca3af',font:{size:10}}, border:{display:false} };
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
  finally { const ld = document.getElementById('app-loading'); if (ld) ld.remove(); }
});

function showLogin() { $('login-page').classList.remove('hidden'); $('app').classList.add('hidden'); }

function showApp(me) {
  const fb = document.getElementById('feedback-link');
  if (fb) fb.style.display = 'flex';
  role = me.role; user = me;
  $('login-page').classList.add('hidden'); $('app').classList.remove('hidden');
  $('nav-username').textContent = me.username;
  $('user-initials').textContent = me.username.slice(0,2).toUpperCase();
  if (me.role === 'admin') document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  if (me.role === 'student' || me.role === 'admin') { $('formation-student').classList.remove('hidden'); $('formation-community').classList.add('hidden'); const up = document.getElementById('formation-upsell'); if(up) up.style.display='none'; }
  else { $('formation-student').classList.add('hidden'); $('formation-community').classList.remove('hidden'); }
  loadAccounts().then(() => { if(accounts.length && !selAcc){ selAcc=accounts[0].id; renderAccBar(); } switchTab('dashboard'); loadDashboard(); });
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
  role=''; user=null; trades=[]; accounts=[]; stats=null; selAcc=null;
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
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
  try { accounts = await api('GET','/trades/accounts'); if(accounts.length && !selAcc) selAcc = accounts[0].id; renderAccBar(); updateAccSel(); } catch {}
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
        +'<button onclick="editAcc('+a.id+',event)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.7rem;padding:2px"><i class="ti ti-edit"></i></button>'
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
function editAcc(id, e) {
  e.stopPropagation();
  const a = accounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('eacc-id').value = a.id;
  document.getElementById('eacc-name').value = a.name;
  document.getElementById('eacc-type').value = a.type;
  document.getElementById('eacc-broker').value = a.broker || '';
  document.getElementById('eacc-balance').value = a.initial_balance || '';
  document.getElementById('edit-acc-modal').classList.remove('hidden');
}
async function saveEditAcc() {
  const id = document.getElementById('eacc-id').value;
  const d = {
    name: document.getElementById('eacc-name').value,
    type: document.getElementById('eacc-type').value,
    broker: document.getElementById('eacc-broker').value,
    initial_balance: parseFloat(document.getElementById('eacc-balance').value) || 0
  };
  await api('PATCH', '/trades/accounts/' + id, d);
  document.getElementById('edit-acc-modal').classList.add('hidden');
  await loadAccounts();
  stats = null;
  await loadDashboard();
  toast('Compte modifié', 'success');
}
async function delAcc(id, e) {
  e.stopPropagation();
  if (!await confirmAction('Supprimer ce compte ?', '')) return;
  await api('DELETE',`/trades/accounts/${id}`);
  selAcc = null;
  await loadAccounts();
  if (accounts.length) { selAcc = accounts[0].id; }
  renderAccBar(); loadDashboard(); loadTrades();
  toast('Compte supprimé','success');
}
function updateAccSel() {
  const s = $('trade-acc-sel');
  s.innerHTML = '<option value="">Choisir son compte</option>' + accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
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
      renderWeekCal([]);
      return;
    }
    const p = '?account_id=' + selAcc;
    stats = await api('GET', '/trades/stats' + p);
    renderKPIs(stats, 'dash-kpis', 8);
    const acc = accounts.find(a => String(a.id) === String(selAcc));
    if (acc) {
      const allT = await api('GET', '/trades?account_id=' + selAcc);
      const sorted = [...allT].sort((a,b) => a.trade_date.localeCompare(b.trade_date));
      cEq = kill(cEq);
      if (sorted.length) {
        let bal = acc.initial_balance;
        // Générer tous les jours entre premier trade et aujourd'hui
        const firstDate = new Date(sorted[0].trade_date + 'T12:00:00');
        const lastDate = new Date(Math.max(new Date(), new Date(sorted[sorted.length-1].trade_date + 'T12:00:00')));
        const allDays = [];
        const todayStr = new Date().toISOString().split('T')[0];
        for (let d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
          const ds = new Date(d).toISOString().split('T')[0];
          allDays.push(ds);
        }
        // Retirer le dernier jour si c'est aujourd'hui sans trade
        if (allDays[allDays.length-1] === todayStr && !sorted.find(t => t.trade_date === todayStr)) allDays.pop();
        // Calculer le solde par trade
        const balByDate = {};
        let runBal = acc.initial_balance;
        sorted.forEach(t => {
          runBal = parseFloat((runBal + (parseFloat(t.pnl)||0)).toFixed(2));
          balByDate[t.trade_date] = runBal;
        });
        // Remplir tous les jours avec le dernier solde connu
        let lastBal = acc.initial_balance;
        const labels = ['Départ', ...allDays.map(d => {
          const dd = new Date(d + 'T12:00:00');
          return dd.getDate() + ' ' + ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][dd.getMonth()];
        })];
        const data = [acc.initial_balance, ...allDays.map(d => {
          if (balByDate[d]) { lastBal = balByDate[d]; return lastBal; }
          return null;
        })];
        const fmt = v => '$' + Number(v).toLocaleString('fr-FR');
        renderWeekCal(allT);
        cEq = mkChart('c-equity','line',{ labels, datasets:[{ data, borderColor: GOLD, backgroundColor: 'rgba(244,199,15,0.05)', pointBackgroundColor: data.map((v,i) => (i===0||(i>0&&v!==data[i-1]))?(v>=acc.initial_balance?G:R):'transparent'), pointBorderColor: 'transparent', pointRadius: data.map((v,i) => (i===0||(i>0&&v!==data[i-1]))?3.5:0), borderWidth: 2.5, tension: 0.3, fill: true, spanGaps: true }]},{ plugins:{ legend:{display:false}, tooltip:{callbacks:{label: c => fmt(c.parsed.y)}}}, scales:{ x:{...axOpts,ticks:{...axOpts.ticks,maxTicksLimit:8,maxRotation:0}}, y:{...axOpts,ticks:{...axOpts.ticks,callback: fmt}}}});
      } else {
        renderWeekCal([]);
        renderEmptyChart('c-equity','line',['','','','','']);
      }
    } else {
      renderEquity(stats.equityCurve);
      renderWeekCal([]);
    }
  } catch(ex) { console.error(ex); }
}

function renderKPIs(s, elId, count=8) {
  const el = $(elId); if (!el) return;
  const streak = s.currentStreak;
  const all = [
    { label:'P&L Net', val: s.total&&s.totalPnl?(s.totalPnl>=0?'+$':'-$')+Math.abs(s.totalPnl).toFixed(0):'—', sub:'Résultat net', cls: s.total&&s.totalPnl?(s.totalPnl>=0?'g':'r'):'', icon:'ti-currency-dollar', accent: s.total&&s.totalPnl?(s.totalPnl>=0?'accent-g':'accent-r'):'' },
    { label:'Win Rate', val: s.total?s.winRate+'%':'—', sub: s.total?`${s.wins} gagnant${s.wins>1?'s':''}`:'—', cls: s.total?(s.winRate>=50?'g':'r'):'', icon:'ti-percentage', accent: s.total?(s.winRate>=50?'accent-g':'accent-r'):'' },
    { label:'Total trades', val: s.total||'—', sub: s.total?`${s.wins}W · ${s.losses}L · ${s.be}BE`:'Aucun trade', cls:'', icon:'ti-chart-bar' },
    { label:'RR cumulé', val: s.total?(s.totalRR>=0?'+':'')+s.totalRR+'R':'—', sub: s.total?`Moy: ${s.avgRR>=0?'+':''}${s.avgRR}R`:'—', cls: s.total?(s.totalRR>=0?'o':'r'):'', icon:'ti-trending-up', accent: s.total?(s.totalRR>=0?'accent-o':'accent-r'):'' },
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
      <td><span class="dir dir-${(t.direction||'LONG').toLowerCase()}">${(t.direction||'LONG')==='LONG'?'BUY':'SELL'}</span></td>
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
  if(!selAcc) {
    toast('Veuillez d\'abord créer un compte pour ajouter un trade.','info');
    $('acc-modal').classList.remove('hidden');
    return;
  }
  $('trade-form').reset();
  document.querySelectorAll('.field-error').forEach(el => el.remove());
  document.querySelectorAll('.field-error-input').forEach(el => el.classList.remove('field-error-input'));
  setTimeout(()=>{ initPairSearch(); const pi=document.getElementById('pair-search-input');if(pi)pi.value=''; const ph=document.getElementById('pair-search-hidden');if(ph)ph.value=''; },50);
  $('trade-form').querySelector('[name="trade_date"]').value = new Date().toISOString().split('T')[0];
  $('trade-modal').classList.remove('hidden');
  const tdi=document.getElementById('trade-date-input');
  if(tdi) tdi.max=new Date().toISOString().split('T')[0];
}
['add-trade-btn','dash-add-btn','mob-add'].forEach(id => $(id)?.addEventListener('click', openAddTrade));
$('tm-close').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('tm-cancel').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('trade-modal').addEventListener('click', e => { if(e.target===$('trade-modal')) $('trade-modal').classList.add('hidden'); });
$('trade-form').addEventListener('input', e => {
  const fg = e.target.closest('.fg');
  if (!fg) return;
  fg.querySelectorAll('.field-error').forEach(el => el.remove());
  e.target.classList.remove('field-error-input');
});
document.addEventListener('input', e => {
  if (e.target.id === 'pair-search-input') {
    const h = document.getElementById('pair-search-hidden');
    if (h) { h.classList.remove('field-error-input'); const fg = h.closest('.fg'); if (fg) fg.querySelectorAll('.field-error').forEach(el => el.remove()); }
  }
  if (e.target.id === 'setup-input') {
    e.target.classList.remove('field-error-input');
    const fg = e.target.closest('.fg'); if (fg) fg.querySelectorAll('.field-error').forEach(el => el.remove());
  }
});
document.addEventListener('click', e => {
  if (e.target.closest('#pair-search-results') || e.target.id === 'pair-search-input') {
    setTimeout(() => {
      const h = document.getElementById('pair-search-hidden');
      if (h && h.value) { h.classList.remove('field-error-input'); const fg = h.closest('.fg'); if (fg) fg.querySelectorAll('.field-error').forEach(el => el.remove()); }
    }, 100);
  }
  if (e.target.closest('#setup-suggestions')) {
    setTimeout(() => {
      const s = document.getElementById('setup-input');
      if (s && s.value) { s.classList.remove('field-error-input'); const fg = s.closest('.fg'); if (fg) fg.querySelectorAll('.field-error').forEach(el => el.remove()); }
    }, 100);
  }
});
$('trade-form').addEventListener('change', e => {
  const fg = e.target.closest('.fg');
  if (!fg) return;
  fg.querySelectorAll('.field-error').forEach(el => el.remove());
  e.target.classList.remove('field-error-input');
});
$('trade-form').addEventListener('submit', async e => {
  e.preventDefault();
  document.querySelectorAll('.field-error').forEach(el => el.remove());
  document.querySelectorAll('.field-error-input').forEach(el => el.classList.remove('field-error-input'));

  const form = new FormData($('trade-form'));
  let hasError = false;

  function showError(inputEl, msg) {
    if (!inputEl) return;
    inputEl.classList.add('field-error-input');
    const err = document.createElement('div');
    err.className = 'field-error';
    err.style.cssText = 'color:#ef4444;font-size:11px;margin-top:3px;';
    err.textContent = msg;
    const fg = inputEl.closest('.fg');
    if (fg) fg.appendChild(err);
    hasError = true;
  }

  const pairVal = form.get('pair');
  if (!pairVal || !pairVal.trim()) showError(document.getElementById('pair-search-hidden'), 'La paire est obligatoire');

  const dateVal = form.get('trade_date');
  if (!dateVal) showError(document.getElementById('trade-date-input'), 'La date est obligatoire');

  const rrVal = form.get('rr');
  if (rrVal === '' || rrVal === null) showError(document.querySelector('[name="rr"]'), 'Le RR est obligatoire');

  const pnlVal = form.get('pnl');
  if (pnlVal === '' || pnlVal === null) showError(document.querySelector('[name="pnl"]'), 'Le P&L est obligatoire');

  const accountVal = form.get('account_id');
  if (!accountVal || !accountVal.trim()) showError(document.getElementById('trade-acc-sel'), 'Le compte est obligatoire');

  const sessionVal = form.get('session');
  if (!sessionVal || !sessionVal.trim()) showError(document.querySelector('select[name="session"]'), 'La session est obligatoire');

  const setupVal2 = form.get('setup');
  if (!setupVal2 || !setupVal2.trim()) showError(document.getElementById('setup-input'), 'Le setup est obligatoire');

  if (hasError) return;

  try {
    const setupVal = form.get('setup');
    if(setupVal && setupVal.trim()) saveSetupTag(setupVal.trim());
    const result = (form.get('result')||'').trim();
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
  $('d-dir').innerHTML = `<span class="dir dir-${(t.direction||'LONG').toLowerCase()}">${(t.direction||'LONG')==='LONG'?'BUY':'SELL'}</span>`;
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
  if(!detailId||!await confirmAction('Supprimer ce trade ?', '')) return;
  await api('DELETE',`/trades/${detailId}`);
  toast('Trade supprimé','success'); closeDetail(); loadTrades(); loadDashboard(); loadAccounts();
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
    loadTrades(); loadDashboard(); loadAccounts();
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
    const pnl=dt.reduce((s,t)=>s+(parseFloat(t.pnl)||0),0);
    html+=`<div class="${cls}">
      <div class="cal-dn">${d}</div>
      ${dt.length?`
        <div class="cal-cnt">${dt.length} trade${dt.length>1?'s':''}</div>
        <div class="cal-rr ${rr>=0?'p':'n'}">${rr>=0?'+':''}${rr.toFixed(1)}R</div>
        <div style="font-size:.75rem;font-weight:600;color:${pnl>=0?'var(--green)':'var(--red)'};${pnl>=0?'':''}margin-top:2px">${pnl>=0?'+':''}${Math.abs(pnl).toLocaleString('fr-FR',{maximumFractionDigits:0})}$</div>
      `:''}
    </div>`;
  }
  $('cal-grid').innerHTML=html;
}
$('cal-prev').addEventListener('click',()=>{cM--;if(cM<0){cM=11;cY--;}renderCal();});
$('cal-next').addEventListener('click',()=>{cM++;if(cM>11){cM=0;cY++;}renderCal();});

/* ── ANALYTICS ── */
/* ── PALETTE ANALYTICS ── */
const AN_PALETTE = ['#4ade80','#60a5fa','#f59e0b','#f87171','#a78bfa','#34d399','#fb923c','#38bdf8'];
const AN_DIR_KEYS  = ['BUY','SELL'];
const AN_SESS_KEYS = ['London','New York','Asia'];
const AN_SETUP_KEYS= ['OTE','FVG','BOS','MSS','PRT','Autre'];

async function loadAnalytics() {
  try {
    const anEl=$('an-kpis'); anEl.innerHTML='';
    const mkEmpty=keys=>Object.fromEntries(keys.map(k=>[k,{total:0,wins:0}]));
    if(!selAcc){
      const anEl2=$('an-kpis'); anEl2.innerHTML='';
      [{label:'Total Trades',val:'—',sub:'Aucun trade',cls:'',icon:'ti-chart-bar'},
       {label:'Win Rate',val:'—',sub:'—',cls:'',icon:'ti-percentage'},
       {label:'RR cumulé',val:'—',sub:'—',cls:'',icon:'ti-trending-up'},
       {label:'Profit Factor',val:'—',sub:'—',cls:'',icon:'ti-math-function'}
      ].forEach(k=>{const d=document.createElement('div');d.className='kpi';d.innerHTML='<div class="kpi-label"><i class="ti '+k.icon+'"></i>'+k.label+'</div><div class="kpi-val">'+k.val+'</div><div class="kpi-sub">'+k.sub+'</div>';anEl2.appendChild(d);});
      renderPairTable([]);
      renderDonutSection('dir',  mkEmpty(AN_DIR_KEYS),  AN_PALETTE,AN_DIR_KEYS);
      renderDonutSection('sess', mkEmpty(AN_SESS_KEYS), AN_PALETTE,AN_SESS_KEYS);
      renderDonutSection('setup',{'':{ total:0,wins:0}},['rgba(255,255,255,0.08)'],['']);
      renderPerfJour([]);
      renderFrequency([]);
      renderWinnersLosers([]);
      return;
    }
    const p='?account_id='+selAcc;
    const s=await api('GET','/trades/stats'+p);
    trades=await api('GET','/trades'+p);
    const gW=trades.filter(t=>parseFloat(t.pnl)>0).reduce((a,t)=>a+parseFloat(t.pnl),0);
    const gL=Math.abs(trades.filter(t=>parseFloat(t.pnl)<0).reduce((a,t)=>a+parseFloat(t.pnl),0));
    const pf=gL>0?(gW/gL).toFixed(2):gW>0?'∞':'—';
    const pfC=parseFloat(pf)>=1.5?'var(--green)':parseFloat(pf)>=1?'var(--gold-dark)':'var(--red)';
    [{label:'Total Trades',val:s.total||'—',sub:s.total?s.wins+'W · '+s.losses+'L · '+s.be+'BE':'Aucun trade',cls:'',icon:'ti-chart-bar'},
     {label:'Win Rate',val:s.total?s.winRate+'%':'—',sub:s.total?s.wins+' gagnant'+(s.wins>1?'s':''):'—',cls:s.total?(s.winRate>=50?'g':'r'):'',icon:'ti-percentage'},
     {label:'RR cumulé',val:s.total?(s.totalRR>=0?'+':'')+s.totalRR+'R':'—',sub:s.total?'Moy: '+(s.avgRR>=0?'+':'')+s.avgRR+'R':'—',cls:s.total?(s.totalRR>=0?'o':'r'):'',icon:'ti-trending-up'}
    ].forEach(k=>{const d=document.createElement('div');d.className='kpi';d.innerHTML='<div class="kpi-label"><i class="ti '+k.icon+'"></i>'+k.label+'</div><div class="kpi-val '+k.cls+'">'+k.val+'</div><div class="kpi-sub">'+k.sub+'</div>';anEl.appendChild(d);});
    const pfDiv=document.createElement('div');pfDiv.className='kpi';
    const pfFontSize = pf==='∞' ? 'font-size:2.7em' : '';
    pfDiv.innerHTML='<div class="kpi-label"><i class="ti ti-math-function"></i>Profit Factor</div><div class="kpi-val" style="color:'+pfC+';'+pfFontSize+'">'+pf+'</div><div class="kpi-sub">'+(gL>0?'G:'+gW.toFixed(0)+' P:'+gL.toFixed(0):'—')+'</div>';
    anEl.appendChild(pfDiv);
    renderWinnersLosers(trades);

    const byDir=mkEmpty(AN_DIR_KEYS);
    trades.forEach(t=>{const raw=(t.direction||'LONG').toUpperCase();const d=raw==='LONG'?'BUY':'SELL';if(!byDir[d])byDir[d]={total:0,wins:0};byDir[d].total++;if(t.result==='WIN')byDir[d].wins++;});
    renderDonutSection('dir',byDir,AN_PALETTE,AN_DIR_KEYS);

    const bySess=mkEmpty(AN_SESS_KEYS);
    trades.forEach(t=>{const s=t.session||'Non définie';if(!bySess[s])bySess[s]={total:0,wins:0};bySess[s].total++;if(t.result==='WIN')bySess[s].wins++;});
    const sessKeys=[...AN_SESS_KEYS,...Object.keys(bySess).filter(k=>!AN_SESS_KEYS.includes(k)&&k!=='Non définie')];
    renderDonutSection('sess',bySess,AN_PALETTE,sessKeys);

    const bySetup={};
    trades.forEach(t=>{const s=(t.setup||'Autre').trim();if(!bySetup[s])bySetup[s]={total:0,wins:0};bySetup[s].total++;if(t.result==='WIN')bySetup[s].wins++;});
    const setupKeys=Object.keys(bySetup).filter(k=>bySetup[k].total>0);
    if(!setupKeys.length) setupKeys.push('Autre');
    renderDonutSection('setup',setupKeys.length?bySetup:{'':{ total:0,wins:0}},setupKeys.length?AN_PALETTE:['rgba(255,255,255,0.08)'],setupKeys.length?setupKeys:['']);

    renderPairTable(s.byPair);
    renderPerfJour(trades);
    renderFrequency(trades);
  }catch(ex){console.error(ex);}
}

let _anCharts={};
function renderDonutSection(id,dataObj,palette,keys){
  if(_anCharts[id]){try{_anCharts[id].destroy();}catch(e){}  _anCharts[id]=null;}
  const old=document.getElementById('c-'+id+'-wr');if(old)old.remove();
  const colors=keys.map((_,i)=>palette[i%palette.length]);
  const totals=keys.map(k=>(dataObj[k]||{total:0}).total);
  const total=totals.reduce((a,b)=>a+b,0);
  const legTotal=document.getElementById('leg-'+id+'-total');
  const legWR=document.getElementById('leg-'+id+'-wr');
  const wrapWR=document.getElementById('wrap-'+id+'-wr');
  const mkLeg=()=>keys.map((k,i)=>'<div class="an-legend-item"><span class="an-legend-dot" style="background:'+colors[i]+'"></span><span>'+k+'</span></div>').join('');
  if(legTotal)legTotal.innerHTML=mkLeg();
  if(legWR)legWR.innerHTML=mkLeg();
  const cvs=document.getElementById('c-'+id+'-total');
  if(cvs){
    const cd=total>0?totals:keys.map(()=>1);
    const cc=total>0?colors:keys.map(()=>'rgba(255,255,255,0.06)');
    _anCharts[id]=new Chart(cvs.getContext('2d'),{
      type:'doughnut',
      data:{labels:keys,datasets:[{data:cd,backgroundColor:cc,borderColor:'#0f1117',borderWidth:3,hoverOffset:5}]},
      options:{cutout:'65%',plugins:{legend:{display:false},tooltip:{enabled:false}},animation:{duration:600}},
      plugins:[{id:'ctr',afterDraw(chart){
        const{ctx,chartArea:{top,bottom,left,right}}=chart;
        const cx=(left+right)/2,cy=(top+bottom)/2,ac=chart._active;
        ctx.save();
        if(ac&&ac.length&&total>0){
          const i=ac[0].index,pct=Math.round(totals[i]/total*100);
          ctx.font='bold 18px Inter,sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(pct+'%',cx,cy-8);
          ctx.font='10px Inter,sans-serif';ctx.fillStyle='#9ca3af';ctx.fillText(keys[i],cx,cy+10);
        }else{
          ctx.font='bold 20px Inter,sans-serif';ctx.fillStyle=total>0?'#fff':'#374151';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(total||'0',cx,cy-8);
          ctx.font='10px Inter,sans-serif';ctx.fillStyle='#6b7280';ctx.fillText(total===1?'trade':'trades',cx,cy+10);
        }
        // % sur segments
        if(total>0){
          const meta=chart.getDatasetMeta(0);
          meta.data.forEach(function(arc,i){
            const pct=Math.round(totals[i]/total*100);if(pct===0)return;
            const angle=(arc.startAngle+arc.endAngle)/2;
            const r=(arc.outerRadius+arc.innerRadius)/2;
            const x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;
            ctx.save();ctx.font='bold 11px Inter,sans-serif';
            ctx.shadowColor='rgba(0,0,0,0.8)';ctx.shadowBlur=6;
            ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText(pct+'%',x,y);ctx.restore();
          });
        }
        ctx.restore();
      }}]
    });
  }
  if(wrapWR){
    wrapWR.innerHTML='';
    const cvs2=document.createElement('canvas');
    cvs2.id='c-'+id+'-wr';
    const dpr=window.devicePixelRatio||1;
    const S=160;
    cvs2.width=S*dpr; cvs2.height=S*dpr;
    cvs2.style.width=S+'px'; cvs2.style.height=S+'px'; cvs2.style.display='block'; cvs2.style.margin='auto';
    wrapWR.appendChild(cvs2);
    const ctx2=cvs2.getContext('2d'); ctx2.scale(dpr,dpr); const cx=S/2,cy=S/2,n=keys.length;
    const thick=12,gap=4,maxR=cx-10;
    const wr=keys.map(k=>dataObj[k]&&dataObj[k].total?dataObj[k].wins/dataObj[k].total:0);
    let hov=null;
    function draw(h){
      ctx2.clearRect(0,0,S,S);
      for(let i=0;i<n;i++){
        const r=maxR-i*(thick+gap);if(r<thick/2)break;
        ctx2.beginPath();ctx2.arc(cx,cy,r,0,Math.PI*2);
        ctx2.strokeStyle='rgba(200,200,200,0.12)';ctx2.lineWidth=thick;ctx2.stroke();
        const ang=wr[i]*Math.PI*2;
        const hasData=dataObj[keys[i]]&&dataObj[keys[i]].total>0;
        if(ang>0.01){
          ctx2.beginPath();ctx2.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+ang);
          ctx2.strokeStyle=colors[i];ctx2.lineWidth=thick+(h===i?3:0);ctx2.lineCap='round';ctx2.stroke();
        } else if(hasData){
          ctx2.beginPath();ctx2.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+0.08);
          ctx2.strokeStyle='rgba(239,68,68,0.85)';ctx2.lineWidth=4;ctx2.lineCap='round';ctx2.stroke();
        }
      }
      ctx2.save();
      if(h!==null&&h<n){
        const bgR=30;
        ctx2.beginPath();ctx2.arc(cx,cy,bgR,0,Math.PI*2);
        ctx2.fillStyle='rgba(15,17,23,0.45)';ctx2.fill();
        ctx2.font='bold 12px Inter,sans-serif';ctx2.fillStyle=colors[h];ctx2.textAlign='center';ctx2.textBaseline='middle';
        ctx2.fillText(keys[h],cx,cy-8);
        ctx2.font='11px Inter,sans-serif';ctx2.fillStyle='#9ca3af';
        ctx2.fillText(Math.round(wr[h]*100)+'%',cx,cy+8);
      }
      ctx2.restore();
    }
    draw(null);
    cvs2.addEventListener('mousemove',e=>{
      const rc=cvs2.getBoundingClientRect(),sx=S/rc.width,sy=S/rc.height;
      const mx=(e.clientX-rc.left)*sx,my=(e.clientY-rc.top)*sy;
      const dist=Math.sqrt((mx-cx)**2+(my-cy)**2);
      let f=null;
      for(let i=0;i<n;i++){const r=maxR-i*(thick+gap);if(r<thick/2)break;if(Math.abs(dist-r)<=thick/2+3){f=i;break;}}
      if(f!==hov){hov=f;draw(hov);}
    });
    cvs2.addEventListener('mouseleave',()=>{hov=null;draw(null);});
  }
}

let _perfJourChart=null;
function renderPerfJour(trades){
  if(_perfJourChart){try{_perfJourChart.destroy();}catch(e){}_perfJourChart=null;}
  const days=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const byDay=days.map(d=>({label:d,pnl:0,wins:0,losses:0,total:0,gainsPnl:0,lossesPnl:0}));
  trades.forEach(t=>{
    const d=new Date(t.trade_date+'T12:00:00').getDay();
    const pnlVal=parseFloat(t.pnl)||0;
    byDay[d].pnl+=pnlVal;
    byDay[d].total++;
    if(t.result==='WIN'){byDay[d].wins++;byDay[d].gainsPnl+=pnlVal;}
    else{byDay[d].losses++;byDay[d].lossesPnl+=pnlVal;}
  });
  const cvs=document.getElementById('c-perf-jour');
  if(!cvs)return;
  const dataGains=byDay.map(d=>d.gainsPnl>0?parseFloat(d.gainsPnl.toFixed(2)):null);
  const dataLosses=byDay.map(d=>d.lossesPnl<0?parseFloat(d.lossesPnl.toFixed(2)):null);
  const winRates=byDay.map(d=>d.total?Math.round(d.wins/d.total*100):null);
  _perfJourChart=new Chart(cvs.getContext('2d'),{
    type:'bar',
    data:{labels:days,datasets:[
      {data:dataGains,backgroundColor:function(ctx){const chart=ctx.chart;const {ctx:c,chartArea}=chart;if(!chartArea)return 'rgba(16,185,129,0.85)';const zeroX=chart.scales.x.getPixelForValue(0);const g=c.createLinearGradient(zeroX,0,chartArea.right,0);g.addColorStop(0,'rgba(16,185,129,0.9)');g.addColorStop(1,'rgba(5,150,105,0.2)');return g;},borderRadius:3,borderSkipped:false,barThickness:14,stack:'a'},
      {data:dataLosses,backgroundColor:function(ctx){const chart=ctx.chart;const {ctx:c,chartArea}=chart;if(!chartArea)return 'rgba(239,68,68,0.85)';const zeroX=chart.scales.x.getPixelForValue(0);const g=c.createLinearGradient(chartArea.left,0,zeroX,0);g.addColorStop(0,'rgba(239,68,68,0.15)');g.addColorStop(1,'rgba(239,68,68,0.9)');return g;},borderRadius:3,borderSkipped:false,barThickness:14,stack:'a'}
    ]},
    options:{
      indexAxis:'y',responsive:true,maintainAspectRatio:false,
      layout:{padding:{right:75,top:30}},
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            title:function(ctx){return days[ctx[0].dataIndex];},
            label:function(ctx){
              const v=ctx.parsed.x;
              const sign=v>=0?'Profits':'Pertes';
              return ' '+sign+' quotidiens: '+v.toFixed(2)+' $';
            }
          },
          backgroundColor:'#111827',titleColor:'#e5e7eb',bodyColor:'#9ca3af',
          borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:12,cornerRadius:8
        }
      },
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.07)',borderDash:[4,4]},ticks:{color:'#6b7280',font:{size:11},callback:function(v){return Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':v;}},border:{display:false}},
        y:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:12},padding:8},border:{display:false}}
      }
    },
    plugins:[{id:'zeroLine',afterDraw:function(chart){
      const{ctx,chartArea:{top,bottom,left,right},scales:{x,y}}=chart;
      // Lignes horizontales pointillées entre chaque jour
      const labels=chart.data.labels;
      for(let i=0;i<=labels.length;i++){
        const yPos=y.getPixelForValue(i-0.5);
        ctx.save();ctx.beginPath();ctx.setLineDash([4,4]);
        ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;
        ctx.moveTo(left,yPos);ctx.lineTo(right,yPos);ctx.stroke();
        ctx.restore();
      }
      const zeroX=x.getPixelForValue(0);
      ctx.save();ctx.beginPath();ctx.setLineDash([4,4]);
      ctx.strokeStyle='rgba(239,68,68,0.6)';ctx.lineWidth=1.5;
      ctx.moveTo(zeroX,top);ctx.lineTo(zeroX,bottom);ctx.stroke();
      ctx.restore();
      ctx.save();ctx.font='bold 11px Inter,sans-serif';ctx.fillStyle='#6b7280';
      ctx.textAlign='right';ctx.fillText('Win Rate',right+72,top-10);ctx.restore();
      days.forEach(function(_,i){
        const pct=winRates[i];if(pct===null)return;
        const yPos=y.getPixelForValue(i);
        const bg=pct>=50?'#059669':'#ef4444';
        const text=pct+'%';
        ctx.save();ctx.font='bold 11px Inter,sans-serif';
        const tw=ctx.measureText(text).width;
        const bw=Math.max(tw+16,42),bh=20,bx=right+8,by=yPos-bh/2;
        ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(bx,by,bw,bh,5);ctx.fill();
        ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(text,bx+bw/2,yPos);ctx.restore();
      });
    }}]
  });
}


let _freqCharts={day:null,week:null,month:null};
function renderFrequency(trades){
  Object.values(_freqCharts).forEach(c=>{if(c)try{c.destroy();}catch(e){}});
  _freqCharts={day:null,week:null,month:null};

  function makeGrad(ctx,h){
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'rgba(96,165,250,0.95)');
    g.addColorStop(1,'rgba(29,78,216,0.15)');
    return g;
  }

  function mkChart(id,labels,data,avg,avgEl,barPct){
    const cvs=document.getElementById(id);if(!cvs)return null;
    const ctx=cvs.getContext('2d');
    if(avgEl){
      const el=document.getElementById(avgEl);
      if(el)el.innerHTML='Avg <span>'+avg+'</span>';
    }
    return new Chart(ctx,{
      type:'bar',
      data:{labels,datasets:[{
        data,
        backgroundColor:function(c){return makeGrad(ctx,c.chart.chartArea?.height||200);},
        borderRadius:4,borderSkipped:false,barPercentage:0.4,maxBarThickness:40
      }]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{
          backgroundColor:'#111827',titleColor:'#e5e7eb',bodyColor:'#9ca3af',
          borderColor:'rgba(255,255,255,0.1)',borderWidth:1,padding:10,cornerRadius:8
        }},
        scales:{
          x:{grid:{display:false},ticks:{color:'#6b7280',font:{size:11}},border:{display:false}},
          y:{grid:{color:'rgba(255,255,255,0.07)',borderDash:[4,4]},ticks:{color:'#6b7280',font:{size:11}},border:{display:false}}
        }
      }
    });
  }

  // Par jour
  const byDay={};
  trades.forEach(t=>{
    const d=t.trade_date;if(!d)return;
    byDay[d]=(byDay[d]||0)+1;
  });
  const dayLabels=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const byDayOfWeek=[0,0,0,0,0,0,0],byDayCount=[0,0,0,0,0,0,0];
  Object.entries(byDay).forEach(([d,n])=>{
    const dow=new Date(d+'T12:00:00').getDay();
    byDayOfWeek[dow]+=n; byDayCount[dow]++;
  });
  const dayData=dayLabels.map((_,i)=>byDayCount[(i+1)%7]>0?parseFloat((byDayOfWeek[(i+1)%7]/byDayCount[(i+1)%7]).toFixed(2)):0);
  const avgDay=dayData.filter(v=>v>0).length?parseFloat((dayData.reduce((a,b)=>a+b,0)/dayData.filter(v=>v>0).length).toFixed(2)):0;
  _freqCharts.day=mkChart('c-freq-day',dayLabels,dayData,avgDay,'freq-day-avg',0.5);

  // Par semaine
  const byWeek={};
  trades.forEach(t=>{
    const d=new Date(t.trade_date+'T12:00:00');
    const y=d.getFullYear(),w=Math.ceil((((d-new Date(y,0,1))/86400000)+new Date(y,0,1).getDay()+1)/7);
    const k=y+'-W'+w; byWeek[k]=(byWeek[k]||0)+1;
  });
  const wks=Object.keys(byWeek).sort().slice(-8);
  const avgWeek=wks.length?parseFloat((wks.reduce((a,k)=>a+byWeek[k],0)/wks.length).toFixed(1)):0;
  _freqCharts.week=mkChart('c-freq-week',wks.map(w=>'S'+w.split('-W')[1]),wks.map(k=>byWeek[k]),avgWeek,'freq-week-avg',0.5);

  // Par mois
  const byMonth={};
  trades.forEach(t=>{
    const m=t.trade_date?.substring(0,7);if(!m)return;
    byMonth[m]=(byMonth[m]||0)+1;
  });
  const months=Object.keys(byMonth).sort().slice(-6);
  const MO=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const avgMonth=months.length?parseFloat((months.reduce((a,m)=>a+byMonth[m],0)/months.length).toFixed(1)):0;
  _freqCharts.month=mkChart('c-freq-month',months.map(m=>MO[parseInt(m.split('-')[1])-1]),months.map(m=>byMonth[m]),avgMonth,'freq-month-avg',0.5);
}

function renderPairTable(byPair){
  const tbl=$('pair-tbl');
  if(!byPair?.length){tbl.innerHTML='<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text-muted)">Aucune donnée</td></tr>';return;}
  tbl.innerHTML='<thead><tr><th>Paire</th><th>Trades</th><th>Win Rate</th><th>RR Total</th><th>P&L</th></tr></thead><tbody>'+byPair.map(p=>{
    const wr=p.total?Math.round(p.wins/p.total*100):0;
    return '<tr><td><span class="pair-tag">'+p.pair+'</span></td><td>'+p.total+'</td><td><div class="wr-row"><div class="wr-track"><div class="wr-fill" style="width:'+wr+'%"></div></div><span style="font-size:.75rem;font-weight:600;min-width:32px">'+wr+'%</span></div></td><td class="'+(p.rr>=0?'pnl-p':'pnl-n')+'">'+(p.rr>=0?'+':'')+p.rr.toFixed(2)+'R</td><td class="'+(p.pnl>=0?'pnl-p':'pnl-n')+'">'+(p.pnl>=0?'+$':'-$')+Math.abs(p.pnl).toFixed(2)+'</td></tr>';
  }).join('')+'</tbody>';
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
document.getElementById('edit-profile-btn')?.addEventListener('click', async ()=>{
  if(!user) { try { user = await api('GET','/auth/me'); } catch(e){} }
  document.getElementById('profile-firstname').value = user?.firstname || '';
  document.getElementById('profile-lastname').value = user?.lastname || '';
  document.getElementById('profile-email').value = user?.email || '';
  document.getElementById('pwd-cur').value = '';
  document.getElementById('pwd-new').value = '';
  document.getElementById('pwd-cf').value = '';
  $('pwd-modal').classList.remove('hidden');
});
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
document.getElementById('access-search-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('access-search-email').value.trim();
  const resultEl = document.getElementById('access-result');
  resultEl.innerHTML = '';
  if (!email) { toast('Entre un email', 'error'); return; }
  try {
    const u = await api('GET', '/admin/users/search?email=' + encodeURIComponent(email));
    const roleLabel = u.role === 'student' ? 'Déjà élève' : u.role === 'admin' ? 'Administrateur' : 'Compte gratuit';
    resultEl.innerHTML = '<div class="card" style="padding:14px"><div style="font-weight:700;margin-bottom:4px">' + (u.firstname||'') + ' ' + (u.lastname||u.username) + '</div><div style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">' + (u.email||'—') + ' · ' + roleLabel + '</div></div>';
    if (u.role !== 'student' && u.role !== 'admin') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Donner accès à la formation';
      btn.style.marginTop = '8px';
      btn.onclick = async () => {
        if (!await confirmAction('Débloquer la formation pour ' + (u.firstname||u.username) + ' ?', '', 'Confirmer')) return;
        await api('PATCH', '/admin/users/' + u.id + '/promote', {});
        toast('Accès formation débloqué !', 'success');
        resultEl.innerHTML = '';
        document.getElementById('access-search-email').value = '';
      };
      resultEl.appendChild(btn);
    }
  } catch (e) {
    resultEl.innerHTML = '<p style="font-size:.82rem;color:var(--red)">' + e.message + '</p>';
  }
});
document.querySelectorAll('.atab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.atab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('#atab-modules,#atab-users,#atab-access').forEach(s=>s.classList.add('hidden'));
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
        <button class="btn btn-secondary btn-sm vw" data-id="${u.id}" data-n="${u.firstname||u.username}">Voir</button>
        <button class="btn btn-secondary btn-sm dem" data-id="${u.id}" data-n="${u.firstname||u.username}">Retirer accès</button>
      </div></div>`).join('');
    el.querySelectorAll('.vw').forEach(b=>b.addEventListener('click',()=>openUserView(b.dataset.id,b.dataset.n)));
    el.querySelectorAll('.dem').forEach(b=>b.addEventListener('click',async()=>{if(!await confirmAction('Retirer l\'accès formation pour '+b.dataset.n+' ?', '', 'Confirmer'))return;await api('PATCH',`/admin/users/${b.dataset.id}/demote`,{});toast('Accès formation retiré','success');loadAdminUsers();}));
  }catch{toast('Erreur élèves','error');}
}
async function openUserView(userId, name) {
  const modal = document.getElementById('user-view-modal');
  document.getElementById('uv-name').textContent = name;
  document.getElementById('uv-body').innerHTML = '<div style="text-align:center;padding:40px">Chargement...</div>';
  modal.classList.remove('hidden');
  try {
    const data = await api('GET', '/trades/user/' + userId);
    const list = data.trades;
    if (!list.length) { document.getElementById('uv-body').innerHTML = '<p>Aucun trade.</p>'; return; }
    const wins=list.filter(t=>t.result==='WIN').length;
    const losses=list.filter(t=>t.result==='LOSS').length;
    const be=list.filter(t=>t.result==='BE').length;
    const totalRR=list.reduce((s,t)=>s+(parseFloat(t.rr)||0),0);
    const totalPnl=list.reduce((s,t)=>s+(parseFloat(t.pnl)||0),0);
    const wr=list.length?(wins/list.length*100).toFixed(1):0;
    let rows="";
    list.forEach(t=>{
      const rr=parseFloat(t.rr)||0,pnl=parseFloat(t.pnl)||0;
      const dir=(t.direction||'LONG')==='LONG'?'BUY':'SELL';
      rows+='<tr><td>'+fmtDate(t.trade_date)+'</td><td>'+t.pair+'</td><td>'+dir+'</td><td>'+rbadge(t.result)+'</td><td>'+(rr>=0?'+':'')+rr+'R</td><td>'+(pnl>=0?'+$':'-$')+Math.abs(pnl).toFixed(2)+'</td><td>'+(t.session||'—')+'</td><td>'+(t.setup||'—')+'</td></tr>';
    });
    let h='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">';
    h+='<div class="kcard"><div class="kcard-label">TRADES</div><div class="kcard-val">'+list.length+'</div><div class="kcard-sub">'+wins+'W '+losses+'L '+be+'BE</div></div>';
    h+='<div class="kcard"><div class="kcard-label">WIN RATE</div><div class="kcard-val">'+wr+'%</div></div>';
    h+='<div class="kcard"><div class="kcard-label">RR</div><div class="kcard-val">'+(totalRR>=0?'+':'')+totalRR.toFixed(1)+'R</div></div>';
    h+='<div class="kcard"><div class="kcard-label">P&L</div><div class="kcard-val">'+(totalPnl>=0?'+$':'-$')+Math.abs(totalPnl).toFixed(0)+'</div></div></div>';
    h+='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Paire</th><th>Dir.</th><th>Résultat</th><th>RR</th><th>P&L</th><th>Session</th><th>Setup</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    document.getElementById('uv-body').innerHTML = h;
  } catch(e) { document.getElementById('uv-body').innerHTML = '<p>Erreur.</p>'; }
}


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
        <div class="adm-mod-h">
          <span class="adm-mod-n"><i class="ti ti-folder" style="color:var(--gold-dark)"></i>${m.title}<span class="mod-cnt">${vids.length}</span></span>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-secondary btn-sm mu" data-id="${m.id}" data-dir="up" title="Monter">↑</button>
            <button class="btn btn-secondary btn-sm mu" data-id="${m.id}" data-dir="down" title="Descendre">↓</button>
            <button class="btn btn-secondary btn-sm em" data-id="${m.id}" data-title="${m.title}">Renommer</button>
            <button class="btn btn-danger btn-sm dm" data-id="${m.id}">Supprimer</button>
          </div>
        </div>
        ${vids.map(v=>`<div class="adm-vid-row">${getThumb(v)}<span class="adm-vid-title">${v.title}</span><div class="adm-vid-acts"><button class="btn btn-secondary btn-sm vu" data-id="${v.id}" data-dir="up">↑</button><button class="btn btn-secondary btn-sm vu" data-id="${v.id}" data-dir="down">↓</button><button class="btn btn-secondary btn-sm ev" data-id="${v.id}">Modifier</button><button class="btn btn-danger btn-sm dv" data-id="${v.id}" data-t="${v.title}">Suppr.</button></div></div>`).join('')}
        ${!vids.length?`<div style="padding:10px 16px;font-size:.78rem;color:var(--text-muted)">Aucune vidéo.</div>`:''}
      </div>`;
    }).join('');
    el.querySelectorAll('.mu').forEach(b=>b.addEventListener('click',async()=>{await api('PATCH',`/admin/modules/${b.dataset.id}/position`,{direction:b.dataset.dir});loadAdminMods();}));
    el.querySelectorAll('.em').forEach(b=>b.addEventListener('click',async()=>{const t=await renameAction('Renommer le module',b.dataset.title);if(!t)return;await api('PATCH',`/admin/modules/${b.dataset.id}`,{title:t});toast('Module renommé','success');loadAdminMods();}));
    el.querySelectorAll('.vu').forEach(b=>b.addEventListener('click',async()=>{await api('PATCH',`/admin/videos/${b.dataset.id}/position`,{direction:b.dataset.dir});loadAdminMods();}));
    el.querySelectorAll('.dm').forEach(b=>b.addEventListener('click',async()=>{if(!await confirmAction('Supprimer ce module ?', ''))return;await api('DELETE',`/admin/modules/${b.dataset.id}`);toast('Module supprimé','success');loadAdminMods();}));
    el.querySelectorAll('.dv').forEach(b=>b.addEventListener('click',async()=>{if(!await confirmAction(`Supprimer "${b.dataset.t}" ?`, 'Cette action est irréversible.'))return;await api('DELETE',`/admin/videos/${b.dataset.id}`);toast('Vidéo supprimée','success');loadAdminMods();}));
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
        +'<button onclick="editAcc('+a.id+',event)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.7rem;padding:2px"><i class="ti ti-edit"></i></button>'
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
      scales:{ x:{grid:{color:'rgba(255,255,255,0.07)',borderDash:[4,4]},ticks:{color:'#9ca3af',font:{size:10}},border:{display:false}}, y:{grid:{color:'rgba(255,255,255,0.07)',borderDash:[4,4]},ticks:{color:'#9ca3af',font:{size:10}},border:{display:false},beginAtZero:true}}}});
}

// ═══ PAIR SEARCH ═══
const ALL_PAIRS = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','EURGBP','EURJPY','EURCHF','EURAUD','EURNZD','EURCAD','GBPJPY','GBPCHF','GBPAUD','GBPNZD','GBPCAD','AUDJPY','AUDCHF','AUDNZD','AUDCAD','NZDJPY','NZDCHF','NZDCAD','CADJPY','CADCHF','CHFJPY','XAUUSD','GOLD','XAGUSD','SILVER','NAS100','NASDAQ','US30','DOW','US500','SP500','UK100','GER40','DAX','FRA40','JPN225','AUS200','USOIL','UKOIL','NGAS','WTI','BRENT','BTCUSD','ETHUSD','XRPUSD','BNBUSD','SOLUSD','ADAUSD','DOTUSD','DOGEUSD','AVAXUSD','LTCUSD','LINKUSD','UNIUSD','ATOMUSD','XLMUSD','TRXUSD','ETCUSD','MATICUSD','ES','NQ','YM','RTY','CL','GC','SI','ZB','ZN'];

function initPairSearch() {
  const input = document.getElementById('pair-search-input');
  const hidden = document.getElementById('pair-search-hidden');
  if (!input || !hidden) return;
  const wrap = input.parentElement; wrap.style.position='relative';
  let drop = document.getElementById('pair-dropdown');
  if (!drop) { drop=document.createElement('div'); drop.id='pair-dropdown'; drop.style.cssText='position:absolute;top:calc(100% + 2px);left:0;right:0;background:#1e1e2a;border:1.5px solid var(--gold);border-radius:8px;max-height:200px;overflow-y:auto;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.4);display:none'; wrap.appendChild(drop); }
  function show(q) {
    const f=q?ALL_PAIRS.filter(p=>p.toLowerCase().includes(q.toLowerCase())).slice(0,15):ALL_PAIRS.slice(0,15);
    if (!f.length){drop.style.display='none';return;}
    drop.innerHTML=f.map(p=>'<div class="pair-opt" data-val="'+p+'" style="padding:8px 14px;cursor:pointer;font-size:.83rem;font-weight:600;transition:background .1s">'+p+'</div>').join('');
    drop.style.display='block';
    drop.querySelectorAll('.pair-opt').forEach(el=>{
      el.addEventListener('mouseover',()=>el.style.background='var(--gold-light)');
      el.addEventListener('mouseout',()=>el.style.background='');
      el.addEventListener('mousedown',e=>{e.preventDefault();input.value=el.dataset.val;hidden.value=el.dataset.val;drop.style.display='none';hidden.classList.remove('field-error-input');const fg=hidden.closest('.fg');if(fg)fg.querySelectorAll('.field-error').forEach(el=>el.remove());});
    });
  }
  input.addEventListener('input',()=>{hidden.value='';show(input.value);});
  input.addEventListener('focus',()=>show(input.value));
  input.addEventListener('blur',()=>{setTimeout(()=>{drop.style.display='none';if(!hidden.value&&input.value)hidden.value=input.value.toUpperCase();},200);});
}

// Init pair search on open


// ═══ REGISTER ═══
document.getElementById('show-register')?.addEventListener('click', () => {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('register-view').classList.remove('hidden');
});
document.getElementById('show-login')?.addEventListener('click', () => {
  document.getElementById('register-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
});

async function submitForgot() {
  const email = document.getElementById('forgot-email').value;
  const msg = document.getElementById('forgot-msg');
  const btn = document.getElementById('forgot-btn');
  msg.classList.add('hidden');
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) { msg.textContent = 'Email invalide'; msg.classList.remove('hidden'); return; }
  btn.textContent = 'Envoi...'; btn.disabled = true;
  try {
    await api('POST', '/auth/forgot-password', { email });
    msg.style.color = '#10b981';
    msg.textContent = 'Lien envoyé ! Vérifie ta boite mail.';
    msg.classList.remove('hidden');
  } catch(ex) { msg.style.color = ''; msg.textContent = ex.message; msg.classList.remove('hidden'); }
  finally { btn.textContent = 'Envoyer le lien'; btn.disabled = false; }
}
async function submitReset() {
  const token = new URLSearchParams(window.location.search).get('reset_token');
  const password = document.getElementById('reset-password').value;
  const confirm = document.getElementById('reset-confirm').value;
  const msg = document.getElementById('reset-msg');
  const btn = document.getElementById('reset-btn');
  msg.classList.add('hidden');
  if (password !== confirm) { msg.textContent = 'Les mots de passe ne correspondent pas'; msg.classList.remove('hidden'); return; }
  if (password.length < 6) { msg.textContent = 'Mot de passe trop court (6 caractères min)'; msg.classList.remove('hidden'); return; }
  btn.textContent = 'Réinitialisation...'; btn.disabled = true;
  try {
    await api('POST', '/auth/reset-password', { token, password });
    msg.style.color = '#10b981';
    msg.textContent = 'Mot de passe réinitialisé ! Redirection...';
    msg.classList.remove('hidden');
    setTimeout(() => { window.location.href = '/'; }, 2000);
  } catch(ex) { msg.style.color = ''; msg.textContent = ex.message; msg.classList.remove('hidden'); }
  finally { btn.textContent = 'Réinitialiser'; btn.disabled = false; }
}
// Vérifier si on a un token de reset dans l'URL
if (new URLSearchParams(window.location.search).get('reset_token')) {
  document.addEventListener('DOMContentLoaded', () => lpTab('reset'));
}
document.getElementById('register-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('register-error');
  err.classList.add('hidden');
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const email = document.getElementById('reg-email').value;
  // Validation email stricte
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) { err.textContent = 'Email invalide'; err.classList.remove('hidden'); return; }
  // Validation confirmation mot de passe
  if (password !== confirm) { err.textContent = 'Les mots de passe ne correspondent pas'; err.classList.remove('hidden'); return; }
  btn.textContent = 'Création...'; btn.disabled = true;
  try {
    await api('POST', '/auth/register', {
      firstname: document.getElementById('reg-firstname').value,
      lastname: document.getElementById('reg-lastname').value,
      email: email,
      password: password
    });
    err.style.color = '#10b981';
    err.textContent = 'Compte créé ! Vérifie ton email pour confirmer ton compte.';
    err.classList.remove('hidden');
    btn.textContent = 'Email envoyé ✓'; btn.disabled = true;
  } catch(ex) {
    err.style.color = ''; err.textContent = ex.message; err.classList.remove('hidden');
  } finally { if(!btn.disabled) { btn.textContent = 'Créer mon compte'; btn.disabled = false; } }
});

// ═══ CALENDRIER ÉCONOMIQUE ═══
let ecoImpactFilter = 'all';
function setEcoFilter(f) {
  ecoImpactFilter = f;
  document.querySelectorAll('.eco-filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('ef-' + f);
  if (btn) btn.classList.add('active');
  loadEcoCalendar();
}
async function loadEcoCalendar() {
  const container = document.getElementById('eco-cal-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Chargement...</div>';
  try {
    const today = new Date();
    const td = today.toISOString().split("T")[0];
    const from = new Date(today.getTime() + ecoWeekOffset*7*24*60*60*1000).toISOString().split('T')[0];
    const to = new Date(today.getTime() + (ecoWeekOffset+1)*7*24*60*60*1000).toISOString().split('T')[0];
    const label = ecoWeekOffset === 0 ? 'Cette semaine' : ecoWeekOffset === 1 ? 'Semaine prochaine' : ecoWeekOffset === -1 ? 'Semaine dernière' : (ecoWeekOffset > 0 ? '+'+ecoWeekOffset+' semaines' : ecoWeekOffset+' semaines');
    const labelEl = document.getElementById('eco-week-label');
    if (labelEl) labelEl.textContent = label;
    const weekParam = ecoWeekOffset >= 1 ? 'next' : 'this';
    const res = await fetch('/api/eco-calendar?week=' + weekParam);
    const raw = await res.json();
    // Garder tous les impacts mais filtrer les pays pertinents pour traders
    const TRADER_COUNTRIES = ['USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF','CNY','ALL','US','EU','GB','JP','CA','AU','NZ','CH','CN','DE','FR'];
    const data = raw.filter(e => {
      const c = (e.country||'').toUpperCase();
      const imp = (e.impact||'').toLowerCase();
      // Garder si pays trader OU impact high
      const d=(e.time||"").substring(0,10);
      const impactOk = ecoImpactFilter === 'all' || (e.impact||'').toLowerCase() === ecoImpactFilter;
      return d.length===10 && d>=td && TRADER_COUNTRIES.includes(c) && impactOk;
    });

    const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const FLAGS = {USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CAD:'🇨🇦',AUD:'🇦🇺',NZD:'🇳🇿',CHF:'🇨🇭',CNY:'🇨🇳',US:'🇺🇸',EU:'🇪🇺',GB:'🇬🇧',JP:'🇯🇵',CA:'🇨🇦',AU:'🇦🇺',NZ:'🇳🇿',CH:'🇨🇭',CN:'🇨🇳',DE:'🇩🇪',FR:'🇫🇷',IT:'🇮🇹',ES:'🇪🇸',KR:'🇰🇷',IN:'🇮🇳',BR:'🇧🇷',MX:'🇲🇽',RU:'🇷🇺',ZA:'🇿🇦',SG:'🇸🇬',HK:'🇭🇰',SE:'🇸🇪',NO:'🇳🇴',DK:'🇩🇰',PL:'🇵🇱',CZ:'🇨🇿',HU:'🇭🇺',TR:'🇹🇷',ID:'🇮🇩',TH:'🇹🇭',MY:'🇲🇾',PH:'🇵🇭',VN:'🇻🇳',SA:'🇸🇦',AE:'🇦🇪',EG:'🇪🇬',NG:'🇳🇬',AR:'🇦🇷',CL:'🇨🇱',CO:'🇨🇴',PT:'🇵🇹',GR:'🇬🇷',AT:'🇦🇹',BE:'🇧🇪',NL:'🇳🇱',FI:'🇫🇮',IE:'🇮🇪',IL:'🇮🇱',BD:'🇧🇩',LT:'🇱🇹',LV:'🇱🇻',EE:'🇪🇪',RO:'🇷🇴',HR:'🇭🇷',BG:'🇧🇬',SK:'🇸🇰',SI:'🇸🇮',IS:'🇮🇸',AO:'🇦🇴',MN:'🇲🇳',SC:'🇸🇨',LK:'🇱🇰',PK:'🇵🇰',UA:'🇺🇦',RS:'🇷🇸',BA:'🇧🇦',MK:'🇲🇰',AL:'🇦🇱',GE:'🇬🇪',AM:'🇦🇲',AZ:'🇦🇿',KZ:'🇰🇿',UZ:'🇺🇿',BY:'🇧🇾',MD:'🇲🇩',KE:'🇰🇪',GH:'🇬🇭',TZ:'🇹🇿',ET:'🇪🇹',CI:'🇨🇮',SN:'🇸🇳',MA:'🇲🇦',TN:'🇹🇳',DZ:'🇩🇿',LY:'🇱🇾',SD:'🇸🇩',IQ:'🇮🇶',IR:'🇮🇷',KW:'🇰🇼',QA:'🇶🇦',BH:'🇧🇭',OM:'🇴🇲',JO:'🇯🇴',LB:'🇱🇧',SY:'🇸🇾',YE:'🇾🇪',UY:'🇺🇾',PY:'🇵🇾',BO:'🇧🇴',PE:'🇵🇪',EC:'🇪🇨',VE:'🇻🇪',CR:'🇨🇷',PA:'🇵🇦',GT:'🇬🇹',HN:'🇭🇳',SV:'🇸🇻',NI:'🇳🇮',DO:'🇩🇴',CU:'🇨🇺',TT:'🇹🇹',JM:'🇯🇲',BB:'🇧🇧',BS:'🇧🇸',HT:'🇭🇹',LU:'🇱🇺',MT:'🇲🇹',CY:'🇨🇾',LI:'🇱🇮',AD:'🇦🇩',MC:'🇲🇨',SM:'🇸🇲',VA:'🇻🇦',MZ:'🇲🇿',UG:'🇺🇬',TW:'🇹🇼',CG:'🇨🇬',RW:'🇷🇼',XK:'🇽🇰',NA:'🇳🇦',ME:'🇲🇪',BW:'🇧🇼',PS:'🇵🇸'};
    const grouped = {};
    data.forEach(e => {
      const d = (e.time||e.date||'').substring(0,10);
      if (d.length < 10) return;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(e);
    });
    const todayParts = td.split('-');
    const fDay = new Date(parseInt(todayParts[0]), parseInt(todayParts[1])-1, parseInt(todayParts[2]));
    let lDay = new Date(fDay);
    const fDow = fDay.getDay();
    lDay.setDate(fDay.getDate() + (fDow === 0 ? 0 : (7 - fDow)));
    for (let dd = new Date(fDay); dd <= lDay; dd.setDate(dd.getDate()+1)) {
      const key = dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
      if (!grouped[key]) grouped[key] = [];
    }
    const sortedDates = Object.keys(grouped).sort();
    const tableRows = sortedDates.map(date => {
      const p = date.split('-');
      const d = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
      const isToday = date === from;
      const label = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      const dayHeader = '<tr><td colspan="7" style="padding:0;height:20px;background:transparent"></td></tr><tr><td colspan="7" style="padding:12px 16px;font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:' + (isToday?'var(--gold)':'#2a2a3a') + ';color:' + (isToday?'#000':'#fff') + ';border-radius:8px 8px 0 0">' + label + (isToday?' — Aujourd\'hui':'') + '</td></tr>';
      if (!grouped[date].length) {
        return dayHeader + '<tr><td colspan="7" style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:.85rem;font-style:italic">Aucun événement prévu</td></tr>';
      }
      return dayHeader + grouped[date].map((e,i) => {
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
            + '<td style="padding:10px;font-size:.78rem;font-weight:600;color:var(--text-muted)">' + (e.time ? new Date(e.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}) : '—') + '</td>'
            + '<td style="padding:10px"><span style="font-size:.72rem;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg-subtle);border:1px solid var(--border)">' + flag + ' ' + country + '</span></td>'
            + '<td style="padding:10px;text-align:center"><span style="font-size:.75rem;font-weight:700">' + stars + '</span></td>'
            + '<td style="padding:10px;font-size:.83rem">' + (e.event||'—') + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;font-weight:700;color:' + ac + '">' + actual + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;color:var(--text-muted)">' + forecast + '</td>'
            + '<td style="padding:10px;text-align:right;font-size:.82rem;color:var(--text-muted)">' + prev + '</td>'
            + '</tr>';
        }).join('');
    }).join('');
    container.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:.65rem;font-weight:700;text-transform:uppercase;color:var(--text-light);position:sticky;top:0;background:var(--bg-card)">'
      + '<th style="text-align:left;padding:6px 10px">Heure</th><th style="text-align:left;padding:6px 10px">Dev.</th><th style="padding:6px 10px">Impact</th><th style="text-align:left;padding:6px 10px">Événement</th><th style="text-align:right;padding:6px 10px">Actuel</th><th style="text-align:right;padding:6px 10px">Prévu</th><th style="text-align:right;padding:6px 10px">Préc.</th>'
      + '</tr></thead><tbody>' + tableRows + '</tbody></table>';
  } catch(ex) { container.innerHTML = '<div class="empty"><p>Erreur de chargement.</p></div>'; console.error(ex); }
}

// ═══ CALENDRIER SEMAINE DASHBOARD ═══
function renderWeekCal(trades) {
  const el = document.getElementById('dash-week-cal');
  if (!el) return;
  const DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  
  // Trouver le lundi de la semaine courante
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  
  // Générer les 7 jours
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    week.push(d);
  }
  
  // Regrouper trades par date
  const byDate = {};
  (trades||[]).forEach(t => {
    if (!byDate[t.trade_date]) byDate[t.trade_date] = { pnl: 0, count: 0 };
    byDate[t.trade_date].pnl += parseFloat(t.pnl) || 0;
    byDate[t.trade_date].count++;
  });
  
  const todayStr = today.toISOString().split('T')[0];
  
  el.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow-sm)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    + '<div style="font-size:.68rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text-muted)">Semaine du ' + monday.getDate() + ' ' + MONTHS[monday.getMonth()] + '</div>'
    + '</div>'
    + '<div class="dash-week-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">'
    + week.map(d => {
      const ds = d.toISOString().split('T')[0];
      const data = byDate[ds];
      const isToday = ds === todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const pnl = data ? data.pnl : 0;
      const count = data ? data.count : 0;
      const pnlColor = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--text-muted)';
      const pnlStr = pnl > 0 ? '+$' + pnl.toFixed(0) : pnl < 0 ? '-$' + Math.abs(pnl).toFixed(0) : '$0';
      const bg = isToday ? 'var(--gold-light)' : isWeekend ? 'var(--bg-subtle)' : 'var(--bg-card)';
      const border = isToday ? 'var(--gold)' : 'var(--border)';
      return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:10px;padding:12px 10px;text-align:center">'
        + '<div style="font-size:.7rem;font-weight:600;color:var(--text-muted);margin-bottom:4px">' + DAYS[d.getDay()] + '</div>'
        + '<div style="font-size:1.1rem;font-weight:700;font-family:DM Sans,sans-serif;color:' + (isToday?'var(--gold-dark)':'var(--text)') + ';margin-bottom:8px">' + d.getDate() + '</div>'
        + '<div style="font-size:.8rem;font-weight:700;color:' + pnlColor + ';margin-bottom:3px">' + pnlStr + '</div>'
        + '<div style="font-size:.68rem;color:var(--text-muted)">' + count + ' trade' + (count>1?'s':'') + '</div>'
        + '</div>';
    }).join('')
    + '</div></div>';
}

// ═══ WINNERS & LOSERS ═══
function renderWinnersLosers(trades) {
  const el = document.getElementById('winners-losers');
  if (!el) return;
  const wins = trades.filter(t => t.result === 'WIN');
  const losses = trades.filter(t => t.result === 'LOSS');
  const bestRR = wins.length ? Math.max(...wins.map(t => parseFloat(t.rr)||0)) : 0;
  const avgWinRR = wins.length ? (wins.reduce((a,t) => a+(parseFloat(t.rr)||0),0)/wins.length).toFixed(2) : 0;
  const worstRR = losses.length ? Math.min(...losses.map(t => parseFloat(t.rr)||0)) : 0;
  const avgLossRR = losses.length ? (losses.reduce((a,t) => a+(parseFloat(t.rr)||0),0)/losses.length).toFixed(2) : 0;
  const maxWinStreak = (() => { let max=0,cur=0; trades.forEach(t=>{if(t.result==='WIN'){cur++;max=Math.max(max,cur);}else cur=0;}); return max; })();
  const maxLossStreak = (() => { let max=0,cur=0; trades.forEach(t=>{if(t.result==='LOSS'){cur++;max=Math.max(max,cur);}else cur=0;}); return max; })();
  const avgWinStreak = wins.length && maxWinStreak ? (wins.length/Math.max(1,maxWinStreak)).toFixed(1) : 0;
  const avgLossStreak = losses.length && maxLossStreak ? (losses.length/Math.max(1,maxLossStreak)).toFixed(1) : 0;

  const row = (label, val) => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)"><span style="font-size:.83rem;color:rgba(255,255,255,0.65)">'+label+'</span><span style="font-size:.9rem;font-weight:700;color:#fff">'+val+'</span></div>';

  el.innerHTML =
    '<div style="background:#0f1923;border:1.5px solid var(--green);border-radius:14px;padding:24px">' +
      '<div style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:16px">Gagnants</div>' +
      row('Total opérations gagnantes', wins.length) +
      row('Meilleur RR', '+'+bestRR+'R') +
      row('RR moyen', '+'+avgWinRR+'R') +
      row('Gains consécutifs max.', maxWinStreak) +
      row('Gains consécutifs moyens', avgWinStreak) +
    '</div>' +
    '<div style="background:#0f1923;border:1.5px solid var(--red);border-radius:14px;padding:24px">' +
      '<div style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:16px">Perdants</div>' +
      row('Total opérations perdantes', losses.length) +
      row('Pire RR', worstRR+'R') +
      row('RR moyen', avgLossRR+'R') +
      row('Pertes consécutives max.', maxLossStreak) +
      row('Pertes consécutives moyennes', avgLossStreak) +
    '</div>';
}

function renderPerfBlocks(trades) {
  const el = document.getElementById('perf-blocks');
  if (!el) return;
  if (!trades.length) { el.innerHTML = ''; return; }

  function makeBlock(title, trades2, groupFn, fixedKeys, colors) {
    const groups = {};
    trades2.forEach(function(t) {
      const k = groupFn(t);
      if (!groups[k]) groups[k] = { total:0, wins:0 };
      groups[k].total++;
      if (t.result === 'WIN') groups[k].wins++;
    });
    const keys = fixedKeys || Object.keys(groups).filter(function(k){ return groups[k].total > 0; }).sort();
    const cm = {};
    keys.forEach(function(k,i){ cm[k] = colors[i % colors.length]; });
    const totals = keys.map(function(k){ return (groups[k]||{total:0}).total; });
    const wrs = keys.map(function(k){
      const g = groups[k];
      if (!g || !g.total) return 0;
      return parseFloat((g.wins/g.total*100).toFixed(1));
    });
    return { title:title, keys:keys, cm:cm, totals:totals, wrs:wrs };
  }

  const blocks = [
    makeBlock('Performances par type d operation', trades, function(t){ return t.direction === 'LONG' ? 'Long' : 'Short'; }, ['Long','Short'], ['#22c55e','#3b82f6']),
    makeBlock('Performances par session', trades, function(t){ return t.session || 'Autre'; }, null, ['#f59e0b','#8b5cf6','#06b6d4','#ec4899','#10b981']),
    makeBlock('Performances par setup', trades, function(t){ return (t.setup||'').trim() || 'Autre'; }, null, ['#f59e0b','#3b82f6','#22c55e','#ec4899','#8b5cf6'])
  ];

  let html2 = '';
  blocks.forEach(function(b, bi) {
    const legend = b.keys.map(function(k){
      return '<span style="display:flex;align-items:center;gap:5px;font-size:.75rem;color:var(--text-muted)"><span style="width:8px;height:8px;border-radius:50%;background:'+b.cm[k]+';display:inline-block"></span>'+k+'</span>';
    }).join('');
    html2 += '<div style="margin-bottom:20px">';
    html2 += '<div style="font-size:.8rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">'+b.title+'</div>';
    html2 += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    html2 += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px">';
    html2 += '<div style="font-size:.83rem;font-weight:600;color:var(--text);margin-bottom:8px">Total des opérations</div>';
    html2 += '<div style="display:flex;justify-content:center;gap:12px;margin-bottom:12px">'+legend+'</div>';
    html2 += '<div style="height:180px;position:relative"><canvas id="pc-total-'+bi+'"></canvas></div>';
    html2 += '</div>';
    html2 += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px">';
    html2 += '<div style="font-size:.83rem;font-weight:600;color:var(--text);margin-bottom:8px">Taux de gain</div>';
    html2 += '<div style="display:flex;justify-content:center;gap:12px;margin-bottom:12px">'+legend+'</div>';
    html2 += '<div style="height:180px;position:relative"><canvas id="pc-wr-'+bi+'"></canvas></div>';
    html2 += '</div>';
    html2 += '</div></div>';
  });
  el.innerHTML = html2;

  blocks.forEach(function(b, bi) {
    const cT = document.getElementById('pc-total-'+bi);
    const exT = Chart.getChart(cT); if (exT) exT.destroy();
    new Chart(cT, {
      type: 'doughnut',
      data: { labels: b.keys, datasets: [{ data: b.totals, backgroundColor: b.keys.map(function(k){ return b.cm[k]; }), borderWidth: 3, borderColor: 'var(--bg-card)' }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ return c.label+': '+c.parsed; } } } } }
    });

    const cW = document.getElementById('pc-wr-'+bi);
    const exW = Chart.getChart(cW); if (exW) exW.destroy();
    const wrDatasets = b.keys.map(function(k, i) {
      const ring = b.wrs[i];
      return {
        label: k,
        data: [ring, 100 - ring],
        backgroundColor: [b.cm[k], 'rgba(0,0,0,0.08)'],
        borderColor: 'transparent',
        borderWidth: 0,
        weight: 1
      };
    });
    new Chart(cW, {
      type: 'doughnut',
      data: { datasets: wrDatasets },
      options: { responsive:true, maintainAspectRatio:false, cutout:'35%', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ if(c.dataIndex===0) return c.dataset.label+': '+c.dataset.data[0]+'%'; return ''; } } } } }
    });
  });
}

// ── SETUP SUGGESTIONS ─────────────────────────
function getSetupsKey(){return 'et_setups_'+(user&&user.id?user.id:'default');}
function getSetups(){try{return JSON.parse(localStorage.getItem(getSetupsKey())||'[]');}catch(e){return[];}}
function saveSetupTag(s){if(!s.trim())return;const arr=getSetups();if(!arr.includes(s.trim())){arr.push(s.trim());localStorage.setItem(getSetupsKey(),JSON.stringify(arr));}}
function delSetupTag(s){localStorage.setItem(getSetupsKey(),JSON.stringify(getSetups().filter(x=>x!==s)));renderSetupSuggestions();}
function renderSetupSuggestions(){
  const input=document.getElementById('setup-input');
  if(input){input.addEventListener('input',()=>{input.classList.remove('field-error-input');const fg=input.closest('.fg');if(fg)fg.querySelectorAll('.field-error').forEach(e=>e.remove());});}
  const box=document.getElementById('setup-suggestions');
  if(!input||!box)return;
  const val=input.value.toLowerCase();
  const arr=getSetups().filter(s=>!val||s.toLowerCase().includes(val));
  if(!arr.length){box.style.display='none';return;}
  box.innerHTML=arr.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--text-2)" onmousedown="event.preventDefault();const si=document.getElementById('setup-input');si.value='${s}';si.classList.remove('field-error-input');const fg=si.closest('.fg');if(fg)fg.querySelectorAll('.field-error').forEach(e=>e.remove());document.getElementById('setup-suggestions').style.display='none'" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
    <span>${s}</span>
    <button onmousedown="event.stopPropagation();event.preventDefault();delSetupTag('${s}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem;padding:2px 4px"><i class="ti ti-x"></i></button>
  </div>`).join('');
  box.style.display='block';
}
document.addEventListener('click',e=>{
  if(!e.target.closest('#setup-input')&&!e.target.closest('#setup-suggestions'))
    {const b=document.getElementById('setup-suggestions');if(b)b.style.display='none';}
});
document.addEventListener('click', function setupInit(e){
  const input=document.getElementById('setup-input');
  if(!input) return;
  document.removeEventListener('click', setupInit);
  input.addEventListener('focus',()=>renderSetupSuggestions());
  input.addEventListener('input',()=>renderSetupSuggestions());
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===','){
      const v=input.value.trim().replace(/,$/,'');
      if(v){saveSetupTag(v);input.value=v;}
      document.getElementById('setup-suggestions').style.display='none';
    }
  });
});
// Réinit à chaque ouverture du modal trade
document.addEventListener('click', e=>{
  if(e.target.closest('[onclick*="trade-modal"]')||e.target.id==='new-trade-btn'||e.target.closest('#new-trade-btn')){
    setTimeout(()=>{
      const input=document.getElementById('setup-input');
      if(input){
        input.addEventListener('focus',()=>renderSetupSuggestions());
        input.addEventListener('input',()=>renderSetupSuggestions());
      }
    },100);
  }
});

// ── SETUP SUGGESTIONS EDIT FORM ───────────────
(function(){
  function initEditSetup(){
    const input = document.getElementById('e-setup');
    const box = document.getElementById('e-setup-suggestions');
    if(!input||!box) return;
    function render(){
      const val = input.value.toLowerCase();
      const arr = getSetups().filter(s=>!val||s.toLowerCase().includes(val));
      if(!arr.length){box.style.display='none';return;}
      box.innerHTML = arr.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;font-size:.82rem;color:var(--text-2)" onmousedown="event.preventDefault();document.getElementById('e-setup').value='${s}';document.getElementById('e-setup-suggestions').style.display='none'" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
        <span>${s}</span>
        <button onmousedown="event.stopPropagation();event.preventDefault();delSetupTag('${s}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.8rem;padding:2px 4px"><i class="ti ti-x"></i></button>
      </div>`).join('');
      box.style.display='block';
    }
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', e=>{
      if(e.key==='Escape') box.style.display='none';
    });
    document.addEventListener('click', e=>{
      if(!e.target.closest('#e-setup')&&!e.target.closest('#e-setup-suggestions')) box.style.display='none';
    });
  }
  // Init quand le modal edit s'ouvre
  const observer = new MutationObserver(()=>{ if(!document.getElementById('edit-modal')?.classList.contains('hidden')) initEditSetup(); });
  document.addEventListener('DOMContentLoaded',()=>{
    const m = document.getElementById('edit-modal');
    if(m) observer.observe(m, {attributes:true, attributeFilter:['class']});
    initEditSetup();
  });
})();
