/** @OnlyCurrentDoc */
/**
 * Suivi de « Calcul mental CM1 » — à coller dans Extensions > Apps Script du tableau Google Sheets du parent.
 * L'appli de l'enfant envoie une ligne à chaque étape du programme ; ce script les range dans l'onglet « Journal »
 * et recalcule l'onglet « Résumé » (par jour, par notion, derniers calculs ratés, graphique).
 * (@OnlyCurrentDoc : le script n'a accès qu'à CE tableau.)
 */
const COLS = ['Date', 'Heure', 'Enfant', 'Type', 'Domaine', 'Notion', 'Score', 'Verdict', 'Calculs ratés', 'Détail'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const j = preparer_(ss);
    const v = k => (d[k] === undefined || d[k] === null) ? '' : String(d[k]).slice(0, 600);
    const score = (d.score === undefined || d.score === '') ? '' : Number(d.score);
    j.appendRow(["'" + v('date'), v('heure'), v('enfant'), v('type'), v('domaine'), v('notion'), score, v('verdict'), v('erreurs'), v('detail')]);
    resume_(ss);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  preparer_(SpreadsheetApp.getActiveSpreadsheet());
  return ContentService.createTextOutput('Le suivi de Calcul mental CM1 est prêt.');
}

/** Lancer à la main (choisir « installer » puis ▶ Exécuter) : crée les onglets et recalcule le résumé. */
function installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  preparer_(ss);
  resume_(ss);
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
    r.getRange('A1').setValue('Chaque jour (programme « Apprendre »)').setFontWeight('bold');
    r.getRange('E1').setValue('Par notion (les plus difficiles en haut)').setFontWeight('bold');
    r.getRange('J1').setValue('Les 15 derniers calculs ratés').setFontWeight('bold');
    r.setColumnWidth(5, 260); r.setColumnWidth(12, 260); r.setColumnWidth(13, 380);
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
  const jours = Object.keys(pj).sort().slice(-60).map(k => [k, pj[k].length, Math.round(pj[k].reduce((a, b) => a + b, 0) / pj[k].length)]);
  // par notion
  const pn = {};
  etapes.filter(x => x[4] === 'calcul' || x[4] === 'français').forEach(x => { const k = x[5]; const o = pn[k] = pn[k] || {s: [], d: ''}; o.s.push(Number(x[6])); o.d = jour_(x[0]); });
  const notions = Object.keys(pn).map(k => [k, pn[k].s.length, Math.round(pn[k].s.reduce((a, b) => a + b, 0) / pn[k].s.length), pn[k].d])
    .sort((a, b) => a[2] - b[2]).slice(0, 60);
  // derniers calculs ratés
  const rates = rows.filter(x => x[8]).slice(-15).reverse().map(x => [jour_(x[0]), x[1], x[5], x[8]]);
  r.getRange('A2:M200').clearContent();
  r.getRange(2, 1, 1, 3).setValues([['Jour', 'Étapes', 'Score moyen %']]).setFontWeight('bold');
  if (jours.length) r.getRange(3, 1, jours.length, 3).setValues(jours);
  r.getRange(2, 5, 1, 4).setValues([['Notion', 'Fois', 'Score moyen %', 'Dernière fois']]).setFontWeight('bold');
  if (notions.length) r.getRange(3, 5, notions.length, 4).setValues(notions);
  r.getRange(2, 10, 1, 4).setValues([['Jour', 'Heure', 'Notion', 'Calculs ratés']]).setFontWeight('bold');
  if (rates.length) r.getRange(3, 10, rates.length, 4).setValues(rates);
  if (!jours.length) r.getRange('A3').setValue('Pas encore de données');
}
