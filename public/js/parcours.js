/* V105 — IMAGES ÉTAPE 4 */

/* V87 - Mon parcours OTE 705 */
(() => {
  /* V94 — TEXTES DU PARCOURS */
  const steps = [
    {
      title:'Concepts',
      type:'Apprentissage',
      description:'Construis des bases solides en comprenant les principes essentiels du marché. Tu apprends le vocabulaire, la logique et le comportement du prix.',
      tasks:[
        'Regarder les vidéos du module Concepts',
        'Regarder la vidéo d’exercice sur la structure',
        'Suivre le corrigé',
        'Prends le temps d\'assimiler les notions. Note tes interrogations et poursuis ton apprentissage : certaines réponses viendront avec la suite de la formation.'
      ]
    },
    {
      title:'Structure',
      type:'Pratique',
      description:'Comprends la fractalité du marché et apprends à repérer la structure externe et interne. Tu sauras identifier les phases de continuation et de retracement sur plusieurs unités de temps.',
      tasks:[
        'Analyser la structure externe (le contexte global)',
        'Analyser la structure interne (les opportunités)',
        'Comprendre la fractalité et l’enchaînement des phases',
        'Identifier les continuations et les retracements',
        'Envoyer 2 captures sur Telegram : structure externe et structure interne'
      ],
      examples:['Structure externe (HTF)','Structure interne (LTF)']
    },
    {
      title:'Stratégie (Vision & Setups)',
      type:'Apprentissage',
      description:'Découvre en détail la stratégie OTE 705 et apprends à identifier les setups en fonction des différentes structures du marché.',
      tasks:[
        'Regarder les vidéos du module Stratégie',
        'Comprendre les setups : continuation, retracement, flip',
        'Voir des exemples concrets sur plusieurs structures',
        'Ne cherche pas encore à backtester ou à maîtriser chaque détail. Concentre-toi sur la compréhension globale de la stratégie et des différents setups.'
      ]
    },
    {
      title:'Application (Analyse & Envoi)',
      type:'Pratique',
      description:'Applique ce que tu as appris en repérant les setups sur les graphiques. Tu analyses, tu justifies tes prises de position et tu m’envoies tes exemples pour validation.',
      tasks:[
        'Chercher des setups sur les graphiques',
        'Identifier la structure et le contexte',
        'Justifier le setup : continuation, retracement ou flip',
        'M’envoyer tes analyses avec tes justifications sur Telegram',
        'Pour chaque analyse envoyée, justifie ton raisonnement et les critères respectés. Ne cherche pas simplement à savoir si ton analyse est correcte.'
      ],
      examples:['Trade LTF','Trade HTF']
    },
    {
      title:'Backtest — Entraînement',
      type:'Pratique',
      description:'Mets la stratégie en pratique sur FXReplay. Tu t’entraînes sur des données historiques pour renforcer ta lecture, valider tes entrées et corriger tes erreurs.',
      tasks:[
        'Backtester la stratégie sur FXReplay par séries de 20 trades',
        'Tester les 3 setups : continuation, retracement, flip',
        'Relever tes statistiques : winrate, RR, sessions, etc.',
        'Réaliser ton backtest en autonomie, puis faire une review de tes résultats et de tes erreurs en appel'
      ]
    },
    {
      title:'Backtest — Officiel',
      type:'Pratique',
      description:'Valide la stratégie avec un backtest complet et structuré. Tu recueilles des données fiables pour confirmer sa rentabilité.',
      tasks:[
        'Réaliser un backtest complet (ex. 100 trades)',
        'Analyser tes résultats : winrate, RR, espérance, etc.',
        'Étudier la performance par session (Asie, Londres, US)',
        'Extraire tes statistiques et conclusions'
      ]
    },
    {
      title:'Réel',
      type:'Trading réel',
      description:'Applique la stratégie en conditions réelles avec une gestion du risque maîtrisée. Tu prends des trades, tu suis ton plan et tu gagnes en régularité, jusqu’à la performance.',
      tasks:[
        'Trader en réel avec une gestion du risque adaptée',
        'Respecter ton plan et documenter tes trades',
        'Me contacter / réserver un appel quand tu en ressens le besoin'
      ]
    }
  ];

  let progress = Array(7).fill(false);
  let busy = false;
  let loadVersion = 0;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',
      '"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function request(method,path,body) {
    const response = await fetch('/api'+path,{
      method,
      credentials:'same-origin',
      headers:body ? {'Content-Type':'application/json'} : {},
      body:body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  }

  function render() {
    const root = document.getElementById('ote-parcours-root');
    if (!root) return;

    const count = progress.filter(Boolean).length;
    const percent = Math.round(count / 7 * 100);

    root.innerHTML = `
      <div class="ote-path">

        <header class="ote-path-header">
          <div class="ote-path-heading">
            <div class="ote-path-eyebrow">
              ESPRIT TRADING / FORMATION
            </div>

            <h1>Mon parcours <span>OTE 705</span></h1>

            <details class="ote-accompagnement-info" style="position:relative;margin-top:12px;background:#1b1c20;border:1px solid #303136;border-radius:10px;color:#e5e5e5;text-align:left;">
              <summary style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;cursor:pointer;list-style:none;">
                <span style="display:flex;align-items:center;gap:11px;min-width:0;">
                  <span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:#292724;border-radius:7px;color:#d8b66e;flex-shrink:0;">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 7v14"/>
                      <path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2h-3a4 4 0 0 0-4 4 4 4 0 0 0-4-4H5a2 2 0 0 0-2 2z"/>
                    </svg>
                  </span>
                  <span style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                    <span style="color:#f2f2f2;font-size:13px;font-weight:600;">Comment fonctionne ton accompagnement ?</span>
                    <span style="color:#93949a;font-size:11px;font-weight:400;">Les principes à suivre pour progresser</span>
                  </span>
                </span>
                <svg class="ote-info-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a7a7a7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform .2s;">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </summary>
              <div style="position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:100;background:#202023;border:1px solid #38383d;border-radius:10px;padding:18px;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;line-height:1.5;">
                <p style="margin:0 0 14px;">
                Ce parcours a été conçu pour te permettre de construire progressivement tes compétences et de devenir autonome dans ton trading.
              </p>
<p style="margin:0 0 14px;font-weight:700;">
                Respecte l'ordre des étapes et prends le temps d'assimiler chaque notion avant de passer à la suivante.
              </p>
<p style="margin:0 0 14px;">
                Pendant ton apprentissage, ne cherche pas à obtenir immédiatement une réponse à chacune de tes interrogations.
                Prends le temps de réfléchir, de faire des erreurs et de construire ton propre raisonnement.
              </p>
<p style="margin:0;font-weight:700;">
                Mon rôle est de te guider, de corriger ton travail et de t'aider à surmonter tes blocages, pas de construire ton raisonnement à ta place.
              </p>
              </div>
            </details>
            <style>
              .ote-accompagnement-info > summary::-webkit-details-marker { display:none; }
              .ote-accompagnement-info[open] .ote-info-chevron { transform:rotate(180deg); }
            </style>
          </div>

          <div class="ote-path-progress">
            <div class="ote-path-progress-label">Votre progression</div>

            <div class="ote-path-progress-value">
              <strong>${percent} %</strong>
              <span>du parcours</span>
            </div>

            <div class="ote-path-track">
              ${steps.map((_,i)=>`
                <span class="${i<count?'active':''}"></span>
              `).join('')}
            </div>

            <div class="ote-path-progress-caption">
              ${count} étape${count>1?'s':''} validée${count>1?'s':''} sur 7
            </div>
          </div>
        </header>

        <div class="ote-path-section-heading">
          <details class="ote-contact-info" style="position:relative;margin:0 0 24px;background:#1b1c20;border:1px solid #303136;border-radius:10px;color:#e5e5e5;text-align:left;">
  <summary style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;cursor:pointer;list-style:none;">
    <span style="display:flex;align-items:center;gap:11px;min-width:0;">
      <span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:#292724;border-radius:7px;color:#d8b66e;flex-shrink:0;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/>
        </svg>
      </span>
      <span style="display:flex;flex-direction:column;gap:2px;">
        <span style="color:#f2f2f2;font-size:13px;font-weight:600;">Quand et comment me contacter ?</span>
        <span style="color:#93949a;font-size:11px;">Les règles pour les questions et le suivi</span>
      </span>
    </span>
    <svg class="ote-contact-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a7a7a7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform .2s;">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  </summary>
  <div style="position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:100;background:#202023;border:1px solid #38383d;border-radius:10px;padding:18px;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:13px;line-height:1.5;">
    <p style="margin:0 0 10px;">L'accompagnement est là pour t'aider à progresser, mais ton apprentissage doit avant tout reposer sur ton propre travail.</p>
    <p style="margin:0 0 10px;">Avant de me poser une question, assure-toi d'avoir consulté les vidéos concernées et pris le temps de réfléchir par toi-même.</p>
    <p style="margin:0 0 10px;">Si tu rencontres un véritable blocage, explique-moi ce que tu as compris, ce que tu as essayé et ce qui te pose problème.</p>
    <p style="margin:0;">Les corrections d'analyses, les reviews de backtest et les appels se font en fonction de ton avancement dans le parcours.</p>
  </div>
</details>
<style>
  .ote-contact-info > summary::-webkit-details-marker { display:none; }
  .ote-contact-info[open] .ote-contact-chevron { transform:rotate(180deg); }
</style>
<h2>Les étapes de votre parcours</h2>
          <p>Avance à ton rythme, de la théorie à la pratique.</p>
        </div>

        <div class="ote-path-list">
          ${steps.map((step,i)=>{
            const done=progress[i];
            const unlocked=i===0 || progress[i-1];
            const locked=!done && !unlocked;
            const type=step.type==='Apprentissage'?'learning':
              step.type==='Pratique'?'practice':'real';

            return `
              <article class="ote-path-step ${done?'is-done':''} ${locked?'is-locked':''}">

                <div class="ote-path-watermark" aria-hidden="true">
                  ${String(i+1).padStart(2,'0')}
                </div>

                <div class="ote-path-step-grid">

                  <div class="ote-path-step-left">

                    <div class="ote-path-step-meta">
                      <span class="ote-path-number">
                        ${String(i+1).padStart(2,'0')}
                      </span>

                      <span class="ote-path-badge ${type}">
                        ${escapeHTML(step.type)}
                      </span>
                    </div>

                    <h3>${escapeHTML(step.title)}</h3>

                    <p class="ote-path-description">
                      ${escapeHTML(step.description)}
                    </p>

                    ${false && step.examples ? `
                      <div class="ote-path-examples">
                        ${step.examples.map(label=>`
                          <div class="ote-path-example">
                            <i class="ti ti-photo"></i>
                            <span>${escapeHTML(label)}</span>
                            <small>Exemple à ajouter</small>
                          </div>
                        `).join('')}
                      </div>
                    `:''}

                  </div>

                  <div class="ote-path-step-right">

                    <div class="ote-path-tasks">
                      <div class="ote-path-tasks-title">
                        Dans cette étape, tu vas :
                      </div>

                      <ul>
                        ${step.tasks.map(task=>`
                          <li>${escapeHTML(task)}</li>
                        `).join('')}
                      </ul>
                    </div>




                    

                    

                  </div>

                </div>


                ${i === 4 ? `
                  <div class="ote-call-card" style="width:100%;box-sizing:border-box;"margin-top:22px;padding:20px;background:#232326;border:1px solid #51452f;border-radius:12px;position:relative;z-index:1;">
                    <div style="font-size:16px;font-weight:650;color:#d9b66f;margin-bottom:10px;">Appel de correction</div>
                    <p style="font-size:13px;line-height:1.6;color:#bcbcc2;margin:0 0 14px;">Une fois tes 20 trades backtestés et tes statistiques relevées, réserve un appel pour qu'on puisse analyser tes résultats, corriger tes erreurs et préparer la suite.</p>
                    <label style="display:flex;align-items:center;gap:10px;color:#e5e5e5;font-size:13px;cursor:pointer;margin-bottom:14px;">
                      <input type="checkbox" class="ote-call-confirm" ${locked ? "disabled" : ""} style="width:17px;height:17px;accent-color:#d8b66e;cursor:pointer;">
                      J'ai terminé mes 20 trades et relevé mes statistiques.
                    </label>
                    <button type="button" class="ote-call-book" disabled data-coaching-tab="rdv" style="width:100%;padding:11px 14px;background:#343438;border:1px solid #444449;border-radius:9px;color:#e5e5e5;font-size:13px;font-weight:600;cursor:not-allowed;">
                      <i class="ti ti-calendar-event"></i> Réserver mon appel de correction
                    </button>
                  </div>
                ` : ''}

                ${i === 5 || i === 6 ? `
                  <div class="ote-call-card" style="width:100%;box-sizing:border-box;"margin-top:18px;padding:15px 18px;background:#232326;border:1px solid #343438;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;position:relative;z-index:1;">
                    <div style="flex:1;min-width:220px;">
                      <div style="font-size:14px;font-weight:650;color:#f0f0f0;margin-bottom:5px;">Besoin d'un appel ?</div>
                      <div style="font-size:12px;line-height:1.5;color:#bcbcc2;">Si tu rencontres des difficultés ou souhaites faire le point sur ta progression, tu peux réserver un appel.</div>
                    </div>
                    <button type="button" class="ote-call-book" ${locked ? "disabled" : ""} data-coaching-tab="rdv" style="padding:9px 15px;background:transparent;border:1px solid #55555a;border-radius:30px;color:#e5e5e5;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">
                      Réserver un appel
                    </button>
                  </div>
                ` : ''}


                

                ${step.examples ? `
                  <div class="ote-path-examples-heading">Exemples graphiques</div>
                  <div class="ote-path-examples ote-path-examples-wide">
                    ${step.examples.map((label, index)=>`
                      <div class="ote-path-example">
                        ${i === 1 ? `
                          <img
                            src="${index === 0 ? '/images/structure-ltf.jpg' : '/images/structure-htf.jpg'}"
                            alt="${index === 0 ? 'Structure HTF' : 'Structure LTF'}"
                            loading="lazy"
                          >
                          <span>${index === 0 ? 'Structure HTF' : 'Structure LTF'}</span>
                        ` : `
                          <img
                            src="${index === 0 ? '/images/IMAGE%202026-11-09%2015%3A57%3A38.jpg' : '/images/IMAGE%202026-11-09%2015%3A57%3A41.jpg'}"
                            alt="${escapeHTML(label)}"
                            loading="lazy"
                          >
                          <span>${escapeHTML(label)}</span>
                        `}
                      </div>
                    `).join('')}
                  </div>
                `:''}

                

                <div class="ote-path-validation-bottom">
                    <div class="ote-path-validation-confirm ${done ? 'is-complete' : ''}">
                      <label class="ote-path-confirm-label">
                        <input
                          type="checkbox"
                          class="ote-path-confirm-checkbox"
                          data-confirm-step="${i+1}"
                          ${done ? 'checked disabled' : locked || busy ? 'disabled' : ''}
                        >
                        <span>${done
                          ? 'Cette étape a été validée.'
                          : 'Je confirme avoir terminé le travail demandé pour cette étape.'}</span>
                      </label>
                      <button
                        type="button"
                        class="ote-path-check ${done ? 'checked' : ''}"
                        data-path-step="${i+1}"
                        ${locked || busy || !done ? 'disabled' : ''}
                        aria-pressed="${done}"
                      >
                        <i class="ti ti-${done ? 'check' : locked ? 'lock' : 'circle'}"></i>
                        <span>${done ? 'Étape validée' : locked ? 'Étape verrouillée' : 'Valider cette étape'}</span>
                      </button>
                    </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>


      </div>
    `;
  }


  document.addEventListener('change', (event) => {
    if (!event.target.matches('.ote-call-confirm')) return;

    const card = event.target.closest('.ote-call-card');
    const button = card?.querySelector('.ote-call-book');
    if (!button) return;

    const step = button.closest('.ote-path-step');
    button.disabled = !event.target.checked || step?.classList.contains('is-locked');
    button.style.cursor = event.target.checked ? 'pointer' : 'not-allowed';
    button.style.background = event.target.checked ? '#d8b66e' : '#343438';
    button.style.color = event.target.checked ? '#161616' : '#e5e5e5';
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.ote-call-book');
    if (!button || button.disabled) return;

    const step = button.closest('.ote-path-step');
    if (step?.classList.contains('is-locked')) return;

    const coachingTab = document.querySelector('[data-ftab="rdv"]');
    if (!coachingTab) return;

    coachingTab.click();
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });


  if (!document.getElementById('ote-call-disabled-style')) {
    const style = document.createElement('style');
    style.id = 'ote-call-disabled-style';
    style.textContent = '.ote-call-book:disabled{opacity:.45!important;cursor:not-allowed!important;pointer-events:none!important;}';
    document.head.appendChild(style);
  }


  if (!document.getElementById('ote-call-card-style')) {
    const style = document.createElement('style');
    style.id = 'ote-call-card-style';
    style.textContent = `
      .ote-path-step .ote-call-card {
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 22px 24px !important;
        margin-top: 20px !important;
        background: #222326 !important;
        border: 1px solid #3e4045 !important;
        border-radius: 12px !important;
      }
      .ote-path-step .ote-call-card:has(.ote-call-confirm) {
        border-color: #655333 !important;
      }
      .ote-path-step .ote-call-card:not(:has(.ote-call-confirm)) .ote-call-book {
        margin-top: 16px !important;
      }
    `;
    document.head.appendChild(style);
  }


  if (!document.getElementById('ote-call-book-premium-style')) {
    const style = document.createElement('style');
    style.id = 'ote-call-book-premium-style';
    style.textContent = `
      .ote-path-step .ote-call-book:not(:disabled) {
        background: #d9b66f !important;
        color: #171717 !important;
        border: 1px solid #d9b66f !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        opacity: 1 !important;
        transition: background .2s ease, border-color .2s ease;
      }

      .ote-path-step .ote-call-book:not(:disabled):hover {
        background: #e9c985 !important;
        border-color: #e9c985 !important;
      }

      .ote-path-step .ote-call-book:disabled {
        background: #343438 !important;
        color: #85858b !important;
        border: 1px solid #444449 !important;
        opacity: .55 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }


  if (!document.getElementById('ote-call-locked-border-style')) {
    const style = document.createElement('style');
    style.id = 'ote-call-locked-border-style';
    style.textContent = `
      .ote-path-step.is-locked .ote-call-card:has(.ote-call-confirm) {
        border-color: #45464b !important;
      }
    `;
    document.head.appendChild(style);
  }


  if (!document.getElementById('ote-call-completed-green-style')) {
    const style = document.createElement('style');
    style.id = 'ote-call-completed-green-style';
    style.textContent = `
      .ote-path-step.is-done .ote-call-card:has(.ote-call-confirm) {
        border-color: #62bd96 !important;
        background: #1b2925 !important;
      }

      .ote-path-step.is-done .ote-call-card:has(.ote-call-confirm) > div:first-child {
        color: #72cba5 !important;
      }

      .ote-path-step.is-done .ote-call-card:has(.ote-call-confirm) .ote-call-book:not(:disabled) {
        background: #72cba5 !important;
        border-color: #72cba5 !important;
        color: #10251c !important;
      }

      .ote-path-step.is-done .ote-call-card:has(.ote-call-confirm) .ote-call-book:not(:disabled):hover {
        background: #8adbb8 !important;
        border-color: #8adbb8 !important;
      }
    `;
    document.head.appendChild(style);
  }

  async function load() {
    const root=document.getElementById('ote-parcours-root');
    if (!root) return;

    const version=++loadVersion;
    root.innerHTML='<p class="ote-path-loading">Chargement de ton parcours…</p>';

    try {
      const data=await request('GET','/parcours');
      if (version!==loadVersion) return;
      progress=data.progress;
      render();
    } catch(error) {
      if (version===loadVersion)
        root.textContent='Impossible de charger le parcours : '+error.message;
    }
  }



  document.addEventListener('change', event => {
    const checkbox = event.target.closest('.ote-path-confirm-checkbox');
    if (!checkbox || busy) return;

    const box = checkbox.closest('.ote-path-validation-confirm');
    const button = box?.querySelector('[data-path-step]');
    if (!button) return;

    const index = Number(checkbox.dataset.confirmStep) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= progress.length) return;
    if (progress[index]) return;

    button.disabled = !checkbox.checked || (index > 0 && !progress[index-1]);
  });

  document.addEventListener('click',async event=>{
    const tab=event.target.closest('.nav-subitem[data-ftab="parcours"]');
    if (tab) {
      if (!busy) load();
      return;
    }

    const button=event.target.closest('[data-path-step]');
    if (!button || busy || button.disabled) return;

    const index=Number(button.dataset.pathStep)-1;
    const completed=!progress[index];

    if (completed) {
      const checkbox = button.closest('.ote-path-validation-confirm')
        ?.querySelector('.ote-path-confirm-checkbox');
      if (!checkbox?.checked) return;
      if (index > 0 && !progress[index-1]) return;
    }

    busy=true;
    render();

    try {
      const data=await request('PUT','/parcours/'+(index+1),{completed});
      ++loadVersion;
      progress=data.progress;
    } catch(error) {
      alert('Validation non enregistrée : '+error.message);
      try {
        const data=await request('GET','/parcours');
        progress=data.progress;
      } catch (_) {}
    } finally {
      busy=false;
      render();
    }
  });
})();
