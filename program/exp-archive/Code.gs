const ARCHIVE_CONFIG = Object.freeze({
  spreadsheetId: '1Fbfaw3ZEE7KP6IzeNwp5kigbwt5W2kgufzS6Cdm_xck',
  masterSheet: '실험 마스터',
  backupSheet: '백업',
  recentSheet: '새로운 실험',
  curriculumSheet: '실험 배치',
  curriculumBackupSheet: '배치 백업',
  imageSheet: '이미지 파일',
  folderId: '1vbXiekWL_rus5qHLQFuBd1rIHlLZg96_',
  jsonName: 'experiment-archive.json',
  labSpreadsheetId: '1X_IIQQ37KcksWBoK2BexyEv0_Is8VJaPbBJg7BiD2xk',
  labExperimentSheet: '내 실험',
  headers: ['ID','코드','실험명','분야','세부 분야','난이도','대상','학년','2025 교과 연계','연계 단원','핵심 개념'],
  curriculumHeaders: ['배치 ID','연도','학년','월','주','순번','실험 ID','코드','실험명','주당 실험 수','수정일']
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('아카이브 관리')
    .addItem('관리 시트 준비', 'setupArchiveSheets')
    .addItem('동기화 키 만들기/확인', 'showOrCreateSyncKey')
    .addItem('동기화 키 다시 만들기', 'resetSyncKey')
    .addSeparator()
    .addItem('시트 → JSON 내보내기', 'exportArchiveJson')
    .addItem('JSON → 시트 갱신', 'importArchiveJsonToSheet')
    .addItem('최근 30일 목록 갱신', 'refreshRecentSheet')
    .addItem('나의 실험실 참고명 갱신', 'syncArchiveToMyLab')
    .addToUi();
}

function setupArchiveSheets() {
  const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
  ensureArchiveSheets_(ss);
  SpreadsheetApp.getUi().alert('실험 마스터, 백업, 새로운 실험, 실험 배치, 배치 백업 시트가 준비되었습니다.');
}

function showOrCreateSyncKey() {
  const properties = PropertiesService.getScriptProperties();
  let key = properties.getProperty('ARCHIVE_SYNC_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty('ARCHIVE_SYNC_KEY', key);
  }
  SpreadsheetApp.getUi().alert(
    '홈페이지 연결용 동기화 키',
    key + '\n\n이 키는 홈페이지의 연결 설정에만 입력하고 공개하지 마세요.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function resetSyncKey() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    '동기화 키 다시 만들기',
    '기존 홈페이지 연결은 즉시 끊어집니다. 새 키를 만들까요?',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().deleteProperty('ARCHIVE_SYNC_KEY');
  showOrCreateSyncKey();
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifySyncKey_(e && e.parameter ? e.parameter.key : '');
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    ensureArchiveSheets_(ss);
    if (e && e.parameter && e.parameter.action === 'curriculum') {
      const curriculum = readCurriculumYear_(ss, e.parameter.year);
      return jsonResponse_({ok:true, curriculum:curriculum});
    }
    const archive = buildArchiveFromMaster_(ss);
    writeArchiveFile_(archive);
    return jsonResponse_({ok:true, archive:archive});
  } catch (error) {
    return jsonResponse_({ok:false, message:error.message});
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const request = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    verifySyncKey_(request.key);
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    ensureArchiveSheets_(ss);
    if (request.action === 'curriculum-sync') {
      const curriculumResult = syncCurriculumYear_(ss, request);
      return jsonResponse_({
        ok:true,
        curriculum:curriculumResult.curriculum,
        backupCount:curriculumResult.backupCount,
        placementCount:curriculumResult.curriculum.placements.length
      });
    }
    const incoming = request.archive;
    validateArchive_(incoming);

    const previous = readArchiveFile_(false) || {experiments:[]};
    const backupCount = appendBackup_(ss, previous);

    incoming.schemaVersion = 2;
    incoming.exportedAt = new Date().toISOString();
    incoming.sourceSpreadsheetId = ARCHIVE_CONFIG.spreadsheetId;
    incoming.folderId = ARCHIVE_CONFIG.folderId;
    writeArchiveFile_(incoming);
    writeMasterSheet_(ss, incoming);
    const recentCount = writeRecentSheet_(ss, incoming);
    const labReferenceCount = updateLabReferenceNames_(incoming);

    return jsonResponse_({
      ok:true,
      archive:incoming,
      backupCount:backupCount,
      recentCount:recentCount,
      labReferenceCount:labReferenceCount
    });
  } catch (error) {
    return jsonResponse_({ok:false, message:error.message});
  } finally {
    lock.releaseLock();
  }
}

function exportArchiveJson() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    ensureArchiveSheets_(ss);
    const archive = buildArchiveFromMaster_(ss);
    writeArchiveFile_(archive);
    writeRecentSheet_(ss, archive);
    const labReferenceCount = updateLabReferenceNames_(archive);
    SpreadsheetApp.getUi().alert('JSON 저장 완료\n실험 ' + archive.experiments.length + '개\n나의 실험실 참고명 갱신 ' + labReferenceCount + '개');
  } finally {
    lock.releaseLock();
  }
}

function importArchiveJsonToSheet() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'JSON에서 시트 갱신',
    '기존 JSON을 백업 시트에 저장한 후 실험 마스터를 갱신합니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
    ensureArchiveSheets_(ss);
    const archive = readArchiveFile_(true);
    validateArchive_(archive);
    const backupCount = appendBackup_(ss, archive);
    writeMasterSheet_(ss, archive);
    const recentCount = writeRecentSheet_(ss, archive);
    const labReferenceCount = updateLabReferenceNames_(archive);
    ui.alert('시트 갱신 완료\n백업 ' + backupCount + '개 · 최근 30일 ' + recentCount + '개\n나의 실험실 참고명 갱신 ' + labReferenceCount + '개');
  } finally {
    lock.releaseLock();
  }
}

function refreshRecentSheet() {
  const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
  ensureArchiveSheets_(ss);
  const archive = readArchiveFile_(true);
  const count = writeRecentSheet_(ss, archive);
  SpreadsheetApp.getUi().alert('최근 30일 실험 ' + count + '개를 갱신했습니다.');
}

function syncArchiveToMyLab() {
  const ss = SpreadsheetApp.openById(ARCHIVE_CONFIG.spreadsheetId);
  ensureArchiveSheets_(ss);
  const archive = buildArchiveFromMaster_(ss);
  writeArchiveFile_(archive);
  const count = updateLabReferenceNames_(archive);
  SpreadsheetApp.getUi().alert('나의 실험실 참고 실험명 ' + count + '개를 갱신했습니다.');
}

function updateLabReferenceNames_(archive) {
  validateArchive_(archive);
  const lab = SpreadsheetApp.openById(ARCHIVE_CONFIG.labSpreadsheetId);
  const sheet = lab.getSheetByName(ARCHIVE_CONFIG.labExperimentSheet);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const byId = {};
  archive.experiments.forEach(function(x) { byId[String(x.id)] = x.name || ''; });
  const count = sheet.getLastRow() - 1;
  const range = sheet.getRange(2, 3, count, 2);
  const values = range.getValues();
  let changed = 0;
  values.forEach(function(row) {
    const currentName = byId[String(row[0] || '')];
    if (currentName && row[1] !== currentName) {
      row[1] = currentName;
      changed += 1;
    }
  });
  if (changed) range.setValues(values);
  return changed;
}

function ensureArchiveSheets_(ss) {
  let backup = ss.getSheetByName(ARCHIVE_CONFIG.backupSheet);
  if (!backup) backup = ss.insertSheet(ARCHIVE_CONFIG.backupSheet);
  let recent = ss.getSheetByName(ARCHIVE_CONFIG.recentSheet);
  if (!recent) recent = ss.insertSheet(ARCHIVE_CONFIG.recentSheet);
  let curriculum = ss.getSheetByName(ARCHIVE_CONFIG.curriculumSheet);
  if (!curriculum) curriculum = ss.insertSheet(ARCHIVE_CONFIG.curriculumSheet);
  let curriculumBackup = ss.getSheetByName(ARCHIVE_CONFIG.curriculumBackupSheet);
  if (!curriculumBackup) curriculumBackup = ss.insertSheet(ARCHIVE_CONFIG.curriculumBackupSheet);

  const backupHeaders = ['백업 일시'].concat(ARCHIVE_CONFIG.headers).concat(['전체 JSON']);
  const recentHeaders = ['수정일'].concat(ARCHIVE_CONFIG.headers);
  const curriculumBackupHeaders = ['백업 일시'].concat(ARCHIVE_CONFIG.curriculumHeaders);
  prepareSheet_(backup, backupHeaders);
  prepareSheet_(recent, recentHeaders);
  prepareSheet_(curriculum, ARCHIVE_CONFIG.curriculumHeaders);
  prepareSheet_(curriculumBackup, curriculumBackupHeaders);
}

function prepareSheet_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#16233d').setFontColor('#ffffff').setFontWeight('bold');
}

function appendBackup_(ss, archive) {
  const experiments = archive && Array.isArray(archive.experiments) ? archive.experiments : [];
  if (!experiments.length) return 0;
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.backupSheet);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  const rows = experiments.map(function(x) {
    return [stamp].concat(experimentRow_(x)).concat([JSON.stringify(x)]);
  });
  const startRow = sheet.getLastRow() + 1;
  ensureRows_(sheet, startRow + rows.length - 1);
  sheet.getRange(startRow, 1, rows.length, 13).setValues(rows);
  return rows.length;
}

function writeMasterSheet_(ss, archive) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.masterSheet);
  if (!sheet) throw new Error('실험 마스터 시트가 없습니다.');
  const rows = archive.experiments.map(experimentRow_);
  const oldRows = Math.max(sheet.getLastRow() - 1, 0);
  if (oldRows) sheet.getRange(2, 1, oldRows, 11).clearContent();
  if (!rows.length) return;
  ensureRows_(sheet, rows.length + 1);
  sheet.getRange(2, 1, rows.length, 11).setValues(rows);
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

function writeRecentSheet_(ss, archive) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.recentSheet);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = archive.experiments.filter(function(x) {
    const time = new Date(x.updatedAt || x.createdAt || '').getTime();
    return Number.isFinite(time) && time >= cutoff;
  }).sort(function(a, b) {
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });
  const oldRows = Math.max(sheet.getLastRow() - 1, 0);
  if (oldRows) sheet.getRange(2, 1, oldRows, 12).clearContent();
  if (recent.length) {
    const rows = recent.map(function(x) {
      return [x.updatedAt || x.createdAt || ''].concat(experimentRow_(x));
    });
    ensureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, 12).setValues(rows);
    sheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  return recent.length;
}

function buildArchiveFromMaster_(ss) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.masterSheet);
  const values = sheet.getRange(1, 1, sheet.getLastRow(), 11).getDisplayValues();
  validateHeaders_(values[0]);
  const oldArchive = readArchiveFile_(false) || {experiments:[]};
  const oldById = new Map((oldArchive.experiments || []).map(function(x) { return [String(x.id), x]; }));
  const imagesByName = readImagesByName_(ss);
  const experiments = values.slice(1).filter(function(r) { return r[0] || r[2]; }).map(function(r) {
    const id = String(r[0] || '').trim();
    const old = oldById.get(id) || {};
    return Object.assign({}, old, {
      id:id, code:r[1], name:r[2], field:r[3], subfield:r[4], difficulty:r[5],
      target:r[6], grade:r[7], curriculum2025:r[8], unit:r[9], coreConcepts:r[10],
      images:imagesByName[normalizeName_(r[2])] || old.images || [],
      materials:old.materials || [],
      worksheet:old.worksheet || emptyWorksheet_(),
      status:old.status || '기존',
      updatedAt:old.updatedAt || ''
    });
  });
  return {
    schemaVersion:2,
    exportedAt:new Date().toISOString(),
    sourceSpreadsheetId:ARCHIVE_CONFIG.spreadsheetId,
    folderId:ARCHIVE_CONFIG.folderId,
    experiments:experiments
  };
}

function experimentRow_(x) {
  return [
    x.id || '', x.code || '', x.name || '', x.field || '', x.subfield || '',
    x.difficulty || '', x.target || '', x.grade || '', x.curriculum2025 || '',
    x.unit || '', x.coreConcepts || ''
  ];
}

function readCurriculumYear_(ss, yearValue) {
  const year = validateCurriculumYear_(yearValue);
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.curriculumSheet);
  if (!sheet || sheet.getLastRow() < 2) {
    return {year:year, slotCount:2, placements:[], syncedAt:''};
  }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_CONFIG.curriculumHeaders.length).getDisplayValues();
  const selected = rows.filter(function(row) {
    return String(row[1]).trim() === year;
  });
  const slotCount = selected.length ? Math.max(1, Math.min(2, Number(selected[0][9]) || 2)) : 2;
  const placements = selected.map(function(row) {
    return {
      placementId:row[0],
      grade:row[2],
      month:Number(row[3]),
      week:Number(row[4]),
      order:Number(row[5]),
      experimentId:row[6]
    };
  }).filter(function(item) {
    return item.grade && item.month && item.week && item.order && item.experimentId;
  }).sort(compareCurriculumPlacement_);
  return {
    year:year,
    slotCount:slotCount,
    placements:placements,
    syncedAt:selected.length ? selected[0][10] : ''
  };
}

function syncCurriculumYear_(ss, request) {
  const year = validateCurriculumYear_(request.year);
  const slotCount = Math.max(1, Math.min(2, Number(request.slotCount) || 2));
  const placements = Array.isArray(request.placements) ? request.placements : [];
  validateCurriculumPlacements_(placements);

  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.curriculumSheet);
  const backupSheet = ss.getSheetByName(ARCHIVE_CONFIG.curriculumBackupSheet);
  const width = ARCHIVE_CONFIG.curriculumHeaders.length;
  const existing = sheet.getLastRow() < 2
    ? []
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues();
  const previousYearRows = existing.filter(function(row) {
    return String(row[1]).trim() === year;
  });
  const keepRows = existing.filter(function(row) {
    return String(row[1]).trim() !== year && row.some(function(value) { return value !== ''; });
  });

  const backupCount = appendCurriculumBackup_(backupSheet, previousYearRows);
  const masterIndex = readMasterIndex_(ss);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  const newRows = placements.map(function(item) {
    const experiment = masterIndex[String(item.experimentId)] || {};
    const order = Number(item.order);
    const placementId = [
      year,
      String(item.grade),
      String(Number(item.month)).padStart(2, '0'),
      String(Number(item.week)).padStart(2, '0'),
      String(order)
    ].join('-');
    return [
      placementId, year, item.grade, Number(item.month), Number(item.week), order,
      item.experimentId, experiment.code || '', experiment.name || '', slotCount, stamp
    ];
  }).sort(function(a, b) {
    return compareCurriculumPlacement_({
      grade:a[2], month:a[3], week:a[4], order:a[5]
    }, {
      grade:b[2], month:b[3], week:b[4], order:b[5]
    });
  });

  const oldRowCount = Math.max(sheet.getLastRow() - 1, 0);
  if (oldRowCount) sheet.getRange(2, 1, oldRowCount, width).clearContent();
  const allRows = keepRows.concat(newRows);
  if (allRows.length) {
    ensureRows_(sheet, allRows.length + 1);
    sheet.getRange(2, 1, allRows.length, width).setValues(allRows);
    sheet.getRange(2, 11, allRows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
  return {
    backupCount:backupCount,
    curriculum:readCurriculumYear_(ss, year)
  };
}

function appendCurriculumBackup_(sheet, rows) {
  if (!rows.length) return 0;
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  const backupRows = rows.map(function(row) { return [stamp].concat(row); });
  const startRow = sheet.getLastRow() + 1;
  ensureRows_(sheet, startRow + backupRows.length - 1);
  sheet.getRange(startRow, 1, backupRows.length, backupRows[0].length).setValues(backupRows);
  sheet.getRange(startRow, 1, backupRows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return backupRows.length;
}

function readMasterIndex_(ss) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.masterSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  return rows.reduce(function(index, row) {
    const id = String(row[0] || '').trim();
    if (id) index[id] = {code:row[1], name:row[2]};
    return index;
  }, {});
}

function validateCurriculumYear_(yearValue) {
  const year = String(yearValue || '').trim();
  if (!/^\d{4}$/.test(year) || Number(year) < 2020 || Number(year) > 2100) {
    throw new Error('연도는 2020~2100 사이의 네 자리 숫자여야 합니다.');
  }
  return year;
}

function validateCurriculumPlacements_(placements) {
  const grades = ['7세','1학년','2학년','3학년','4학년','5학년','6학년','중등'];
  const locations = new Set();
  const experiments = new Set();
  placements.forEach(function(item, index) {
    const month = Number(item.month);
    const week = Number(item.week);
    const order = Number(item.order);
    const experimentId = String(item.experimentId || '').trim();
    if (grades.indexOf(item.grade) < 0 || month < 1 || month > 12 ||
        week < 1 || week > 4 || order < 1 || order > 2 || !experimentId) {
      throw new Error((index + 1) + '번째 배치 정보가 올바르지 않습니다.');
    }
    const location = [item.grade, month, week, order].join('|');
    if (locations.has(location)) throw new Error('같은 위치에 실험이 중복 배치되어 있습니다: ' + location);
    if (experiments.has(experimentId)) throw new Error('같은 연도에 중복된 실험이 있습니다: ' + experimentId);
    locations.add(location);
    experiments.add(experimentId);
  });
}

function compareCurriculumPlacement_(a, b) {
  const gradeOrder = {'7세':0,'1학년':1,'2학년':2,'3학년':3,'4학년':4,'5학년':5,'6학년':6,'중등':7};
  return (gradeOrder[a.grade] - gradeOrder[b.grade]) ||
    (Number(a.month) - Number(b.month)) ||
    (Number(a.week) - Number(b.week)) ||
    (Number(a.order) - Number(b.order));
}

function readImagesByName_(ss) {
  const sheet = ss.getSheetByName(ARCHIVE_CONFIG.imageSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  const map = {};
  rows.forEach(function(r) {
    const key = normalizeName_(r[2]);
    if (!key) return;
    const fileId = r[0];
    if (!map[key]) map[key] = [];
    map[key].push({
      fileId:fileId,
      fileName:r[1],
      page:Number(r[3]) || 1,
      viewUrl:r[4],
      thumbnailUrl:fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600' : ''
    });
  });
  Object.keys(map).forEach(function(key) {
    map[key].sort(function(a, b) { return a.page - b.page; });
  });
  return map;
}

function readArchiveFile_(required) {
  const file = findArchiveFile_();
  if (!file) {
    if (required) throw new Error(ARCHIVE_CONFIG.jsonName + ' 파일이 없습니다.');
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

function ensureRows_(sheet, requiredRows) {
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
}

function verifySyncKey_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ARCHIVE_SYNC_KEY');
  if (!expected) throw new Error('먼저 시트 메뉴에서 동기화 키를 만들어 주세요.');
  if (!provided || provided !== expected) throw new Error('동기화 키가 올바르지 않습니다.');
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateHeaders_(headers) {
  ARCHIVE_CONFIG.headers.forEach(function(h, i) {
    if (headers[i] !== h) throw new Error((i + 1) + '열 제목이 ' + h + '이(가) 아닙니다.');
  });
}

function validateArchive_(archive) {
  if (!archive || !Array.isArray(archive.experiments)) throw new Error('experiments 배열이 없는 JSON입니다.');
  const ids = new Set();
  archive.experiments.forEach(function(x, i) {
    if (!x.id || !x.name) throw new Error((i + 1) + '번째 실험의 ID 또는 실험명이 없습니다.');
    if (ids.has(x.id)) throw new Error('중복 ID: ' + x.id);
    ids.add(x.id);
  });
}

function normalizeName_(name) {
  return String(name || '').normalize('NFC').replace(/\.(png|jpg|jpeg)$/i, '').replace(/\s+/g, ' ').trim();
}

function emptyWorksheet_() {
  return {goal:'', conceptSummary:'', safety:'', steps:[], observations:[], questions:[], teacherNote:''};
}
