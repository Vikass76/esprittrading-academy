/* ── UTILITAIRES ── */
const $ = id => document.getElementById(id);
const api = async (method, path, body, isForm = false) => {
  const opts = { method, headers: {} };
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
};

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}

function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?\s]+)/);
  return m ? m[1] : null;
}

/* ── ÉTAT ── */
let currentRole = '';
let allTrades = [];

/* ── INITIALISATION ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const me = await api('GET', '/auth/me');
    showApp(me);
  } catch {
    showLogin();
  }
});

function showLogin() {
  $('login-page').classList.remove('hidden');
  $('app').classList.add('hidden');
}

function showApp(me) {
  currentRole = me.role;
  $('login-page').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('nav-username').textContent = me.username;

  if (me.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  switchTab('formation');
  loadFormation();
}

/* ── LOGIN ── */
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn');
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  btn.textContent = 'Connexion…';
  btn.disabled = true;

  try {
    const data = await api('POST', '/auth/login', {
      username: $('username').value,
      password: $('password').value
    });
    showApp(data);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Se connecter';
    btn.disabled = false;
  }
});

/* ── LOGOUT ── */
$('logout-btn').addEventListener('click', async () => {
  await api('POST', '/auth/logout');
  currentRole = '';
  allTrades = [];
  $('login-form').reset();
  showLogin();
});

/* ── TABS ── */
document.querySelectorAll('.nav-link[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
    if (tab === 'journal') loadTrades();
    if (tab === 'admin') loadAdminData();
  });
});

function switchTab(tab) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link[data-tab]').forEach(b => b.classList.remove('active'));
  $(`tab-${tab}`).classList.remove('hidden');
  document.querySelector(`.nav-link[data-tab="${tab}"]`).classList.add('active');
}

/* ── FORMATION ── */
async function loadFormation() {
  try {
    const modules = await api('GET', '/videos');
    renderModules(modules);
  } catch { toast('Erreur lors du chargement des modules', 'error'); }
}

function renderModules(modules) {
  const container = $('modules-container');
  if (!modules.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><p>Aucun module disponible pour l'instant.</p></div>`;
    return;
  }
  container.innerHTML = modules.map((m, i) => `
    <div class="module-card${i === 0 ? ' open' : ''}" data-id="${m.id}">
      <div class="module-header">
        <div class="module-title">
          <span>${m.title}</span>
          <span class="module-badge">${m.videos.length} vidéo${m.videos.length !== 1 ? 's' : ''}</span>
        </div>
        <span class="module-chevron">▾</span>
      </div>
      <div class="video-list">
        ${m.videos.length ? m.videos.map(v => {
          const ytId = getYouTubeId(v.url);
          const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
          return `
            <a class="video-item" href="${v.url}" target="_blank" rel="noopener">
              <div class="video-icon" style="${thumb ? `background:url(${thumb}) center/cover; border-radius:10px;` : ''}">
                ${thumb ? '' : '▶'}
              </div>
              <div class="video-info">
                <div class="title">${v.title}</div>
                ${v.description ? `<div class="desc">${v.description}</div>` : ''}
              </div>
              <span style="color:var(--text-muted); font-size:0.85rem;">↗</span>
            </a>`;
        }).join('') : `<div class="empty-state" style="padding:24px;"><p>Aucune vidéo dans ce module.</p></div>`}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.module-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.module-card').classList.toggle('open'));
  });
}

/* ── JOURNAL ── */
async function loadTrades() {
  try {
    const params = new URLSearchParams();
    const pair = $('filter-pair').value;
    const result = $('filter-result').value;
    const from = $('filter-from').value;
    const to = $('filter-to').value;
    if (pair) params.set('pair', pair);
    if (result) params.set('result', result);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    allTrades = await api('GET', '/trades?' + params);
    renderTrades(allTrades);
    updateStats(allTrades);
  } catch { toast('Erreur lors du chargement des trades', 'error'); }
}

function renderTrades(trades) {
  const tbody = $('trades-body');
  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📊</div><p>Aucun trade enregistré.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = trades.map(t => `
    <tr data-id="${t.id}">
      <td>${formatDate(t.trade_date)}</td>
      <td><strong>${t.pair}</strong></td>
      <td><span class="badge-${t.result.toLowerCase()}">${t.result === 'WIN' ? '✅' : '❌'} ${t.result}</span></td>
      <td class="${t.rr.startsWith('-') ? 'rr-negative' : 'rr-positive'}">${t.rr}</td>
      <td>
        ${t.screenshot
          ? `<img class="trade-screenshot" src="${t.screenshot}" alt="screenshot" />`
          : '<span class="text-muted" style="font-size:0.82rem;">—</span>'}
      </td>
      <td style="max-width:200px; font-size:0.85rem; color:var(--text-muted);">${t.notes || '—'}</td>
      <td>
        <button class="btn btn-danger btn-sm delete-trade" data-id="${t.id}">✕</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.trade-screenshot').forEach(img => {
    img.addEventListener('click', () => {
      $('img-modal-src').src = img.src;
      $('img-modal').classList.remove('hidden');
    });
  });

  tbody.querySelectorAll('.delete-trade').forEach(btn => {
    btn.addEventListener('click', () => deleteTrade(btn.dataset.id));
  });
}

function updateStats(trades) {
  const total = trades.length;
  const wins = trades.filter(t => t.result === 'WIN').length;
  const totalRR = trades.reduce((sum, t) => {
    const n = parseFloat(t.rr.replace('R', '').replace('+', ''));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const best = trades.reduce((b, t) => {
    const n = parseFloat(t.rr.replace('R', '').replace('+', ''));
    return (!isNaN(n) && n > b) ? n : b;
  }, -Infinity);

  $('stat-total').textContent = total;
  $('stat-winrate').textContent = total ? `${Math.round(wins / total * 100)}%` : '—';
  $('stat-rr').textContent = total ? `${totalRR > 0 ? '+' : ''}${totalRR.toFixed(1)}R` : '0R';
  $('stat-best').textContent = total && best > -Infinity ? `+${best}R` : '—';
}

async function deleteTrade(id) {
  if (!confirm('Supprimer ce trade ?')) return;
  try {
    await api('DELETE', `/trades/${id}`);
    toast('Trade supprimé', 'success');
    loadTrades();
  } catch (err) { toast(err.message, 'error'); }
}

// Filtres
['filter-pair', 'filter-result', 'filter-from', 'filter-to'].forEach(id => {
  $(id).addEventListener('change', loadTrades);
});
$('filter-reset').addEventListener('click', () => {
  $('filter-pair').value = '';
  $('filter-result').value = '';
  $('filter-from').value = '';
  $('filter-to').value = '';
  loadTrades();
});

/* ── MODAL TRADE ── */
$('add-trade-btn').addEventListener('click', () => {
  $('trade-form').reset();
  // Pré-remplir la date d'aujourd'hui
  $('trade-form').querySelector('[name="trade_date"]').value = new Date().toISOString().split('T')[0];
  $('trade-modal').classList.remove('hidden');
});
$('trade-modal-close').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('trade-cancel').addEventListener('click', () => $('trade-modal').classList.add('hidden'));
$('trade-modal').addEventListener('click', e => { if (e.target === $('trade-modal')) $('trade-modal').classList.add('hidden'); });

$('trade-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData($('trade-form'));
  try {
    await api('POST', '/trades', form, true);
    $('trade-modal').classList.add('hidden');
    toast('Trade enregistré !', 'success');
    loadTrades();
  } catch (err) { toast(err.message, 'error'); }
});

/* ── MODAL MDP ── */
$('change-pwd-btn').addEventListener('click', () => {
  $('pwd-form').reset();
  $('pwd-modal').classList.remove('hidden');
});
$('pwd-modal-close').addEventListener('click', () => $('pwd-modal').classList.add('hidden'));
$('pwd-cancel').addEventListener('click', () => $('pwd-modal').classList.add('hidden'));

$('pwd-form').addEventListener('submit', async e => {
  e.preventDefault();
  const newPwd = $('pwd-new').value;
  const confirm = $('pwd-confirm').value;
  if (newPwd !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return; }
  try {
    await api('POST', '/auth/change-password', {
      currentPassword: $('pwd-current').value,
      newPassword: newPwd
    });
    $('pwd-modal').classList.add('hidden');
    toast('Mot de passe mis à jour !', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

/* ── MODAL IMAGE ── */
$('img-modal').addEventListener('click', () => $('img-modal').classList.add('hidden'));

/* ── ADMIN ── */
async function loadAdminData() {
  await Promise.all([loadAdminUsers(), loadAdminModules()]);
}

async function loadAdminUsers() {
  try {
    const users = await api('GET', '/admin/users');
    const el = $('users-list');
    if (!users.length) {
      el.innerHTML = `<p class="text-muted" style="font-size:0.88rem;">Aucun élève.</p>`;
      return;
    }
    el.innerHTML = users.map(u => `
      <div class="user-row">
        <div class="user-info">
          <div class="name">${u.username}</div>
          <div class="date">Créé le ${formatDate(u.created_at?.split('T')[0])}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm reset-pwd" data-id="${u.id}" data-name="${u.username}">Réinit.</button>
          <button class="btn btn-danger btn-sm delete-user" data-id="${u.id}">✕</button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Supprimer l'élève ${btn.closest('.user-row').querySelector('.name').textContent} ?`)) return;
        try {
          await api('DELETE', `/admin/users/${btn.dataset.id}`);
          toast('Élève supprimé', 'success');
          loadAdminUsers();
        } catch (err) { toast(err.message, 'error'); }
      });
    });

    el.querySelectorAll('.reset-pwd').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pwd = prompt(`Nouveau mot de passe pour ${btn.dataset.name} :`);
        if (!pwd) return;
        try {
          await api('PATCH', `/admin/users/${btn.dataset.id}/password`, { password: pwd });
          toast('Mot de passe réinitialisé', 'success');
        } catch (err) { toast(err.message, 'error'); }
      });
    });

  } catch { toast('Erreur chargement élèves', 'error'); }
}

$('create-user-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/admin/users', {
      username: $('new-username').value,
      password: $('new-password').value
    });
    $('create-user-form').reset();
    toast('Élève créé !', 'success');
    loadAdminUsers();
  } catch (err) { toast(err.message, 'error'); }
});

async function loadAdminModules() {
  try {
    const modules = await api('GET', '/admin/modules');
    const el = $('modules-admin-list');
    const sel = $('video-module-id');

    // Liste modules admin
    el.innerHTML = modules.length
      ? modules.map(m => `
          <div class="user-row">
            <span style="font-weight:500;">${m.title}</span>
            <button class="btn btn-danger btn-sm delete-module" data-id="${m.id}">✕</button>
          </div>`).join('')
      : `<p class="text-muted" style="font-size:0.88rem;">Aucun module.</p>`;

    el.querySelectorAll('.delete-module').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Supprimer ce module et toutes ses vidéos ?')) return;
        try {
          await api('DELETE', `/admin/modules/${btn.dataset.id}`);
          toast('Module supprimé', 'success');
          loadAdminModules();
        } catch (err) { toast(err.message, 'error'); }
      });
    });

    // Select pour ajout de vidéo
    sel.innerHTML = modules.length
      ? modules.map(m => `<option value="${m.id}">${m.title}</option>`).join('')
      : `<option value="">Créez d'abord un module</option>`;

  } catch { toast('Erreur chargement modules', 'error'); }
}

$('create-module-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/admin/modules', { title: $('new-module-title').value });
    $('create-module-form').reset();
    toast('Module créé !', 'success');
    loadAdminModules();
  } catch (err) { toast(err.message, 'error'); }
});

$('add-video-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/admin/videos', {
      module_id: $('video-module-id').value,
      title: $('video-title').value,
      url: $('video-url').value,
      description: $('video-desc').value
    });
    $('add-video-form').reset();
    toast('Vidéo ajoutée !', 'success');
    loadAdminModules();
    loadFormation();
  } catch (err) { toast(err.message, 'error'); }
});
