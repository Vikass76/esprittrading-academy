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
const videoCache = new Map(); // id → video object

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

function isLocalVideo(url) {
  return url && url.startsWith('/uploads/');
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
          const thumb = v.cover || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
          const thumbHtml = thumb
            ? `<div class="video-icon" style="background:url(${thumb}) center/cover; border-radius:10px;"></div>`
            : `<div class="video-icon" style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:10px;">▶</div>`;

          if (isLocalVideo(v.url)) {
            return `
              <div class="video-item local-video" data-src="${v.url}" data-title="${v.title}" style="cursor:pointer;">
                ${thumbHtml}
                <div class="video-info">
                  <div class="title">${v.title}</div>
                  ${v.description ? `<div class="desc">${v.description}</div>` : ''}
                </div>
                <span style="color:var(--text-muted); font-size:0.85rem;">▶</span>
              </div>`;
          }
          return `
            <a class="video-item" href="${v.url}" target="_blank" rel="noopener">
              ${thumbHtml}
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

  container.querySelectorAll('.local-video').forEach(el => {
    el.addEventListener('click', () => openVideoModal(el.dataset.src, el.dataset.title));
  });
}

function openVideoModal(src, title) {
  const player = $('video-modal-player');
  player.src = src;
  $('video-modal-title').textContent = title;
  $('video-modal').classList.remove('hidden');
  player.play().catch(() => {});
}

$('video-modal-close').addEventListener('click', () => {
  $('video-modal-player').pause();
  $('video-modal-player').src = '';
  $('video-modal').classList.add('hidden');
});
$('video-modal').addEventListener('click', e => {
  if (e.target === $('video-modal')) {
    $('video-modal-player').pause();
    $('video-modal-player').src = '';
    $('video-modal').classList.add('hidden');
  }
});

/* ── JOURNAL ── */
function parseRR(rr) {
  return parseFloat(String(rr).replace('R','').replace('+','').replace(',','.')) || 0;
}

async function loadTrades() {
  try {
    const params = new URLSearchParams();
    const pair   = $('filter-pair').value;
    const result = $('filter-result').value;
    const from   = $('filter-from').value;
    const to     = $('filter-to').value;
    if (pair)   params.set('pair', pair);
    if (result) params.set('result', result);
    if (from)   params.set('from', from);
    if (to)     params.set('to', to);

    allTrades = await api('GET', '/trades?' + params);
    renderTrades(allTrades);
    updateStats(allTrades);
    renderRRChart(allTrades);
  } catch { toast('Erreur lors du chargement des trades', 'error'); }
}

function rrChip(rr) {
  const n = parseRR(rr);
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : 'neu';
  const label = n > 0 ? `+${rr}` : rr;
  return `<span class="rr-chip ${cls}">${label}</span>`;
}

function resultBadge(result) {
  return result === 'WIN'
    ? `<span class="badge-win">✅ WIN</span>`
    : `<span class="badge-loss">❌ LOSS</span>`;
}

function renderTrades(trades) {
  const tbody = $('trades-body');
  const countEl = $('trades-count');
  countEl.textContent = trades.length ? `${trades.length} trade${trades.length > 1 ? 's' : ''}` : '';

  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📊</div><p>Aucun trade enregistré.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = trades.map(t => `
    <tr class="trade-row" data-id="${t.id}">
      <td class="trade-date-cell">${formatDate(t.trade_date)}</td>
      <td><span class="trade-pair-chip">${t.pair}</span></td>
      <td>${resultBadge(t.result)}</td>
      <td>${rrChip(t.rr)}</td>
      <td>
        ${t.screenshot
          ? `<img class="trade-screenshot-thumb" src="${t.screenshot}" alt="screenshot" />`
          : `<div class="no-screenshot">—</div>`}
      </td>
      <td class="trade-notes-cell">${t.notes || '<span style="color:var(--border);">—</span>'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.trade-row').forEach(row => {
    row.addEventListener('click', () => {
      const t = allTrades.find(x => String(x.id) === row.dataset.id);
      if (t) openTradeDetail(t);
    });
  });
}

function updateStats(trades) {
  const total = trades.length;
  const wins  = trades.filter(t => t.result === 'WIN').length;
  const losses = total - wins;
  const totalRR = trades.reduce((s, t) => s + parseRR(t.rr), 0);
  const best = trades.reduce((b, t) => { const n = parseRR(t.rr); return n > b ? n : b; }, -Infinity);
  const winRate = total ? Math.round(wins / total * 100) : null;

  $('stat-total').textContent = total || '—';
  $('stat-wl').textContent = total ? `${wins}W · ${losses}L` : 'Aucun trade';

  $('stat-winrate').textContent = winRate !== null ? `${winRate}%` : '—';
  $('stat-wr-sub').textContent = total ? `${wins} victoire${wins > 1 ? 's' : ''}` : 'sur tous les trades';

  const rrEl = $('stat-rr');
  rrEl.textContent = total ? `${totalRR > 0 ? '+' : ''}${totalRR.toFixed(1)}R` : '—';
  rrEl.className = `stat-value${total ? (totalRR >= 0 ? ' rr-positive' : ' rr-negative') : ''}`;
  $('stat-rr-sub').textContent = total ? `${(totalRR / total).toFixed(2)}R moy.` : 'cumulé';

  const bestEl = $('stat-best');
  bestEl.textContent = total && best > -Infinity ? `+${best}R` : '—';
  bestEl.className = 'stat-value' + (total && best > 0 ? ' rr-positive' : '');
  $('stat-best-sub').textContent = total && best > -Infinity ? 'meilleur RR' : '—';

  // couleur accent
  const wrCard = $('stat-card-wr');
  wrCard.className = 'stat-card' + (winRate === null ? '' : winRate >= 50 ? ' stat-win' : ' stat-loss');
  const rrCard = $('stat-card-rr');
  rrCard.className = 'stat-card' + (total === 0 ? '' : totalRR >= 0 ? ' stat-rr-pos' : ' stat-rr-neg');
}

/* ── MODAL DÉTAIL TRADE ── */
let detailTradeId = null;

function openTradeDetail(t) {
  detailTradeId = t.id;
  $('detail-pair').textContent = t.pair;
  $('detail-result-badge').innerHTML = resultBadge(t.result);
  $('detail-date').textContent = formatDate(t.trade_date);
  $('detail-date2').textContent = formatDate(t.trade_date);

  const rrEl = $('detail-rr');
  const n = parseRR(t.rr);
  rrEl.textContent = n > 0 ? `+${t.rr}` : t.rr;
  rrEl.className = `value ${n > 0 ? 'rr-positive' : n < 0 ? 'rr-negative' : ''}`;

  if (t.screenshot) {
    $('detail-screenshot-img').src = t.screenshot;
    $('detail-screenshot-wrap').classList.remove('hidden');
  } else {
    $('detail-screenshot-wrap').classList.add('hidden');
  }

  const notesWrap = $('detail-notes-wrap');
  if (t.notes) {
    $('detail-notes').textContent = t.notes;
    notesWrap.style.display = '';
  } else {
    notesWrap.style.display = 'none';
  }

  $('trade-detail-modal').classList.remove('hidden');
}

function closeTradeDetail() {
  $('trade-detail-modal').classList.add('hidden');
  detailTradeId = null;
}

$('trade-detail-close').addEventListener('click', closeTradeDetail);
$('trade-detail-close2').addEventListener('click', closeTradeDetail);
$('trade-detail-modal').addEventListener('click', e => { if (e.target === $('trade-detail-modal')) closeTradeDetail(); });

$('detail-screenshot-img').addEventListener('click', () => {
  $('img-modal-src').src = $('detail-screenshot-img').src;
  $('img-modal').classList.remove('hidden');
});

$('detail-delete-btn').addEventListener('click', async () => {
  if (!detailTradeId || !confirm('Supprimer ce trade définitivement ?')) return;
  try {
    await api('DELETE', `/trades/${detailTradeId}`);
    toast('Trade supprimé', 'success');
    closeTradeDetail();
    loadTrades();
  } catch (err) { toast(err.message, 'error'); }
});

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

/* ── MODAL NOUVEAU TRADE ── */
$('add-trade-btn').addEventListener('click', () => {
  $('trade-form').reset();
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

/* ── ADMIN TABS ── */
document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-section').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    $(`atab-${btn.dataset.atab}`).classList.remove('hidden');
    if (btn.dataset.atab === 'users') loadAdminUsers();
  });
});

/* ── ADMIN ── */
async function loadAdminData() {
  await loadAdminModules();
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

function getAdminThumbHtml(v) {
  const ytId = getYouTubeId(v.url);
  const thumb = v.cover || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
  if (thumb) return `<img class="admin-video-thumb" src="${thumb}" alt="" />`;
  return `<div class="admin-video-thumb-placeholder">▶</div>`;
}

async function loadAdminModules() {
  try {
    const modules = await api('GET', '/admin/modules');
    const el = $('modules-admin-list');
    const sel = $('video-module-id');

    if (!modules.length) {
      el.innerHTML = `<div class="card"><p class="text-muted" style="font-size:0.88rem;">Aucun module. Créez-en un à droite.</p></div>`;
    } else {
      const videosAll = await api('GET', '/videos');
      videoCache.clear();

      el.innerHTML = modules.map(m => {
        const vids = (videosAll.find(mod => mod.id === m.id) || { videos: [] }).videos;
        vids.forEach(v => videoCache.set(String(v.id), v));
        return `
          <div class="admin-module-block">
            <div class="admin-module-header">
              <span class="admin-module-name">
                <span style="color:var(--text-muted);">📁</span> ${m.title}
                <span class="module-badge">${vids.length} vidéo${vids.length !== 1 ? 's' : ''}</span>
              </span>
              <button class="btn btn-danger btn-sm delete-module" data-id="${m.id}">✕ Supprimer</button>
            </div>
            ${vids.length ? vids.map(v => `
              <div class="admin-video-row">
                ${getAdminThumbHtml(v)}
                <span class="admin-video-title-text">${v.title}</span>
                <div class="admin-video-actions">
                  <button class="btn btn-secondary btn-sm edit-video" data-id="${v.id}">Modifier</button>
                  <button class="btn btn-danger btn-sm delete-video" data-id="${v.id}" data-title="${v.title}">✕</button>
                </div>
              </div>`).join('') : `
              <div style="padding:10px 14px; font-size:0.83rem; color:var(--text-muted);">Aucune vidéo dans ce module.</div>`}
          </div>`;
      }).join('');

      el.querySelectorAll('.delete-module').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Supprimer ce module et toutes ses vidéos ?')) return;
          try {
            await api('DELETE', `/admin/modules/${btn.dataset.id}`);
            toast('Module supprimé', 'success');
            loadAdminModules(); loadFormation();
          } catch (err) { toast(err.message, 'error'); }
        });
      });

      el.querySelectorAll('.delete-video').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Supprimer "${btn.dataset.title}" ?`)) return;
          try {
            await api('DELETE', `/admin/videos/${btn.dataset.id}`);
            toast('Vidéo supprimée', 'success');
            loadAdminModules(); loadFormation();
          } catch (err) { toast(err.message, 'error'); }
        });
      });

      el.querySelectorAll('.edit-video').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(videoCache.get(btn.dataset.id)));
      });
    }

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

/* ── FILE INPUTS : vider au clic pour permettre la re-sélection du même fichier ── */
['video-file', 'video-cover', 'edit-video-file', 'edit-video-cover'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', () => { el.value = ''; });
});

/* ── ADD VIDEO FORM ── */
document.querySelectorAll('input[name="video-source"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isFile = $('source-file').checked;
    $('input-url-wrap').classList.toggle('hidden', isFile);
    $('input-file-wrap').classList.toggle('hidden', !isFile);
  });
});

function xhrUpload(url, formData, progressBar, progressLabel) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', ev => {
      if (ev.lengthComputable) {
        const pct = Math.round(ev.loaded / ev.total * 100);
        progressBar.style.width = pct + '%';
        progressLabel.textContent = pct + '%';
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error((JSON.parse(xhr.responseText) || {}).error || 'Erreur upload'));
    });
    xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
    xhr.send(formData);
  });
}

$('add-video-form').addEventListener('submit', async e => {
  e.preventDefault();
  const isFile = $('source-file').checked;
  const moduleId = $('video-module-id').value;
  const title = $('video-title').value;
  const description = $('video-desc').value;
  const coverFile = $('video-cover').files[0];
  const btn = $('add-video-btn');
  if (!moduleId || !title) { toast('Module et titre requis', 'error'); return; }

  const form = new FormData();
  form.append('module_id', moduleId);
  form.append('title', title);
  form.append('description', description);
  if (coverFile) form.append('cover', coverFile);

  if (isFile) {
    const videoFile = $('video-file').files[0];
    if (!videoFile) { toast('Sélectionnez un fichier vidéo', 'error'); return; }
    form.append('file', videoFile);
    btn.disabled = true; btn.textContent = 'Upload en cours…';
    $('upload-progress-wrap').classList.remove('hidden');
    try {
      await xhrUpload('/api/admin/videos', form, $('upload-progress-bar'), $('upload-progress-label'));
      toast('Vidéo uploadée !', 'success');
      $('add-video-form').reset();
      $('input-url-wrap').classList.remove('hidden');
      $('input-file-wrap').classList.add('hidden');
      $('source-url').checked = true;
      loadAdminModules(); loadFormation();
    } catch (err) { toast(err.message, 'error'); }
    finally {
      btn.disabled = false; btn.textContent = 'Ajouter la vidéo';
      $('upload-progress-wrap').classList.add('hidden');
      $('upload-progress-bar').style.width = '0%';
    }
  } else {
    const url = $('video-url').value;
    if (!url) { toast('URL requise', 'error'); return; }
    form.append('url', url);
    try {
      await xhrUpload('/api/admin/videos', form, { style: {} }, { textContent: '' });
      toast('Vidéo ajoutée !', 'success');
      $('add-video-form').reset();
      loadAdminModules(); loadFormation();
    } catch (err) { toast(err.message, 'error'); }
  }
});

/* ── MODAL MODIFIER VIDÉO ── */
function openEditModal(v) {
  if (!v) return;
  $('edit-video-id').value = v.id;
  $('edit-video-title').value = v.title;
  $('edit-video-desc').value = v.description || '';
  $('edit-video-cover').value = '';
  $('edit-video-file').value = '';
  $('edit-video-url').value = '';
  $('edit-source-keep').checked = true;
  $('edit-url-wrap').classList.add('hidden');
  $('edit-file-wrap').classList.add('hidden');

  if (v.cover) {
    $('edit-cover-img').src = v.cover;
    $('edit-cover-preview').style.display = 'block';
  } else {
    $('edit-cover-preview').style.display = 'none';
  }

  $('edit-video-modal').classList.remove('hidden');
}

function closeEditModal() {
  $('edit-video-modal').classList.add('hidden');
}

$('edit-video-modal-close').addEventListener('click', closeEditModal);
$('edit-video-cancel').addEventListener('click', closeEditModal);
$('edit-video-modal').addEventListener('click', e => { if (e.target === $('edit-video-modal')) closeEditModal(); });

document.querySelectorAll('input[name="edit-source"]').forEach(radio => {
  radio.addEventListener('change', () => {
    $('edit-url-wrap').classList.toggle('hidden', !$('edit-source-url').checked);
    $('edit-file-wrap').classList.toggle('hidden', !$('edit-source-file').checked);
  });
});

$('edit-video-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('edit-video-id').value;
  const btn = $('edit-video-btn');
  const form = new FormData();
  form.append('title', $('edit-video-title').value);
  form.append('description', $('edit-video-desc').value);

  const coverFile = $('edit-video-cover').files[0];
  if (coverFile) form.append('cover', coverFile);

  const src = document.querySelector('input[name="edit-source"]:checked').value;
  if (src === 'url') {
    const url = $('edit-video-url').value;
    if (!url) { toast('URL requise', 'error'); return; }
    form.append('url', url);
  } else if (src === 'file') {
    const videoFile = $('edit-video-file').files[0];
    if (!videoFile) { toast('Sélectionnez un fichier vidéo', 'error'); return; }
    form.append('file', videoFile);
  }

  const hasVideo = src === 'file';
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  if (hasVideo) $('edit-progress-wrap').classList.remove('hidden');

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', `/api/admin/videos/${id}`);
      if (hasVideo) {
        xhr.upload.addEventListener('progress', ev => {
          if (ev.lengthComputable) {
            const pct = Math.round(ev.loaded / ev.total * 100);
            $('edit-progress-bar').style.width = pct + '%';
            $('edit-progress-label').textContent = pct + '%';
          }
        });
      }
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error((JSON.parse(xhr.responseText) || {}).error || 'Erreur'));
      });
      xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
      xhr.send(form);
    });
    toast('Vidéo mise à jour !', 'success');
    closeEditModal();
    loadAdminModules(); loadFormation();
  } catch (err) { toast(err.message, 'error'); }
  finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
    $('edit-progress-wrap').classList.add('hidden');
    $('edit-progress-bar').style.width = '0%';
  }
});

/* ── GRAPHIQUE RR CUMULÉ ── */
let rrChartInstance = null;

function renderRRChart(trades) {
  const canvas = $('rr-chart');
  const card = $('rr-chart-card');
  if (!canvas || !card) return;

  const sorted = [...trades]
    .filter(t => t.trade_date)
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

  if (!sorted.length) {
    card.classList.add('hidden');
    if (rrChartInstance) { rrChartInstance.destroy(); rrChartInstance = null; }
    return;
  }
  card.classList.remove('hidden');

  let cum = 0;
  const labels = [];
  const data = [];
  sorted.forEach(t => {
    cum = parseFloat((cum + parseRR(t.rr)).toFixed(2));
    labels.push(formatDate(t.trade_date));
    data.push(cum);
  });

  if (rrChartInstance) { rrChartInstance.destroy(); rrChartInstance = null; }

  rrChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'RR cumulé',
        data,
        borderColor: 'rgb(244,199,15)',
        backgroundColor: 'rgba(244,199,15,0.07)',
        pointBackgroundColor: data.map(v => v >= 0 ? '#4caf50' : '#f44336'),
        pointBorderColor: data.map(v => v >= 0 ? '#4caf50' : '#f44336'),
        pointRadius: sorted.length <= 30 ? 4 : 2,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `RR cumulé : ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}R`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(232,227,218,0.6)' },
          ticks: { font: { size: 10 }, color: '#6b6b6b', maxTicksLimit: 8, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(232,227,218,0.6)' },
          ticks: {
            font: { size: 10 },
            color: '#6b6b6b',
            callback: v => `${v >= 0 ? '+' : ''}${v}R`
          }
        }
      }
    }
  });
}

/* ── CALCULATEUR DE LOT ── */
const PIP_VALUES   = { EURUSD: 10, GBPUSD: 10, GOLD: 1, NAS100: 1 };
const UNITS_PER_LOT = { EURUSD: 100000, GBPUSD: 100000, GOLD: 100, NAS100: 1 };

function calcLotSize() {
  const instr   = $('lot-instrument').value;
  const balance = parseFloat($('lot-balance').value);
  const risk    = parseFloat($('lot-risk').value);
  const sl      = parseFloat($('lot-sl').value);
  const pipVal  = PIP_VALUES[instr] || 10;

  $('lot-pipvalue').value = pipVal;

  if (!balance || !risk || !sl || balance <= 0 || risk <= 0 || sl <= 0) {
    $('lot-result').classList.add('hidden');
    return;
  }

  const riskedAmt = balance * risk / 100;
  const lotSize   = riskedAmt / (sl * pipVal);
  const units     = lotSize * (UNITS_PER_LOT[instr] || 100000);

  $('lot-out-size').textContent  = lotSize.toFixed(2);
  $('lot-out-units').textContent = Math.round(units).toLocaleString('fr-FR');
  $('lot-out-risk').textContent  = '$' + riskedAmt.toFixed(2);
  $('lot-result').classList.remove('hidden');
}

$('lot-instrument').addEventListener('change', calcLotSize);
['lot-balance', 'lot-risk', 'lot-sl'].forEach(id => $(id).addEventListener('input', calcLotSize));
calcLotSize();
