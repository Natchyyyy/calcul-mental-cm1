/**
 * Suivi de « Calcul mental CM1 » — à coller dans Extensions > Apps Script du tableau Google Sheets du parent.
 * L'appli de l'enfant envoie une ligne à chaque étape du programme ; ce script les range dans l'onglet « Journal »
 * et tient à jour l'onglet « Résumé » (par jour, par notion, graphique).
 */
const COLS = ['Date', 'Heure', 'Enfant', 'Type', 'Domaine', 'Notion', 'Score', 'Verdict', 'Calculs ratés', 'Détail'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const sh = preparer_();
    const v = k => (d[k] === undefined || d[k] === null) ? '' : String(d[k]).slice(0, 600);
    const score = (d.score === undefined || d.score === '') ? '' : Number(d.score);
    sh.appendRow([v('date'), v('heure'), v('enfant'), v('type'), v('domaine'), v('notion'), score, v('verdict'), v('erreurs'), v('detail')]);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  preparer_();
  return ContentService.createTextOutput('Le suivi de Calcul mental CM1 est prêt.');
}

/** Lancer une fois à la main (bouton ▶ Exécuter) pour créer les onglets et autoriser le script. */
function installer() {
  preparer_();
}

function preparer_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let j = ss.getSheetByName('Journal');
  if (!j) {
    j = ss.insertSheet('Journal', 0);
    j.appendRow(COLS);
    j.setFrozenRows(1);
    j.getRange(1, 1, 1, COLS.length).setFontWeight('bold').setBackground('#fff1d8');
    j.setColumnWidths(1, 2, 90); j.setColumnWidth(6, 260); j.setColumnWidth(9, 380); j.setColumnWidth(10, 280);
    const old = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
    if (old && ss.getSheets().length > 1) ss.deleteSheet(old);
  }
  let r = ss.getSheetByName('Résumé');
  if (!r) {
    r = ss.insertSheet('Résumé', 0);
    r.getRange('A1').setValue('Chaque jour (programme « Apprendre »)').setFontWeight('bold');
    r.getRange('A2').setFormula("=IFERROR(QUERY(Journal!A:G,\"select A, count(G), avg(G) where D = 'étape' and E <> 'éclair' and A is not null group by A order by A asc label A 'Jour', count(G) 'Étapes', avg(G) 'Score moyen %'\",1),\"Pas encore de données\")");
    r.getRange('E1').setValue('Par notion (les plus difficiles en haut)').setFontWeight('bold');
    r.getRange('E2').setFormula("=IFERROR(QUERY(Journal!A:G,\"select F, count(G), avg(G) where D = 'étape' and E <> 'éclair' and E <> 'mémoire' and E <> 'dictée' group by F order by avg(G) asc label F 'Notion', count(G) 'Fois', avg(G) 'Score moyen %'\",1),\"Pas encore de données\")");
    r.getRange('I1').setValue('Les 15 derniers calculs ratés').setFontWeight('bold');
    r.getRange('I2').setFormula("=IFERROR(QUERY(Journal!A:I,\"select A, B, F, I where I <> '' order by A desc, B desc limit 15 label A 'Jour', B 'Heure', F 'Notion', I 'Calculs ratés'\",1),\"Aucun pour l'instant\")");
    r.setColumnWidth(5, 260); r.setColumnWidth(12, 380);
    r.getRange('C3:C200').setNumberFormat('0'); r.getRange('G3:G200').setNumberFormat('0');
    const chart = r.newChart().setChartType(Charts.ChartType.LINE).addRange(r.getRange('A2:A60')).addRange(r.getRange('C2:C60'))
      .setOption('title', 'Score moyen par jour').setOption('legend', {position: 'none'}).setOption('vAxis', {minValue: 0, maxValue: 100})
      .setPosition(20, 1, 0, 0).build();
    r.insertChart(chart);
  }
  return j;
}
