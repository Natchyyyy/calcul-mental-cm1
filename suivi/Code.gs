/** @OnlyCurrentDoc */
/**
 * Suivi de « Calcul mental CM1 » — à coller dans Extensions > Apps Script du tableau Google Sheets du parent.
 * L'appli de l'enfant envoie une ligne à chaque étape du programme ; ce script les range dans l'onglet « Journal »
 * et recalcule l'onglet « Résumé » (par jour, par notion, derniers calculs ratés, graphique).
 * (@OnlyCurrentDoc : le script n'a accès qu'à CE tableau.)
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
    .addToUi();
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
}
