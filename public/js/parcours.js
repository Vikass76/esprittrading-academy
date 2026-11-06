
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
        'Suivre le corrigé'
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
        'Voir des exemples concrets sur plusieurs structures'
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
        'M’envoyer tes analyses avec tes justifications sur Telegram'
      ],
      examples:['Exemple : Continuation','Exemple : Retracement']
    },
    {
      title:'Backtest — Entraînement',
      type:'Pratique',
      description:'Mets la stratégie en pratique sur FXReplay. Tu t’entraînes sur des données historiques pour renforcer ta lecture, valider tes entrées et corriger tes erreurs.',
      tasks:[
        'Backtester la stratégie sur FXReplay par séries de 20 trades',
        'Tester les 3 setups : continuation, retracement, flip',
        'Relever tes statistiques : winrate, RR, sessions, etc.',
        'Faire une review en appel, corriger tes erreurs et répéter jusqu’à maîtrise'
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

            <p>
              Un parcours clair et progressif pour maîtriser la stratégie,
              valider tes résultats et l'appliquer en conditions réelles.
            </p>
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

                    

                    ${!step.examples ? `<button
                      type="button"
                      class="ote-path-check ${done?'checked':''}"
                      data-path-step="${i+1}"
                      ${locked||busy?'disabled':''}
                      aria-pressed="${done}"
                      aria-label="${done?'Dévalider':'Valider'} : ${escapeHTML(step.title)}"
                    >
                      <i class="ti ti-${done?'check':locked?'lock':'circle'}"></i>
                      <span>${done?'Étape validée':locked?'Étape verrouillée':'Valider cette étape'}</span>
                    </button>` : ''}

                  </div>

                </div>

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
                          <i class="ti ti-photo"></i>
                          <span>${escapeHTML(label)}</span>
                          <small>Exemple à ajouter</small>
                        `}
                      </div>
                    `).join('')}
                  </div>
                `:''}

                ${step.examples ? `
                  <div class="ote-path-bottom-action">
                    <button
                      type="button"
                      class="ote-path-check ${done?'checked':''}"
                      data-path-step="${i+1}"
                      ${locked||busy?'disabled':''}
                      aria-pressed="${done}"
                      aria-label="${done?'Dévalider':'Valider'} : ${escapeHTML(step.title)}"
                    >
                      <i class="ti ti-${done?'check':locked?'lock':'circle'}"></i>
                      <span>${done?'Étape validée':locked?'Étape verrouillée':'Valider cette étape'}</span>
                    </button>
                  </div>
                ` : ''}
              </article>
            `;
          }).join('')}
        </div>


      </div>
    `;
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
