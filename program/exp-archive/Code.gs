const ARCHIVE_CONFIG = Object.freeze({
  spreadsheetId: '1Fbfaw3ZEE7KP6IzeNwp5kigbwt5W2kgufzS6Cdm_xck',
  masterSheet: '실험 마스터',
  imageSheet: '이미지 파일',
  folderId: '1vbXiekWL_rus5qHLQFuBd1rIHlLZg96_',
  jsonName: 'experiment-archive.json',
  headers: ['ID','코드','실험명','분야','세부 분야','난이도','대상','학년','2025 교과 연계','연계 단원','핵심 개념']
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('아카이브 관리')
    .addItem('시트 → JSON 내보내기', 'exportArchiveJson')
    .addItem('JSON → 시트 갱신', 'importArchiveJsonToSheet')
    .addSeparator()
    .addItem('JSON 상태 확인', 'showArchiveJsonStatus')
    .addToUi();
}

function exportArchiveJson() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    const sheet = ss.getSheetByName(ARCHIVE_CONFIG.masterSheet);
    const values = sheet.getRange(1, 1, sheet.getLastRow(), 11).getDisplayValues();
    validateHeaders_(values[0]);

    const oldArchive = readArchiveFile_(false) || { experiments: [] };
    const oldById = new Map((oldArchive.experiments || []).map(x => [String(x.id), x]));
    const imagesByName = readImagesByName_(ss);

    const experiments = values.slice(1).filter(r => r[0] || r[2]).map(r => {
      const id = String(r[0] || '').trim();
      const old = oldById.get(id) || {};
      return Object.assign({}, old, {
        id, code:r[1], name:r[2], field:r[3], subfield:r[4], difficulty:r[5],
        target:r[6], grade:r[7], curriculum2025:r[8], unit:r[9], coreConcepts:r[10],
        images: imagesByName[normalizeName_(r[2])] || old.images || [],
        materials: old.materials || [],
        worksheet: old.worksheet || emptyWorksheet_(),
        status: old.status || '기존',
        updatedAt: old.updatedAt || ''
      });
    });

    const archive = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      sourceSpreadsheetId: ARCHIVE_CONFIG.spreadsheetId,
      folderId: ARCHIVE_CONFIG.folderId,
      experiments
    };
    writeArchiveFile_(archive);
    SpreadsheetApp.getUi().alert(`JSON 저장 완료\n실험 ${experiments.length}개`);
  } finally {
    lock.releaseLock();
  }
}

function importArchiveJsonToSheet() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'JSON에서 시트 갱신',
    '현재 시트의 11개 열을 JSON 내용으로 바꿉니다. 갱신 전 백업 JSON을 자동 저장합니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const archive = readArchiveFile_(true);
    validateArchive_(archive);
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    const sheet = ss.getSheetByName(ARCHIVE_CONFIG.masterSheet);
    backupCurrentSheetJson_(ss, sheet);
    const rows = archive.experiments.map(x => [
      x.id || '', x.code || '', x.name || '', x.field || '', x.subfield || '',
      x.difficulty || '', x.target || '', x.grade || '', x.curriculum2025 || '',
      x.unit || '', x.coreConcepts || ''
    ]);

    const oldRows = Math.max(sheet.getLastRow() - 1, 0);
    if (oldRows) sheet.getRange(2, 1, oldRows, 11).clearContent();
    if (rows.length) {
      if (sheet.getMaxRows() < rows.length + 1) {
        sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
      }
      sheet.getRange(2, 1, rows.length, 11).setValues(rows);
      if (rows.length > 1) {
        sheet.getRange(2, 1, 1, 11).copyTo(
          sheet.getRange(2, 1, rows.length, 11),
          SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
          false
        );
        sheet.getRange(2, 1, 1, 11).copyTo(
          sheet.getRange(2, 1, rows.length, 11),
          SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
          false
        );
      }
    }
    SpreadsheetApp.flush();
    ui.alert(`시트 갱신 완료\n실험 ${rows.length}개`);
  } finally {
    lock.releaseLock();
  }
}

function showArchiveJsonStatus() {
  const file = findArchiveFile_();
  SpreadsheetApp.getUi().alert(file
    ? `파일명: ${file.getName()}\n수정: ${file.getLastUpdated()}\n크기: ${file.getSize()} bytes`
    : 'experiment-archive.json 파일이 없습니다.');
}

function readImagesByName_(ss) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.imageSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  const map = {};
  rows.forEach(r => {
    const key = normalizeName_(r[2]);
    if (!key) return;
    const fileId = r[0];
    if (!map[key]) map[key] = [];
    map[key].push({
      fileId, fileName:r[1], page:Number(r[3]) || 1, viewUrl:r[4],
      thumbnailUrl:fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600` : ''
    });
  });
  Object.values(map).forEach(list => list.sort((a,b) => a.page - b.page));
  return map;
}

function readArchiveFile_(required) {
  const file = findArchiveFile_();
  if (!file) {
    if (required) throw new Error(`${ARCHIVE_CONFIG.jsonName} 파일이 없습니다.`);
    return null;
  }
  return JSON.parse(file.getBlob().getDataAsString('UTF-8'));
}

function writeArchiveFile_(archive) {
  const json = JSON.stringify(archive, null, 2);
  const file = findArchiveFile_();
  if (file) file.setContent(json);
  else DriveApp.getFolderById(ARCHIVE_CONFIG.folderId)
    .createFile(ARCHIVE_CONFIG.jsonName, json, MimeType.PLAIN_TEXT);
}

function findArchiveFile_() {
  const files = DriveApp.getFolderById(ARCHIVE_CONFIG.folderId).getFilesByName(ARCHIVE_CONFIG.jsonName);
  return files.hasNext() ? files.next() : null;
}

function backupCurrentSheetJson_(ss, sheet) {
  const values = sheet.getRange(1, 1, sheet.getLastRow(), 11).getDisplayValues();
  validateHeaders_(values[0]);
  const existing = readArchiveFile_(false) || { experiments: [] };
  const existingById = new Map((existing.experiments || []).map(x => [String(x.id), x]));
  const imagesByName = readImagesByName_(ss);
  const experiments = values.slice(1).filter(r => r[0] || r[2]).map(r => {
    const id = String(r[0] || '').trim();
    const old = existingById.get(id) || {};
    return Object.assign({}, old, {
      id, code:r[1], name:r[2], field:r[3], subfield:r[4], difficulty:r[5],
      target:r[6], grade:r[7], curriculum2025:r[8], unit:r[9], coreConcepts:r[10],
      images: imagesByName[normalizeName_(r[2])] || old.images || [],
      materials: old.materials || [],
      worksheet: old.worksheet || emptyWorksheet_(),
      status: old.status || '기존',
      updatedAt: old.updatedAt || ''
    });
  });
  const backup = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    sourceSpreadsheetId: ARCHIVE_CONFIG.spreadsheetId,
    folderId: ARCHIVE_CONFIG.folderId,
    experiments
  };
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmmss');
  DriveApp.getFolderById(ARCHIVE_CONFIG.folderId)
    .createFile(
      `backup-${stamp}-${ARCHIVE_CONFIG.jsonName}`,
      JSON.stringify(backup, null, 2),
      MimeType.PLAIN_TEXT
    );
}

function validateHeaders_(headers) {
  ARCHIVE_CONFIG.headers.forEach((h, i) => {
    if (headers[i] !== h) throw new Error(`${i + 1}열 제목이 '${h}'이(가) 아닙니다.`);
  });
}

function validateArchive_(archive) {
  if (!archive || !Array.isArray(archive.experiments)) throw new Error('experiments 배열이 없는 JSON입니다.');
  const ids = new Set();
  archive.experiments.forEach((x, i) => {
    if (!x.id || !x.name) throw new Error(`${i + 1}번째 실험의 ID 또는 실험명이 없습니다.`);
    if (ids.has(x.id)) throw new Error(`중복 ID: ${x.id}`);
    ids.add(x.id);
  });
}

function normalizeName_(name) {
  return String(name || '').normalize('NFC').replace(/\.(png|jpg|jpeg)$/i, '').replace(/\s+/g, ' ').trim();
}

function emptyWorksheet_() {
  return { goal:'', conceptSummary:'', safety:'', steps:[], observations:[], questions:[], teacherNote:'' };
}
