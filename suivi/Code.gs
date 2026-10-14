/** @OnlyCurrentDoc */
/**
 * Suivi de « Calcul mental CM1 » — à coller dans Extensions > Apps Script du tableau Google Sheets du parent.
 * L'appli de l'enfant envoie une ligne à chaque étape du programme ; ce script les range dans l'onglet « Journal »
 * et recalcule l'onglet « Résumé » (par jour, par notion, derniers calculs ratés, graphique).
 * (@OnlyCurrentDoc : le script n'a accès qu'à CE tableau.)
 *
 * NOUVEAU : onglet « Résumé de la semaine » (avec des idées simples pour aider), alertes en haut du « Tableau de bord »
 * (pas joué depuis 2 jours, notion qui bloque), et un tableau de bord lisible sur téléphone (une colonne, gros texte).
 * À FAIRE : recollez tout ce code ici, enregistrez, puis Déployer › Gérer les déploiements › crayon › Nouvelle version.
 * Rechargez le tableau, puis menu « Calcul mental › Activer le résumé chaque dimanche (e-mail) » (et, si vous voulez, les alertes du soir).
 */
const COLS = ['Date', 'Heure', 'Enfant', 'Type', 'Domaine', 'Notion', 'Score', 'Verdict', 'Calculs ratés', 'Détail'];

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('illisible'); }
  if (!d || typeof d !== 'object') return ContentService.createTextOutput('illisible');
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(15000);   // si le tableau est occupé, on range quand même la ligne (l'appli ne la renverra pas)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (d.type === 'sauvegarde') { if (locked) garder_(ss, d); return ContentService.createTextOutput('ok'); }
    const j = locked ? preparer_(ss) : (ss.getSheetByName('Journal') || preparer_(ss));
    const v = k => texte_(d[k], 600);
    const score = (d.score === undefined || d.score === '' || isNaN(Number(d.score))) ? '' : Math.max(0, Math.min(100, Number(d.score)));
    j.appendRow([v('date'), v('heure'), v('enfant'), v('type'), v('domaine'), v('notion'), score, v('verdict'), v('erreurs'), v('detail')]);
    // le résumé (qui relit tout le journal) est recalculé à la fin du programme, au déblocage, ou depuis le menu
    if (locked && (d.type === 'programme fini' || d.type === 'déblocage' || d.type === 'bilan de la semaine' || j.getLastRow() % 10 === 0)) resume_(ss);
    return ContentService.createTextOutput('ok');
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* Texte gardé tel quel : l'apostrophe empêche Sheets de le transformer (heure, date, nombre) ou d'y voir une formule. */
function texte_(x, max) {
  if (x === undefined || x === null) return '';
  return "'" + String(x).slice(0, max);
}

/* Lecture seule : l'adresse ne renvoie JAMAIS de données (la sauvegarde se récupère depuis le menu du tableau). */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  preparer_(ss);
  return ContentService.createTextOutput('Le suivi de Calcul mental CM1 est prêt.');
}

/* Sauvegardes de la progression : onglet caché « Sauvegardes », les 30 dernières (découpées en morceaux de 45 000 caractères). */
function garder_(ss, d) {
  let s = ss.getSheetByName('Sauvegardes');
  if (!s) { s = ss.insertSheet('Sauvegardes'); s.appendRow(['Date', 'Heure', 'Enfant', 'Morceaux…']); s.hideSheet(); }
  const code = String(d.code || '');
  if (!/^PYTH-[A-Za-z0-9+\/=]+$/.test(code)) return;
  // on ne garde qu'une vraie sauvegarde de l'appli (du JSON avec sa progression)
  try {
    const o = JSON.parse(Utilities.newBlob(Utilities.base64Decode(code.slice(5))).getDataAsString('UTF-8'));
    if (!o || typeof o !== 'object' || typeof o.coach !== 'object') return;
  } catch (err) { return; }
  const parts = [];
  for (let i = 0; i < code.length; i += 45000) parts.push(code.slice(i, i + 45000));
  s.appendRow([texte_(d.date || '', 10), texte_(d.heure || '', 8), texte_(d.enfant || '', 40)].concat(parts.map(p => "'" + p)));
  const extra = s.getLastRow() - 31;
  if (extra > 0) s.deleteRows(2, extra);
}
function derniere_(ss, enfant) {
  const s = ss.getSheetByName('Sauvegardes');
  if (!s || s.getLastRow() < 2) return '';
  const rows = s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (enfant && String(r[2]) !== enfant) continue;
    return {code: r.slice(3).join(''), quand: jour_(r[0]) + ' ' + heure_(r[1])};
  }
  return null;
}
function heure_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, Session.getScriptTimeZone(), 'HH:mm');
  return String(x).replace(/^'/, '');
}

/* Menu du tableau : « Calcul mental › Copier la dernière sauvegarde ».
   Le code affiché se colle dans l'appli : Espace parents › Restaurer. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Calcul mental')
    .addItem('Copier la dernière sauvegarde', 'montrerSauvegarde')
    .addItem('Recalculer le résumé', 'installer')
    .addItem('Mettre à jour le tableau de bord', 'majTableau')
    .addSeparator()
    .addItem('Voir le résumé maintenant', 'voirResume')
    .addItem('Activer le résumé chaque dimanche (e-mail)', 'activerResumeEmail')
    .addItem('Désactiver le résumé par e-mail', 'desactiverResumeEmail')
    .addSeparator()
    .addItem('Activer les alertes du soir (e-mail)', 'activerAlertesEmail')
    .addItem('Désactiver les alertes par e-mail', 'desactiverAlertesEmail')
    .addToUi();
  // le tableau de bord se remet à jour une fois par jour à l'ouverture (pour que « pas joué depuis… » soit juste)
  try {
    if (PropertiesService.getScriptProperties().getProperty('tableauDu') !== aujourdhui_()) majTableau();
  } catch (err) { /* jamais bloquant */ }
}
function montrerSauvegarde() {
  const ui = SpreadsheetApp.getUi();
  const b = derniere_(SpreadsheetApp.getActiveSpreadsheet(), '');
  if (!b) { ui.alert('Pas encore de sauvegarde. Elle arrive toute seule une fois par jour quand l\'appli est ouverte.'); return; }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    '<p>Sauvegarde du <b>' + esc(b.quand) + '</b>.</p>' +
    '<p>1. Cliquez sur <b>Copier</b>. 2. Dans l\'appli : <b>Espace parents › Restaurer</b>, collez, puis validez.</p>' +
    '<textarea id="c" readonly style="width:100%;height:150px;font-size:11px">' + esc(b.code) + '</textarea>' +
    '<p><button onclick="var t=document.getElementById(\'c\');t.select();try{navigator.clipboard.writeText(t.value).then(function(){document.getElementById(\'m\').textContent=\'Copié !\'},function(){document.execCommand(\'copy\');document.getElementById(\'m\').textContent=\'Copié !\'})}catch(e){document.execCommand(\'copy\');document.getElementById(\'m\').textContent=\'Copié !\'}">Copier</button> <span id="m"></span></p></div>'
  ).setWidth(520).setHeight(330);
  ui.showModalDialog(html, 'Dernière sauvegarde');
}

/** Lancer à la main (choisir « installer » puis ▶ Exécuter) : crée les onglets et recalcule le résumé. */
function installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(20000);
  try { preparer_(ss); resume_(ss); } finally { if (locked) lock.releaseLock(); }
}

function jour_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(x).replace(/^'/, '');
}

function preparer_(ss) {
  let j = ss.getSheetByName('Journal');
  if (!j) {
    j = ss.insertSheet('Journal');
    j.appendRow(COLS);
    j.setFrozenRows(1);
    j.getRange(1, 1, 1, COLS.length).setFontWeight('bold').setBackground('#fff1d8');
    j.setColumnWidth(6, 260); j.setColumnWidth(9, 380); j.setColumnWidth(10, 280);
  }
  let r = ss.getSheetByName('Résumé');
  if (!r) {
    r = ss.insertSheet('Résumé', 0);
  }
  if (!r.getCharts().length) {
    r.setColumnWidth(5, 260); r.setColumnWidth(12, 260); r.setColumnWidth(13, 380); r.setColumnWidth(15, 170); r.setColumnWidth(16, 520);
    const chart = r.newChart().setChartType(Charts.ChartType.LINE)
      .addRange(r.getRange('A2:A62')).addRange(r.getRange('C2:C62'))
      .setNumHeaders(1)
      .setOption('title', 'Score moyen par jour (%)').setOption('legend', {position: 'none'})
      .setOption('vAxis', {viewWindow: {min: 0, max: 100}})
      .setPosition(20, 1, 0, 0).build();
    r.insertChart(chart);
  }
  ['Feuille 1', 'Sheet1'].forEach(n => { const o = ss.getSheetByName(n); if (o && ss.getSheets().length > 2 && o.getLastRow() === 0) ss.deleteSheet(o); });
  return j;
}

function resume_(ss) {
  const j = ss.getSheetByName('Journal'), r = ss.getSheetByName('Résumé');
  const rows = j.getLastRow() > 1 ? j.getRange(2, 1, j.getLastRow() - 1, COLS.length).getValues() : [];
  const etapes = rows.filter(x => x[3] === 'étape' && x[4] !== 'éclair' && x[6] !== '' && !isNaN(Number(x[6])));
  // par jour
  const pj = {};
  etapes.forEach(x => { const k = jour_(x[0]); (pj[k] = pj[k] || []).push(Number(x[6])); });
  const jours = Object.keys(pj).sort().slice(-60).map(k => [texte_(k, 10), pj[k].length, Math.round(pj[k].reduce((a, b) => a + b, 0) / pj[k].length)]);
  // par notion
  const pn = {};
  etapes.filter(x => x[4] === 'calcul' || x[4] === 'français').forEach(x => { const k = x[5]; const o = pn[k] = pn[k] || {s: [], d: ''}; o.s.push(Number(x[6])); o.d = jour_(x[0]); });
  const notions = Object.keys(pn).map(k => [texte_(k, 200), pn[k].s.length, Math.round(pn[k].s.reduce((a, b) => a + b, 0) / pn[k].s.length), texte_(pn[k].d, 10)])
    .sort((a, b) => a[2] - b[2]).slice(0, 60);
  // derniers calculs ratés
  const rates = rows.filter(x => x[8]).slice(-15).reverse().map(x => [texte_(jour_(x[0]), 10), texte_(heure_(x[1]), 8), texte_(x[5], 200), texte_(x[8], 600)]);
  // bilans de la semaine (envoyés par l'appli au 1er lancement de chaque semaine)
  const semaines = rows.filter(x => x[3] === 'bilan de la semaine').slice(-8).reverse().map(x => [texte_(String(x[5]).replace(/^'/, ''), 60), texte_(String(x[9]).replace(/^'/, ''), 600)]);
  r.getRange('A1:P200').clearContent();
  r.getRange('A1').setValue('Chaque jour (programme « Apprendre »)').setFontWeight('bold');
  r.getRange('E1').setValue('Par notion (les plus difficiles en haut)').setFontWeight('bold');
  r.getRange('J1').setValue('Les 15 derniers calculs ratés').setFontWeight('bold');
  r.getRange(2, 1, 1, 3).setValues([['Jour', 'Étapes', 'Score moyen %']]).setFontWeight('bold');
  if (jours.length) r.getRange(3, 1, jours.length, 3).setValues(jours);
  r.getRange(2, 5, 1, 4).setValues([['Notion', 'Fois', 'Score moyen %', 'Dernière fois']]).setFontWeight('bold');
  if (notions.length) r.getRange(3, 5, notions.length, 4).setValues(notions);
  r.getRange(2, 10, 1, 4).setValues([['Jour', 'Heure', 'Notion', 'Calculs ratés']]).setFontWeight('bold');
  if (rates.length) r.getRange(3, 10, rates.length, 4).setValues(rates);
  r.setColumnWidth(15, 170); r.setColumnWidth(16, 520);
  r.getRange('O1').setValue('Bilans de la semaine (les 8 derniers)').setFontWeight('bold');
  r.getRange(2, 15, 1, 2).setValues([['Semaine', 'Bilan']]).setFontWeight('bold');
  if (semaines.length) r.getRange(3, 15, semaines.length, 2).setValues(semaines).setWrap(true);
  if (!jours.length) r.getRange('A3').setValue('Pas encore de données');
  try { tableau_(ss, rows); } catch (err) { /* le tableau de bord ne doit jamais empêcher le résumé */ }
}

/** Menu : recalcule seulement le tableau de bord. */
function majTableau() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  tableau_(ss, journal_(ss));
}
function journal_(ss) {
  const j = ss.getSheetByName('Journal');
  return j && j.getLastRow() > 1 ? j.getRange(2, 1, j.getLastRow() - 1, COLS.length).getValues() : [];
}

/* ---------- Onglet « Tableau de bord » : l'essentiel en un coup d'œil, lisible sur téléphone ----------
   Une seule colonne de texte (A, 360 px), gros caractères, les alertes en haut, les graphiques en dessous. */
function tableau_(ss, rows) {
  let t = ss.getSheetByName('Tableau de bord');
  if (!t) { t = ss.insertSheet('Tableau de bord', 0); }
  t.getCharts().forEach(c => t.removeChart(c));
  t.clear();
  const today = aujourdhui_(), st = stats_(rows, today);
  const jn = x => jour_(x[0]);
  const etapes = rows.filter(x => x[3] === 'étape' && x[4] !== 'éclair' && x[6] !== '' && !isNaN(Number(x[6])));
  const finis = rows.filter(x => x[3] === 'programme fini');
  // par jour (30 derniers jours) : données des graphiques
  const pj = {};
  for (let k = 29; k >= 0; k--) pj[plus_(today, -k)] = {n: 0, s: 0, fini: false};
  etapes.forEach(x => { const d = jn(x); if (pj[d]) { pj[d].n++; pj[d].s += Number(x[6]); } });
  finis.forEach(x => { const d = jn(x); if (pj[d]) pj[d].fini = true; });
  const jours = Object.keys(pj).sort();
  // ce qui coince encore (dernier verdict « pas encore » depuis moins de 15 jours) et dernières réussites
  const dernier = {};
  etapes.filter(x => x[4] === 'calcul' || x[4] === 'français').forEach(x => {
    const nm = String(x[5]).replace(/^'/, ''), v = String(x[7]).replace(/^'/, '');
    dernier[nm] = {v: v, d: jn(x), s: Number(x[6])};
  });
  const coince = st.coince.map(o => '• ' + o.n + (o.fois > 1 ? ' (' + o.fois + ' fois difficile cette semaine)' : ''));
  Object.keys(dernier).filter(n => /pas encore/.test(dernier[n].v) && ecart_(today, dernier[n].d) < 15 && !st.coince.some(o => o.n === n))
    .forEach(n => coince.push('• ' + n));
  const reussies = Object.keys(dernier).filter(n => REUSSI_.test(dernier[n].v)).sort((a, b) => dernier[b].d < dernier[a].d ? -1 : 1).slice(0, 5);
  // le texte, de haut en bas
  const L = [['Calcul mental — tableau de bord', 'titre'],
    ['Mis à jour ' + quand_(today, maintenant_(), today) + (st.derniere ? '. Dernière activité : ' + quand_(st.derniere.d, st.derniere.h, today) + '.' : '.'), 'note']];
  if (!st.total) {
    L.push(['Pas encore de données. Dès que ' + st.qui + ' utilisera Pythagore, tout s\'affichera ici.', 'texte']);
  } else {
    alertes_(st).forEach(x => L.push(x));
    L.push(['Les 7 derniers jours', 'h']);
    bref_(st).forEach(x => L.push([x, 'texte']));
    L.push(['Ça coince (à surveiller)', 'h']);
    (coince.length ? coince.slice(0, 5) : ['Rien de bloquant en ce moment.']).forEach(x => L.push([x, 'texte']));
    L.push(['Dernières réussites', 'h']);
    (reussies.length ? reussies.map(n => '• ' + n) : ['Pas encore de notion réussie.']).forEach(x => L.push([x, 'texte']));
    L.push(['Nos idées pour vous', 'h']);
    st.idees.forEach(x => L.push(['• ' + x, 'idee']));
  }
  L.push(['Détail jour par jour : onglet « Résumé ». Bilan de chaque semaine : onglet « Résumé de la semaine ».', 'note']);
  ecrire_(t, 1, L);
  t.setColumnWidth(1, 360);
  t.setFrozenRows(1);
  // données des graphiques (colonnes H à J, masquées : on n'a pas besoin de les voir)
  t.getRange(1, 8, 1, 3).setValues([['Jour', 'Étapes', 'Réussite %']]).setFontWeight('bold');
  t.getRange(2, 8, jours.length, 3).setValues(jours.map(d => ["'" + d.slice(5).split('-').reverse().join('/'), pj[d].n, pj[d].n ? Math.round(pj[d].s / pj[d].n) : null]));
  t.setColumnWidths(8, 3, 70);
  t.hideColumns(8, 3);
  const r0 = L.length + 2, montrer = Charts.ChartHiddenDimensionStrategy.SHOW_BOTH;
  const g1 = t.newChart().setChartType(Charts.ChartType.COLUMN).addRange(t.getRange(1, 8, jours.length + 1, 1)).addRange(t.getRange(1, 9, jours.length + 1, 1))
    .setNumHeaders(1).setHiddenDimensionStrategy(montrer).setOption('title', 'Étapes faites par jour (30 jours)').setOption('legend', {position: 'none'}).setOption('colors', ['#0b6e99'])
    .setPosition(r0, 1, 0, 0).setOption('width', 350).setOption('height', 220).build();
  const g2 = t.newChart().setChartType(Charts.ChartType.LINE).addRange(t.getRange(1, 8, jours.length + 1, 1)).addRange(t.getRange(1, 10, jours.length + 1, 1))
    .setNumHeaders(1).setHiddenDimensionStrategy(montrer).setOption('title', 'Réussite par jour (%)').setOption('legend', {position: 'none'}).setOption('colors', ['#138548'])
    .setOption('vAxis', {viewWindow: {min: 0, max: 100}}).setOption('interpolateNulls', true)
    .setPosition(r0 + 12, 1, 0, 0).setOption('width', 350).setOption('height', 220).build();
  t.insertChart(g1); t.insertChart(g2);
  try { PropertiesService.getScriptProperties().setProperty('tableauDu', today); } catch (err) { /* pas grave */ }
  return st;
}

/* ====================== Calculs communs : semaine, alertes, idées pour le parent ====================== */
const JEU_ = /^(étape|programme fini|lecture du soir|lecture à voix haute|grand bilan)$/;   // ce qui compte comme « a joué »
const REUSSI_ = /appris|déjà su|retenu/;
const COINCE_ = /ça coince|ca coince/i;
const MOIS_ = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_ = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function tz_() { try { return Session.getScriptTimeZone() || 'Europe/Paris'; } catch (err) { return 'Europe/Paris'; } }
function aujourdhui_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function maintenant_() { return Utilities.formatDate(new Date(), tz_(), 'HH:mm'); }
/* dates « 2026-10-14 » : calculs en jours entiers, sans souci d'heure d'été */
function ymd_(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
function ecart_(a, b) { return Math.round((ymd_(a) - ymd_(b)) / 864e5); }   // nombre de jours entre b et a
function plus_(s, k) { return new Date(ymd_(s) + k * 864e5).toISOString().slice(0, 10); }
function num_(d) { const j = d.getUTCDate(); return j === 1 ? '1er' : String(j); }
function frJour_(s, avecNom) { const d = new Date(ymd_(s)); return (avecNom ? JOURS_[d.getUTCDay()] + ' ' : '') + num_(d) + ' ' + MOIS_[d.getUTCMonth()]; }
function frSemaine_(a, b) {
  const A = new Date(ymd_(a)), B = new Date(ymd_(b)), fin = num_(B) + ' ' + MOIS_[B.getUTCMonth()] + ' ' + B.getUTCFullYear();
  if (A.getUTCFullYear() !== B.getUTCFullYear()) return num_(A) + ' ' + MOIS_[A.getUTCMonth()] + ' ' + A.getUTCFullYear() + ' au ' + fin;
  if (A.getUTCMonth() !== B.getUTCMonth()) return num_(A) + ' ' + MOIS_[A.getUTCMonth()] + ' au ' + fin;
  return num_(A) + ' au ' + fin;
}
function frMin_(m) { return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''); }
function quand_(d, h, today) {
  const k = ecart_(today, d);
  return (k === 0 ? 'aujourd\'hui' : k === 1 ? 'hier' : 'le ' + frJour_(d, true)) + (/^\d{1,2}:\d{2}/.test(h || '') ? ' à ' + h.replace(':', ' h ') : '');
}
function pl_(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }

/* Lignes du journal → objets propres, triés par date et heure (une ligne arrivée en retard reprend sa place). */
function lignes_(rows) {
  const s = x => String(x === undefined || x === null ? '' : x).replace(/^'/, '').trim();
  return rows.map((x, i) => {
    const sc = (x[6] === '' || x[6] === null || x[6] === undefined || isNaN(Number(x[6]))) ? null : Number(x[6]);
    return {i: i, d: jour_(x[0]).slice(0, 10), h: s(heure_(x[1])), enfant: s(x[2]), type: s(x[3]), dom: s(x[4]), notion: s(x[5]),
      score: sc, verdict: s(x[7]), erreurs: s(x[8]), detail: s(x[9])};
  }).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.d))
    .sort((a, b) => { const ka = a.d + ' ' + a.h, kb = b.d + ' ' + b.h; return ka < kb ? -1 : ka > kb ? 1 : a.i - b.i; });
}

/* Temps passé (estimation) : chaque étape compte ~3 min, une lecture du soir sa durée ; les moments proches (moins de 15 min d'écart) se regroupent. */
function minutes_(L) {
  const pj = {};
  L.forEach(x => {
    if (!JEU_.test(x.type) && x.type !== 'ouverture') return;
    const m = /^(\d{1,2}):(\d{2})/.exec(x.h); if (!m) return;
    const fin = +m[1] * 60 + +m[2], mm = /(\d+) min\b/.exec(x.detail);
    const duree = x.type === 'ouverture' ? 0 : (x.type === 'lecture du soir' && mm) ? Math.min(60, +mm[1]) : 3;
    (pj[x.d] = pj[x.d] || []).push([fin - duree, fin]);
  });
  let tot = 0;
  Object.keys(pj).forEach(d => {
    let a = null, b = null, t = 0;
    pj[d].sort((u, v) => u[0] - v[0]).forEach(iv => {
      if (a === null || iv[0] > b + 15) { if (a !== null) t += b - a; a = iv[0]; b = iv[1]; } else b = Math.max(b, iv[1]);
    });
    if (a !== null) t += b - a;
    tot += Math.min(t, 180);
  });
  return tot;
}

function periode_(L) {
  const moy = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null;
  const et = L.filter(x => x.type === 'étape' && x.dom !== 'éclair' && x.score !== null);
  const soir = L.filter(x => x.type === 'lecture du soir');
  const voix = L.filter(x => x.type === 'lecture à voix haute' || (x.type === 'étape' && x.dom === 'lecture'));
  const wpm = L.filter(x => /lecture/.test(x.type) || x.dom === 'lecture').map(x => /(\d+) mots\/min/.exec(x.detail)).filter(Boolean).map(m => +m[1]);
  return {
    jours: new Set(L.filter(x => JEU_.test(x.type)).map(x => x.d)).size,
    finis: new Set(L.filter(x => x.type === 'programme fini').map(x => x.d)).size,
    min: minutes_(L), reussite: moy(et.map(x => x.score)), soir: soir.length, voix: voix.length, wpm: moy(wpm),
    soirMin: soir.reduce((s, x) => { const m = /(\d+) min\b/.exec(x.detail); return s + (m ? +m[1] : 0); }, 0)
  };
}

/** Tout ce qu'il faut savoir sur les 7 derniers jours (aujourd'hui compris) et les 7 d'avant. */
function stats_(rows, today) {
  const L = lignes_(rows).filter(x => ecart_(today, x.d) >= 0);
  const nom = (L.filter(x => x.enfant).pop() || {}).enfant || '';
  const qui = nom || 'votre enfant';
  const dans = (a, b) => L.filter(x => { const k = ecart_(today, x.d); return k >= a && k <= b; });
  const cur = periode_(dans(0, 6)), prev = periode_(dans(7, 13));
  const jeu = L.filter(x => JEU_.test(x.type));
  const dernierJeu = jeu.length ? jeu[jeu.length - 1] : null;
  const depuis = dernierJeu ? ecart_(today, dernierJeu.d) : null;
  const premiereSemaine = !jeu.length || ecart_(today, jeu[0].d) < 7;
  // notions (calcul, français, et toute étape marquée « ça coince ») : leurs essais dans l'ordre
  const pn = {};
  L.filter(x => x.type === 'étape' && x.notion && (x.dom === 'calcul' || x.dom === 'français' || COINCE_.test(x.detail + ' ' + x.notion)))
    .forEach(x => (pn[x.notion] = pn[x.notion] || []).push(x));
  const dur = x => (x.score !== null && x.score < 50) || /pas encore/.test(x.verdict) || COINCE_.test(x.detail + ' ' + x.notion);
  const bien = x => REUSSI_.test(x.verdict) || (x.score !== null && x.score >= 80 && !/pas encore/.test(x.verdict));
  const der = n => pn[n][pn[n].length - 1];
  const appris = {};
  Object.keys(pn).forEach(n => { const a = pn[n].find(x => REUSSI_.test(x.verdict)); if (a) appris[n] = a.d; });
  const nouvelles = Object.keys(appris).filter(n => ecart_(today, appris[n]) <= 6);
  // réussies cette semaine : les nouvelles d'abord
  const reussiesSemaine = Object.keys(pn).filter(n => pn[n].some(x => ecart_(today, x.d) <= 6 && REUSSI_.test(x.verdict)))
    .sort((a, b) => (nouvelles.indexOf(b) >= 0) - (nouvelles.indexOf(a) >= 0))
    .map(n => {
      const v = pn[n].filter(x => ecart_(today, x.d) <= 6 && REUSSI_.test(x.verdict)).pop().verdict;
      return {n: n, mot: /retenu/.test(v) ? 'bien retenue' : /déjà su/.test(v) ? 'déjà sue' : 'apprise', remontee: bien(der(n)) && pn[n].some(dur)};
    });
  // ce qui coince cette semaine (et pas encore réussi depuis)
  const coince = Object.keys(pn).map(n => ({n: n, fois: pn[n].filter(x => ecart_(today, x.d) <= 6 && dur(x)).length}))
    .filter(o => o.fois > 0 && !bien(der(o.n))).sort((a, b) => b.fois - a.fois).slice(0, 5);
  // ce qui BLOQUE vraiment : au moins 3 essais sous 50 % en 2 semaines, ou « ça coince » cette semaine, et le dernier essai est encore difficile
  const bloque = Object.keys(pn).map(n => {
    const bas = pn[n].filter(x => ecart_(today, x.d) <= 13 && x.score !== null && x.score < 50).length;
    const cc = pn[n].filter(x => ecart_(today, x.d) <= 6 && COINCE_.test(x.detail + ' ' + x.notion));
    const rv = cc.length ? /on revoit « ([^»]+) »/.exec(cc[cc.length - 1].detail) : null;
    return {n: n, bas: bas, coince: cc.length > 0, revoir: rv ? rv[1].trim() : '', der: der(n)};
  }).filter(o => dur(o.der) && (o.bas >= 3 || o.coince)).sort((a, b) => b.bas - a.bas).slice(0, 3);
  // alertes (ton doux, et toujours une piste concrète)
  const alertes = [];
  if (dernierJeu && depuis >= 2) alertes.push({cle: 'inactif:' + dernierJeu.d, type: 'inactif', jours: depuis,
    texte: 'Pas joué depuis ' + depuis + ' jours (dernière fois : ' + frJour_(dernierJeu.d, true) + '). ' +
      (depuis < 7 ? 'Un petit mot gentil suffit souvent : « On fait juste 10 minutes ensemble ? »'
                  : 'Pas d\'inquiétude : on reprend en douceur, 10 minutes suffisent, Pythagore s\'adapte.')});
  bloque.forEach((o, i) => alertes.push({cle: 'bloque:' + o.n + ':' + o.der.d, type: 'bloque',
    texte: '« ' + o.n + ' » coince un peu' + (o.bas >= 3 ? ' : ' + o.bas + ' essais sous 50 % en 2 semaines.' : '.') +
      (o.coince ? ' Pythagore a déjà changé de méthode' + (o.revoir ? ' et fait revoir « ' + o.revoir + ' »' : '') + '.' : '') +
      (i === 0 ? ' Une idée simple pour l\'aider : voir plus bas.'   // l'astuce est dans « Nos idées pour vous »
               : ' 5 minutes ensemble, sans écran, peuvent débloquer : ' + astuce_(o.n) + '.')}));
  // idées pour le parent : 1 pour féliciter, 1 pour aider
  const idees = [];
  const rem = reussiesSemaine.find(o => o.remontee);
  if (rem) idees.push('Félicitez ' + qui + ' pour « ' + rem.n + ' » : ça coinçait, et c\'est réussi maintenant !');
  else if (reussiesSemaine.length) idees.push('Félicitez ' + qui + ' pour « ' + reussiesSemaine[0].n + ' » : c\'est réussi cette semaine.');
  else if (cur.jours >= 4) idees.push('Félicitez ' + qui + ' pour sa régularité : ' + cur.jours + ' jours sur 7.');
  else if (cur.jours >= 1) idees.push('Félicitez ' + qui + ' pour ' + (cur.jours === 1 ? 'sa séance' : 'ses ' + cur.jours + ' séances') + ' : chaque petit moment compte.');
  const aide = bloque.length ? bloque[0].n : coince.length ? coince[0].n : '';
  if (aide) idees.push('Faites 5 minutes de « ' + aide + ' » avec ' + qui + ' : ' + astuce_(aide) + '.');
  else if (dernierJeu && (depuis >= 2 || (cur.jours < 4 && !premiereSemaine))) idees.push('Choisissez avec ' + qui + ' un petit moment fixe chaque jour (par exemple après le goûter) : 10 minutes régulières valent mieux qu\'une longue séance.');
  else if (cur.jours && !cur.soir && !cur.voix) idees.push('Proposez une lecture du soir à deux cette semaine : une page chacun.');
  else if (cur.jours) idees.push('Demandez à ' + qui + ' de vous montrer sa notion préférée de la semaine dans Pythagore : expliquer, c\'est retenir.');
  if (!idees.length) idees.push('Proposez à ' + qui + ' de découvrir Pythagore : 10 minutes suffisent, par exemple après le goûter.');
  return {today: today, nom: nom, qui: qui, total: L.length, cur: cur, prev: prev, derniere: L.length ? L[L.length - 1] : null,
    depuis: depuis, premiereSemaine: premiereSemaine, nApp: Object.keys(appris).length, nouvelles: nouvelles,
    reussiesSemaine: reussiesSemaine, coince: coince, bloque: bloque, alertes: alertes, idees: idees.slice(0, 2)};
}

/* Une idée concrète, à faire sans écran, selon la notion. */
function astuce_(n) {
  const t = /table de (\d+)/i.exec(n);
  if (t) return 'récitez la table de ' + t[1] + ' ensemble en marchant, ou en vous lançant une balle à chaque résultat';
  if (/table|multipl/i.test(n)) return 'jouez aux cartes : on retourne deux cartes et on multiplie';
  if (/fraction/i.test(n)) return 'partagez une pizza ou une tablette de chocolat en parts égales et nommez les morceaux';
  if (/divis|partag/i.test(n)) return 'partagez des bonbons ou des pièces en parts égales';
  if (/posée/i.test(n)) return 'posez une opération sur une feuille ensemble, en disant chaque étape à voix haute';
  if (/monnaie|euro|prix/i.test(n)) return 'jouez à la marchande avec de vraies pièces';
  if (/mesure|mètre|litre|gramme|masse|longueur|durée/i.test(n)) return 'mesurez ou pesez ensemble de vrais objets de la maison';
  if (/addition|soustraction|dizaine|complément|calcul|nombre|double|moitié/i.test(n)) return 'comptez ensemble les prix ou la monnaie en faisant les courses';
  if (/conjug|verbe|présent|futur|imparfait|passé/i.test(n)) return 'lisez ensemble quelques phrases d\'un livre et cherchez les verbes';
  if (/accord|pluriel|féminin|orthographe|homophone|dictée|son /i.test(n)) return 'faites une mini-dictée de 3 phrases, puis corrigez ensemble';
  if (/lecture|lire|mot/i.test(n)) return 'lisez à deux voix, une phrase chacun';
  return 'demandez-lui de vous l\'expliquer, comme un petit professeur';
}

/* Les chiffres clés, en phrases courtes. */
function bref_(st) {
  const c = st.cur, p = st.prev, cmp = !(st.premiereSemaine && p.jours === 0);
  const av = v => cmp ? ' (avant : ' + v + ')' : '';
  const out = ['Joué ' + pl_(c.jours, 'jour') + ' sur 7' + av(p.jours),
               'Programme du jour fini : ' + c.finis + ' fois sur 7' + av(p.finis)];
  if (c.min || p.min) out.push('Temps passé : environ ' + frMin_(c.min) + av(frMin_(p.min)));
  if (c.reussite === null) out.push('Réussite moyenne : pas d\'exercice noté');
  else {
    const comp = cmp && p.reussite !== null;
    const tend = !comp ? '' : c.reussite >= p.reussite + 5 ? ', en progrès' : c.reussite <= p.reussite - 5 ? ', un peu moins bien' : ', stable';
    out.push('Réussite moyenne : ' + c.reussite + ' %' + tend + (comp ? ' (avant : ' + p.reussite + ' %)' : ''));
  }
  const lec = [];
  if (c.soir) lec.push(pl_(c.soir, 'lecture') + ' du soir' + (c.soirMin ? ' (' + frMin_(c.soirMin) + ')' : ''));
  if (c.voix) lec.push(c.voix + ' à voix haute');
  out.push('Lecture : ' + (lec.length ? lec.join(', ') + (c.wpm ? ', ' + c.wpm + ' mots/min' : '') : 'pas de lecture'));
  const nv = st.nouvelles.length;
  out.push('Notions apprises : ' + st.nApp + ' en tout' + (!st.nApp ? '' : nv ? ', dont ' + nv + ' nouvelle' + (nv > 1 ? 's' : '') + ' cette semaine' : ', aucune nouvelle cette semaine'));
  return out;
}

/* Bloc d'alertes (ou un mot rassurant). */
function alertes_(st) {
  if (!st.alertes.length) return [['Tout va bien : rien d\'inquiétant en ce moment.', 'ok']];
  return [['À regarder', 'alerteTitre']].concat(st.alertes.map(a => [a.texte, 'alerte']));
}

/* Écrit des lignes [texte, style] dans la colonne A, à partir de la ligne r0 (une seule colonne, texte à la ligne). */
const STYLES_ = {   // taille, gras, couleur, fond
  titre: [15, 'bold', '#0b3d66', '#e8f1fb'], h: [13, 'bold', '#222222', '#ffffff'], texte: [12, 'normal', '#222222', '#ffffff'],
  idee: [12, 'normal', '#0b3d66', '#ffffff'], note: [12, 'normal', '#666666', '#ffffff'], ok: [12, 'bold', '#138548', '#eef8f1'],
  alerteTitre: [13, 'bold', '#8a4b00', '#fff4e5'], alerte: [12, 'normal', '#5c3300', '#fff4e5'], vide: [12, 'normal', '#222222', '#ffffff']
};
function ecrire_(sh, r0, lignes) {
  if (!lignes.length) return;
  const st = l => STYLES_[l[1]] || STYLES_.texte;
  sh.getRange(r0, 1, lignes.length, 1)
    .setValues(lignes.map(l => [l[0] === '' ? '' : "'" + l[0]]))
    .setFontSizes(lignes.map(l => [st(l)[0]])).setFontWeights(lignes.map(l => [st(l)[1]]))
    .setFontColors(lignes.map(l => [st(l)[2]])).setBackgrounds(lignes.map(l => [st(l)[3]]))
    .setWrap(true).setVerticalAlignment('middle');
}

/* ====================== Résumé de la semaine (onglet + e-mail du dimanche) ====================== */

/** Lancé chaque dimanche vers 18 h (si activé) : écrit le résumé et l'envoie par e-mail. */
function resumeSemaine() { return construireResume_(false); }
/** Menu « Voir le résumé maintenant » : écrit le résumé (sans e-mail) et ouvre l'onglet. */
function voirResume() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  construireResume_(true);
  const s = ss.getSheetByName('Résumé de la semaine');
  ss.setActiveSheet(s); s.getRange('A1').activate();
  ss.toast('Le résumé des 7 derniers jours est en haut de cet onglet.', 'Résumé de la semaine', 5);
}

function construireResume_(apercu) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(20000);
  let st, lignes;
  try {
    const rows = journal_(ss), today = aujourdhui_();
    st = stats_(rows, today);
    lignes = lignesSemaine_(st, apercu);
    ecrireSemaine_(ss, lignes, today, apercu);
    try { tableau_(ss, rows); } catch (err) { /* le tableau de bord ne doit jamais empêcher le résumé */ }
  } finally { if (locked) lock.releaseLock(); }
  let envoye = false;
  if (!apercu && actif_('resumeEmail')) {
    envoye = envoyerMail_(ss, 'Pythagore : la semaine de ' + st.qui + ' (du ' + frSemaine_(plus_(st.today, -6), st.today) + ')',
      lignes.concat([['Pour ne plus recevoir ce résumé : menu « Calcul mental › Désactiver le résumé par e-mail ».', 'note']]));
    if (envoye) noterEnvoyees_(st.alertes, st.today);   // les alertes du soir ne répéteront pas la même chose
  }
  return {lignes: lignes, envoye: envoye};
}

function lignesSemaine_(st, apercu) {
  const L = [['Semaine du ' + frSemaine_(plus_(st.today, -6), st.today), 'titre'],
    [(st.nom ? st.nom + ' · ' : '') + (apercu ? 'aperçu du ' + frJour_(st.today, true) : 'les 7 derniers jours') +
      (st.premiereSemaine ? '' : ', comparés aux 7 jours d\'avant'), 'note']];
  if (!st.total) {
    L.push(['Pas encore de données : ce résumé se remplira dès que ' + st.qui + ' aura utilisé Pythagore.', 'texte'], ['', 'vide']);
    return L;
  }
  alertes_(st).forEach(x => L.push(x));
  L.push(['En bref', 'h']);
  bref_(st).forEach(x => L.push([x, 'texte']));
  L.push(['Réussi cette semaine', 'h']);
  if (st.reussiesSemaine.length) st.reussiesSemaine.slice(0, 6).forEach(o => L.push(['• ' + o.n + ' (' + o.mot + ')', 'texte']));
  else L.push(['Pas de nouvelle notion réussie cette semaine.', 'texte']);
  L.push(['Ce qui coince encore', 'h']);
  if (st.coince.length) st.coince.forEach(o => L.push(['• ' + o.n + (o.fois > 1 ? ' (' + o.fois + ' fois difficile)' : ''), 'texte']));
  else L.push(['Rien de bloquant.', 'texte']);
  L.push(['Nos idées pour vous', 'h']);
  st.idees.forEach(x => L.push(['• ' + x, 'idee']));
  if (st.premiereSemaine) L.push(['Première semaine : la comparaison avec la semaine d\'avant arrivera la semaine prochaine.', 'note']);
  L.push(['', 'vide']);
  return L;
}

/* Onglet « Résumé de la semaine » : la semaine la plus récente en haut, les précédentes en dessous (52 au plus).
   Colonne B (masquée) : un repère « fin:AAAA-MM-JJ:auto|apercu » sur la 1re ligne de chaque semaine.
   Un aperçu de moins de 7 jours (ou un résumé du même jour) est remplacé par le nouveau. */
function ecrireSemaine_(ss, lignes, today, apercu) {
  let s = ss.getSheetByName('Résumé de la semaine');
  if (!s) {
    s = ss.insertSheet('Résumé de la semaine', Math.min(1, ss.getSheets().length));
    s.getRange('A1').setValue('Résumé de la semaine (le plus récent en haut)').setFontSize(14).setFontWeight('bold').setFontColor('#0b3d66').setWrap(true);
    s.setFrozenRows(1);
    s.setColumnWidth(1, 360);
    s.hideColumns(2);
  }
  const reperes = () => {
    const last = s.getLastRow();
    return last < 2 ? [] : s.getRange(2, 2, last - 1, 1).getValues().map((v, i) => [i + 2, String(v[0])]).filter(x => /^fin:/.test(x[1]));
  };
  const avant = reperes();
  let remplacer = 0;   // nombre de lignes de l'ancien bloc du haut à enlever
  if (avant.length && avant[0][0] === 2) {
    const m = /^fin:(\d{4}-\d{2}-\d{2}):(\w+)/.exec(avant[0][1]);
    if (m && (m[1] === today || (m[2] === 'apercu' && ecart_(today, m[1]) < 7))) remplacer = (avant[1] ? avant[1][0] : s.getLastRow() + 1) - 2;
  }
  // on insère d'abord (jamais de feuille vide), puis on enlève l'ancien aperçu
  s.insertRowsBefore(2, lignes.length);
  ecrire_(s, 2, lignes);
  s.getRange(2, 2).setValue("'fin:" + today + ':' + (apercu ? 'apercu' : 'auto'));
  if (remplacer > 0) s.deleteRows(2 + lignes.length, remplacer);
  const apres = reperes();
  if (apres.length > 52) s.deleteRows(apres[52][0], s.getLastRow() - apres[52][0] + 1);
}

/* ====================== Alertes du soir (e-mail seulement s'il y a quelque chose) ====================== */

/** Lancé chaque soir vers 19 h (si activé). Remet le tableau de bord à jour, et écrit au parent s'il y a une NOUVELLE alerte.
    Au plus un e-mail par alerte et par jour ; « pas joué » : rappel au 2e, 3e jour, puis une fois par semaine ;
    « ça bloque » : une seule fois, sauf si un nouvel essai difficile arrive. */
function verifierAlertes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), today = aujourdhui_(), rows = journal_(ss);
  const st = stats_(rows, today);
  try { tableau_(ss, rows); } catch (err) { /* jamais bloquant */ }
  if (!actif_('alertesEmail')) return [];
  const deja = lireEnvoyees_(today);
  const nouv = st.alertes.filter(a => a.type === 'inactif'
    ? deja[a.cle] !== today && (a.jours === 2 || a.jours === 3 || a.jours % 7 === 0)
    : !deja[a.cle]);
  if (!nouv.length) return [];
  const lignes = [['Un petit point à regarder', 'titre'], [(st.nom ? st.nom + ' · ' : '') + frJour_(today, true), 'note'], ['À regarder', 'alerteTitre']]
    .concat(nouv.map(a => [a.texte, 'alerte']), [['Nos idées pour vous', 'h']], st.idees.map(x => ['• ' + x, 'idee']),
      [['Rien d\'urgent : c\'est juste pour vous tenir au courant. Pour ne plus recevoir ces e-mails : menu « Calcul mental › Désactiver les alertes par e-mail ».', 'note']]);
  if (envoyerMail_(ss, 'Pythagore : un petit point à regarder pour ' + st.qui, lignes)) noterEnvoyees_(nouv, today);
  return nouv;
}
function lireEnvoyees_(today) {
  let o = {};
  try { o = JSON.parse(PropertiesService.getScriptProperties().getProperty('alertesEnvoyees') || '{}') || {}; } catch (err) { o = {}; }
  Object.keys(o).forEach(k => { if (!(ecart_(today, o[k]) <= 30)) delete o[k]; });   // on oublie au bout d'un mois
  return o;
}
function noterEnvoyees_(alertes, today) {
  if (!alertes.length) return;
  const o = lireEnvoyees_(today);
  alertes.forEach(a => { o[a.cle] = today; });
  PropertiesService.getScriptProperties().setProperty('alertesEnvoyees', JSON.stringify(o));
}

/* ====================== E-mails : seulement au propriétaire du tableau, rien d'autre ====================== */
function actif_(cle) { return PropertiesService.getScriptProperties().getProperty(cle) === 'oui'; }
function adresse_() {
  const p = PropertiesService.getScriptProperties().getProperty('emailParent');
  if (p) return p;
  try { return Session.getEffectiveUser().getEmail() || ''; } catch (err) { return ''; }
}
function envoyerMail_(ss, sujet, lignes) {
  const to = adresse_();
  if (!to) return false;
  let url = '';
  try { url = ss.getUrl(); } catch (err) { url = ''; }
  const lg = lignes.filter(l => l[0] !== '');
  const texte = lg.map((l, i) => l[1] === 'titre' ? l[0].toUpperCase()
    : l[1] === 'h' || l[1] === 'alerteTitre' ? '\n' + l[0] + ' :' : l[1] === 'alerte' ? '→ ' + l[0]
    : (l[1] === 'note' && i === lg.length - 1) ? '\n' + l[0] : l[0]).join('\n') +
    (url ? '\n\nVotre tableau de suivi : ' + url : '');
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const css = {titre: 'font-size:20px;font-weight:bold;color:#0b3d66;margin:0 0 4px',
    h: 'font-size:16px;font-weight:bold;margin:18px 0 4px', texte: 'margin:4px 0', idee: 'margin:6px 0;color:#0b3d66',
    note: 'margin:6px 0;color:#666;font-size:13px', ok: 'margin:12px 0;color:#138548;font-weight:bold',
    alerteTitre: 'margin:14px 0 0;padding:8px 12px;background:#fff4e5;color:#8a4b00;font-weight:bold;font-size:16px;border-radius:8px 8px 0 0',
    alerte: 'margin:0;padding:6px 12px 10px;background:#fff4e5;color:#5c3300'};
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.45;color:#222;max-width:520px">' +
    lg.map(l => '<p style="' + (css[l[1]] || css.texte) + '">' + esc(l[0]) + '</p>').join('') +
    (url ? '<p style="margin:18px 0 0"><a href="' + esc(url) + '">Ouvrir le tableau de suivi</a></p>' : '') + '</div>';
  try {
    MailApp.sendEmail({to: to, subject: sujet, body: texte, htmlBody: html, name: 'Suivi Pythagore'});
    return true;
  } catch (err) { console.error('e-mail non envoyé : ' + err); return false; }
}

/* ====================== Menu : activer / désactiver les e-mails ====================== */
function activerResumeEmail() {
  const ok = activer_('resumeEmail', 'resumeSemaine', b => b.onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18));
  if (!ok) return;
  try { construireResume_(true); } catch (err) { /* l'aperçu n'est qu'un bonus */ }
  SpreadsheetApp.getUi().alert('C\'est activé !\n\nChaque dimanche vers 18 h, le résumé de la semaine arrivera à : ' + ok +
    '\n\nLe résumé de cette semaine est déjà dans l\'onglet « Résumé de la semaine ».\nPour arrêter : menu Calcul mental › Désactiver le résumé par e-mail.');
}
function desactiverResumeEmail() {
  desactiver_('resumeEmail', 'resumeSemaine');
  SpreadsheetApp.getUi().alert('C\'est fait : plus d\'e-mail le dimanche.\nL\'onglet « Résumé de la semaine » reste disponible avec « Voir le résumé maintenant ».');
}
function activerAlertesEmail() {
  const ok = activer_('alertesEmail', 'verifierAlertes', b => b.everyDays(1).atHour(19));
  if (!ok) return;
  SpreadsheetApp.getUi().alert('C\'est activé !\n\nChaque soir vers 19 h, le tableau vérifie si tout va bien. Vous recevrez un e-mail à ' + ok +
    ' SEULEMENT s\'il y a quelque chose à regarder (pas joué depuis 2 jours, une notion qui bloque).\nPour arrêter : menu Calcul mental › Désactiver les alertes par e-mail.');
}
function desactiverAlertesEmail() {
  desactiver_('alertesEmail', 'verifierAlertes');
  SpreadsheetApp.getUi().alert('C\'est fait : plus d\'e-mail d\'alerte.\nLes alertes restent visibles en haut du « Tableau de bord ».');
}
/* Installe le déclencheur (jamais en double) et retient le choix. Renvoie l'adresse, ou '' si impossible. */
function activer_(cle, fn, regle) {
  const email = (() => { try { return Session.getEffectiveUser().getEmail() || ''; } catch (err) { return ''; } })() || adresse_();
  if (!email) {
    SpreadsheetApp.getUi().alert('Je ne trouve pas votre adresse e-mail. Ouvrez ce tableau avec le compte Google qui le possède, puis réessayez.');
    return '';
  }
  const t = ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === fn);
  t.slice(1).forEach(x => ScriptApp.deleteTrigger(x));   // s'il y en avait plusieurs, on n'en garde qu'un
  if (!t.length) regle(ScriptApp.newTrigger(fn).timeBased()).inTimezone(tz_()).create();
  const p = {emailParent: email}; p[cle] = 'oui';
  PropertiesService.getScriptProperties().setProperties(p);
  return email;
}
function desactiver_(cle, fn) {
  ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === fn).forEach(x => ScriptApp.deleteTrigger(x));
  PropertiesService.getScriptProperties().setProperty(cle, 'non');
}
