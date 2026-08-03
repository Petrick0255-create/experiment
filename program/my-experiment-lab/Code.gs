var LAB_CONFIG = {
  spreadsheetId: '1X_IIQQ37KcksWBoK2BexyEv0_Is8VJaPbBJg7BiD2xk',
  experimentSheet: '내 실험',
  placementSheet: '내 실험 배치',
  materialSheet: '준비물 체크',
  backupSheet: '백업',
  guideSheet: '사용 안내',
  settingSheet: '설정',
  archiveSpreadsheetId: '1Fbfaw3ZEE7KP6IzeNwp5kigbwt5W2kgufzS6Cdm_xck',
  archiveMasterSheet: '실험 마스터',
  archiveImageSheet: '이미지 파일',
  experimentHeaders: ['내 실험 ID','실험명','참고 실험 ID','참고 실험명','분야','난이도','대상','학년','교과 연계','연계 단원','실험 목표','준비물 JSON','실험 순서','관찰·기록','메모','생성일','수정일','생각해보기','실험지 배경색'],
  placementHeaders: ['배치 ID','연도','학년','월','주','순번','내 실험 ID','실험명','수정일'],
  materialHeaders: ['체크 ID','연도','학년','월','주','순번','내 실험 ID','실험명','준비물','수량','구매 링크','체크','수정일'],
  backupHeaders: ['백업 일시','데이터 종류','건수','전체 JSON'],
  archiveHeaders: ['ID','코드','실험명','분야','세부 분야','난이도','대상','학년','2025 교과 연계','연계 단원','핵심 개념'],
  settingHeaders: ['설정 키','값','수정일']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('나의 실험실')
    .addItem('관리 시트 준비', 'setupLabSheets')
    .addItem('동기화 키 만들기/확인', 'showOrCreateLabSyncKey')
    .addItem('동기화 키 다시 만들기', 'resetLabSyncKey')
    .addSeparator()
    .addItem('현재 데이터 백업', 'backupCurrentLabData')
    .addToUi();
}

function setupLabSheets() {
  var ss = SpreadsheetApp.openById(LAB_CONFIG.spreadsheetId);
  ensureLabSheets_(ss);
  SpreadsheetApp.getUi().alert('내 실험, 내 실험 배치, 준비물 체크, 백업, 사용 안내 시트가 준비되었습니다. 기존 실험 아카이브와 직접 연결됩니다.');
}

function showOrCreateLabSyncKey() {
  var properties = PropertiesService.getScriptProperties();
  var key = properties.getProperty('MY_LAB_SYNC_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty('MY_LAB_SYNC_KEY', key);
  }
  SpreadsheetApp.getUi().alert('홈페이지 동기화 키', key + '\n\n홈페이지의 연결 설정에 입력하세요.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function resetLabSyncKey() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('동기화 키 다시 만들기', '기존 홈페이지 연결이 끊어집니다. 계속할까요?', ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().deleteProperty('MY_LAB_SYNC_KEY');
  showOrCreateLabSyncKey();
}

function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    verifyKey_(e && e.parameter ? e.parameter.key : '');
    var ss = SpreadsheetApp.openById(LAB_CONFIG.spreadsheetId);
    ensureLabSheets_(ss);
    return jsonResponse_({ok:true, payload:readPayload_(ss)});
  } catch (error) {
    return jsonResponse_({ok:false, message:error.message});
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var request = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    verifyKey_(request.key);
    if (request.action !== 'sync') throw new Error('지원하지 않는 작업입니다.');
    validatePayload_(request.payload);
    var ss = SpreadsheetApp.openById(LAB_CONFIG.spreadsheetId);
    ensureLabSheets_(ss);
    var previous = readPayload_(ss);
    appendBackup_(ss, previous, '동기화 전 자동 백업');
    writePayload_(ss, request.payload);
    return jsonResponse_({ok:true, payload:readPayload_(ss)});
  } catch (error) {
    return jsonResponse_({ok:false, message:error.message});
  } finally {
    lock.releaseLock();
  }
}

function backupCurrentLabData() {
  var ss = SpreadsheetApp.openById(LAB_CONFIG.spreadsheetId);
  ensureLabSheets_(ss);
  var payload = readPayload_(ss);
  appendBackup_(ss, payload, '수동 백업');
  SpreadsheetApp.getUi().alert('현재 데이터를 백업했습니다.');
}

function ensureLabSheets_(ss) {
  ensureSheet_(ss, LAB_CONFIG.experimentSheet, LAB_CONFIG.experimentHeaders, false);
  ensureSheet_(ss, LAB_CONFIG.placementSheet, LAB_CONFIG.placementHeaders, false);
  ensureSheet_(ss, LAB_CONFIG.materialSheet, LAB_CONFIG.materialHeaders, false);
  ensureSheet_(ss, LAB_CONFIG.backupSheet, LAB_CONFIG.backupHeaders, false);
  ensureSheet_(ss, LAB_CONFIG.guideSheet, ['구분','내용','비고','링크'], false);
  var setting = ensureSheet_(ss, LAB_CONFIG.settingSheet, LAB_CONFIG.settingHeaders, true);
  if (!setting.getRange('A2').getValue()) setting.getRange('A2:C2').setValues([['slotCounts','{}','']]);
}

function ensureSheet_(ss, title, headers, hidden) {
  var sheet = ss.getSheetByName(title);
  if (!sheet) sheet = ss.insertSheet(title);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#f1f3f4').setFontColor('#202634').setFontWeight('bold').setHorizontalAlignment('center');
  if (hidden && !sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function readPayload_(ss) {
  var archiveExperiments = readSourceArchiveExperiments_();
  refreshReferenceNames_(ss.getSheetByName(LAB_CONFIG.experimentSheet), archiveExperiments);
  var experiments = readExperiments_(ss.getSheetByName(LAB_CONFIG.experimentSheet));
  var placements = readPlacements_(ss.getSheetByName(LAB_CONFIG.placementSheet));
  var checks = readChecks_(ss.getSheetByName(LAB_CONFIG.materialSheet));
  var slotCounts = {};
  try { slotCounts = JSON.parse(ss.getSheetByName(LAB_CONFIG.settingSheet).getRange('B2').getDisplayValue() || '{}'); } catch (ignore) {}
  return {version:1, experiments:experiments, placements:placements, checks:checks, slotCounts:slotCounts, archiveExperiments:archiveExperiments, updatedAt:new Date().toISOString()};
}

function readSourceArchiveExperiments_() {
  var source = SpreadsheetApp.openById(LAB_CONFIG.archiveSpreadsheetId);
  var sheet = source.getSheetByName(LAB_CONFIG.archiveMasterSheet);
  if (!sheet) throw new Error('기존 실험 아카이브의 실험 마스터 시트를 찾을 수 없습니다.');
  var headers = sheet.getRange(1, 1, 1, LAB_CONFIG.archiveHeaders.length).getDisplayValues()[0];
  LAB_CONFIG.archiveHeaders.forEach(function(header, index) {
    if (headers[index] !== header) throw new Error('기존 실험 아카이브의 ' + (index + 1) + '열 제목이 ' + header + '이(가) 아닙니다.');
  });
  var imagesByName = readSourceArchiveImages_(source);
  var count = Math.max(sheet.getLastRow() - 1, 0);
  if (!count) return [];
  return sheet.getRange(2, 1, count, LAB_CONFIG.archiveHeaders.length).getDisplayValues().filter(function(row) { return row[0] && row[2]; }).map(function(row) {
    return {id:row[0],code:row[1],name:row[2],field:row[3],subfield:row[4],difficulty:row[5],target:row[6],grade:row[7],curriculum2025:row[8],unit:row[9],coreConcepts:row[10],images:imagesByName[normalizeArchiveName_(row[2])] || []};
  });
}

function readSourceArchiveImages_(source) {
  var sheet = source.getSheetByName(LAB_CONFIG.archiveImageSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  var map = {};
  rows.forEach(function(row) {
    var key = normalizeArchiveName_(row[2]);
    if (!key) return;
    var fileId = String(row[0] || '');
    if (!map[key]) map[key] = [];
    map[key].push({
      fileId:fileId,
      fileName:String(row[1] || ''),
      page:Number(row[3]) || 1,
      viewUrl:String(row[4] || ''),
      thumbnailUrl:fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600' : ''
    });
  });
  Object.keys(map).forEach(function(key) {
    map[key].sort(function(a, b) { return a.page - b.page; });
  });
  return map;
}

function normalizeArchiveName_(name) {
  return String(name || '').normalize('NFC').replace(/\.(png|jpg|jpeg)$/i, '').replace(/\s+/g, ' ').trim();
}

function refreshReferenceNames_(sheet, archiveExperiments) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var byId = {};
  archiveExperiments.forEach(function(item) { byId[String(item.id)] = item.name || ''; });
  var count = sheet.getLastRow() - 1;
  var range = sheet.getRange(2, 3, count, 2);
  var values = range.getValues();
  var changed = 0;
  values.forEach(function(row) {
    var latestName = byId[String(row[0] || '')];
    if (latestName && row[1] !== latestName) {
      row[1] = latestName;
      changed += 1;
    }
  });
  if (changed) range.setValues(values);
  return changed;
}

function readExperiments_(sheet) {
  var count = Math.max(sheet.getLastRow() - 1, 0);
  if (!count) return [];
  return sheet.getRange(2, 1, count, LAB_CONFIG.experimentHeaders.length).getValues().filter(function(row) { return row[0]; }).map(function(row) {
    var materials = [], steps = [];
    try { materials = JSON.parse(row[11] || '[]'); } catch (ignore) {}
    try { steps = JSON.parse(row[12] || '[]'); } catch (ignore2) { steps = String(row[12] || '').split(/\r?\n/).filter(Boolean); }
    return {id:String(row[0]), name:String(row[1] || ''), referenceId:String(row[2] || ''), referenceName:String(row[3] || ''), field:String(row[4] || ''), difficulty:String(row[5] || ''), target:String(row[6] || ''), grade:String(row[7] || ''), curriculum:String(row[8] || ''), unit:String(row[9] || ''), goal:String(row[10] || ''), materials:materials, steps:steps, observation:String(row[13] || ''), note:String(row[14] || ''), createdAt:dateText_(row[15]), updatedAt:dateText_(row[16]), thinking:String(row[17] || ''), worksheetColor:String(row[18] || '#6f93d6')};
  });
}

function readPlacements_(sheet) {
  var count = Math.max(sheet.getLastRow() - 1, 0);
  if (!count) return [];
  return sheet.getRange(2, 1, count, LAB_CONFIG.placementHeaders.length).getValues().filter(function(row) { return row[0]; }).map(function(row) {
    return {id:String(row[0]), year:Number(row[1]), grade:String(row[2]), month:Number(row[3]), week:Number(row[4]), order:Number(row[5]), experimentId:String(row[6]), updatedAt:dateText_(row[8])};
  });
}

function readChecks_(sheet) {
  var count = Math.max(sheet.getLastRow() - 1, 0), checks = {};
  if (!count) return checks;
  sheet.getRange(2, 1, count, LAB_CONFIG.materialHeaders.length).getValues().forEach(function(row) { if (row[0] && row[11] === true) checks[String(row[0])] = true; });
  return checks;
}

function writePayload_(ss, payload) {
  var experiments = payload.experiments || [], placements = payload.placements || [], stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var expById = {};
  experiments.forEach(function(item) { expById[item.id] = item; });
  var expRows = experiments.map(function(item) {
    return [item.id,item.name,item.referenceId || '',item.referenceName || '',item.field || '',item.difficulty || '',item.target || '',item.grade || '',item.curriculum || '',item.unit || '',item.goal || '',JSON.stringify(item.materials || []),JSON.stringify(item.steps || []),item.observation || '',item.note || '',item.createdAt || stamp,item.updatedAt || stamp,item.thinking || '',item.worksheetColor || '#6f93d6'];
  });
  var placementRows = placements.map(function(item) {
    var experiment = expById[item.experimentId] || {};
    return [item.id,item.year,item.grade,item.month,item.week,item.order,item.experimentId,experiment.name || '',item.updatedAt || stamp];
  });
  var materialRows = [];
  placements.forEach(function(placement) {
    var experiment = expById[placement.experimentId];
    if (!experiment) return;
    (experiment.materials || []).forEach(function(material, index) {
      var checkId = makeCheckId_(placement, index);
      materialRows.push([checkId,placement.year,placement.grade,placement.month,placement.week,placement.order,placement.experimentId,experiment.name || '',material.name || '',material.quantity || '',material.link || '',payload.checks && payload.checks[checkId] === true,stamp]);
    });
  });
  replaceRows_(ss.getSheetByName(LAB_CONFIG.experimentSheet), LAB_CONFIG.experimentHeaders.length, expRows);
  replaceRows_(ss.getSheetByName(LAB_CONFIG.placementSheet), LAB_CONFIG.placementHeaders.length, placementRows);
  replaceRows_(ss.getSheetByName(LAB_CONFIG.materialSheet), LAB_CONFIG.materialHeaders.length, materialRows);
  if (materialRows.length) {
    var checkRange = ss.getSheetByName(LAB_CONFIG.materialSheet).getRange(2, 12, materialRows.length, 1);
    checkRange.insertCheckboxes();
    checkRange.setValues(materialRows.map(function(row) { return [row[11] === true]; }));
  }
  ss.getSheetByName(LAB_CONFIG.settingSheet).getRange('A2:C2').setValues([['slotCounts',JSON.stringify(payload.slotCounts || {}),stamp]]);
}

function replaceRows_(sheet, width, rows) {
  var oldCount = Math.max(sheet.getLastRow() - 1, 0);
  if (oldCount) sheet.getRange(2, 1, oldCount, width).clearContent();
  if (!rows.length) return;
  ensureRows_(sheet, rows.length + 1);
  sheet.getRange(2, 1, rows.length, width).setValues(rows);
}

function appendBackup_(ss, payload, type) {
  var sheet = ss.getSheetByName(LAB_CONFIG.backupSheet);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var count = (payload.experiments || []).length + (payload.placements || []).length;
  sheet.appendRow([stamp,type,count,JSON.stringify(payload)]);
}

function makeCheckId_(placement, materialIndex) {
  return placement.year + '-' + placement.grade + '-' + pad2_(placement.month) + '-' + pad2_(placement.week) + '-' + placement.order + '-' + placement.experimentId + '-' + materialIndex;
}

function validatePayload_(payload) {
  if (!payload || !Array.isArray(payload.experiments) || !Array.isArray(payload.placements)) throw new Error('저장 데이터 형식이 올바르지 않습니다.');
  var experimentIds = {}, placementIds = {}, assignmentKeys = {}, locationKeys = {};
  payload.experiments.forEach(function(item) {
    if (!item.id || !item.name) throw new Error('ID 또는 실험명이 없는 내 실험이 있습니다.');
    if (experimentIds[item.id]) throw new Error('중복된 내 실험 ID가 있습니다: ' + item.id);
    experimentIds[item.id] = true;
  });
  payload.placements.forEach(function(item) {
    if (!item.id || !experimentIds[item.experimentId]) throw new Error('존재하지 않는 내 실험이 배치되어 있습니다.');
    if (item.year < 2020 || item.year > 2100 || item.month < 1 || item.month > 12 || item.week < 1 || item.week > 4 || item.order < 1 || item.order > 2) throw new Error('배치 위치가 올바르지 않습니다.');
    if (placementIds[item.id]) throw new Error('중복된 배치 ID가 있습니다: ' + item.id);
    var assignment = item.year + '|' + item.experimentId, location = item.year + '|' + item.grade + '|' + item.month + '|' + item.week + '|' + item.order;
    if (assignmentKeys[assignment]) throw new Error('같은 연도에 동일한 실험이 중복 배치되어 있습니다.');
    if (locationKeys[location]) throw new Error('같은 위치에 두 실험이 배치되어 있습니다.');
    placementIds[item.id] = true; assignmentKeys[assignment] = true; locationKeys[location] = true;
  });
}

function verifyKey_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('MY_LAB_SYNC_KEY');
  if (!expected) throw new Error('시트 메뉴에서 동기화 키를 먼저 만들어 주세요.');
  if (!provided || provided !== expected) throw new Error('동기화 키가 올바르지 않습니다.');
}

function jsonResponse_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function pad2_(value) { return String(value).padStart(2, '0'); }
function ensureRows_(sheet, needed) { if (sheet.getMaxRows() < needed) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows()); }
function dateText_(value) { if (!value) return ''; if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX"); return String(value); }
