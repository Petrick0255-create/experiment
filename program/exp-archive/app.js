const DATA_URL = "./experiment-archive.json";
const STORAGE_KEY = "experiment-archive-working-v2";
const SYNC_CONFIG_KEY = "experiment-archive-sync-config";
const FIELD_CODES = { 물리:"P", 화학:"C", 생명:"B", 지구과학:"E", 수학:"M", 공학:"G", 예술:"A" };
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const el = {
  list:$("#experimentList"), form:$("#editorForm"), welcome:$("#welcome"), image:$("#imageStage"),
  imageTabs:$("#imageTabs"), search:$("#searchInput"), field:$("#fieldFilter"),
  grade:$("#gradeFilter"), difficulty:$("#difficultyFilter"), sort:$("#sortSelect")
};
let archive = { schemaVersion:2, experiments:[] };
let selectedId = "";
let imageIndex = 0;

const clean = v => String(v ?? "").trim();
const lines = v => clean(v).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const escapeHtml = v => clean(v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

async function boot() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      archive = normalizeArchive(JSON.parse(saved));
      $("#saveState").textContent = `저장된 JSON · ${archive.experiments.length}개`;
      renderList();
      openRequestedExperiment();
      return;
    } catch (error) {
      console.warn("저장된 JSON을 읽지 못해 다시 가져옵니다.", error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const syncConfig = getSyncConfig();
  if (syncConfig) {
    try {
      archive = await requestCurrentArchive(syncConfig);
      persist();
      $("#saveState").textContent = `최초 JSON 저장 · ${archive.experiments.length}개`;
      renderList();
      openRequestedExperiment();
      return;
    } catch (error) {
      console.warn(error);
    }
  }
  try {
    const response = await fetch(DATA_URL, { cache:"no-store" });
    if (!response.ok) throw new Error();
    archive = normalizeArchive(await response.json());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
    $("#saveState").textContent = `기본 JSON 저장 · ${archive.experiments.length}개`;
  } catch {
    $("#saveState").textContent = "JSON을 가져오세요";
  }
  renderList();
  openRequestedExperiment();
}

function openRequestedExperiment() {
  const requestedId=clean(new URLSearchParams(window.location.search).get("experiment"));
  if(!requestedId)return;
  const experiment=archive.experiments.find(item=>item.id===requestedId);
  if(!experiment){
    $("#saveState").textContent=`${requestedId} 실험을 찾지 못함`;
    return;
  }
  selectExperiment(requestedId);
  requestAnimationFrame(()=>el.form.scrollIntoView({behavior:"smooth",block:"start"}));
}

async function requestCurrentArchive(config) {
  const separator=config.url.includes("?")?"&":"?";
  const response=await fetch(`${config.url}${separator}key=${encodeURIComponent(config.key)}&source=sheet&_=${Date.now()}`,{cache:"no-store"});
  const result=await response.json();
  if(!result.ok)throw new Error(result.message||"현재 시트 데이터를 읽지 못했습니다.");
  return normalizeArchive(result.archive);
}

function normalizeArchive(raw) {
  const base = Array.isArray(raw) ? { experiments:raw } : raw;
  return {
    schemaVersion: base.schemaVersion || 2,
    exportedAt: base.exportedAt || "",
    sourceSpreadsheetId: base.sourceSpreadsheetId || "",
    folderId: base.folderId || "",
    experiments: (base.experiments || []).map(item => ({
      id:clean(item.id) || crypto.randomUUID(), code:clean(item.code), name:clean(item.name || item.실험명),
      field:clean(item.field || item.category || item.분야), subfield:clean(item.subfield),
      difficulty:clean(item.difficulty), target:clean(item.target), grade:clean(item.grade),
      curriculum2025:clean(item.curriculum2025 || item.curriculum), unit:clean(item.unit),
      coreConcepts:clean(item.coreConcepts), images:Array.isArray(item.images) ? item.images : [],
      materials:Array.isArray(item.materials) ? item.materials : [],
      worksheet:{ goal:"", conceptSummary:"", safety:"", steps:[], observations:[], questions:[], teacherNote:"", ...(item.worksheet || {}) },
      status:clean(item.status) || "기존", createdAt:item.createdAt || "", updatedAt:item.updatedAt || ""
    }))
  };
}

function filteredExperiments() {
  const q=clean(el.search.value).toLowerCase();
  const result=archive.experiments.filter(x => {
    const hay=[x.name,x.code,x.field,x.subfield,x.grade,x.curriculum2025,x.unit,x.coreConcepts,...x.materials.map(m=>m.name)].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (!el.field.value || x.field===el.field.value)
      && (!el.grade.value || x.grade===el.grade.value) && (!el.difficulty.value || x.difficulty===el.difficulty.value);
  });
  result.sort((a,b)=> el.sort.value==="code" ? a.code.localeCompare(b.code,"ko",{numeric:true})
    : el.sort.value==="updated" ? clean(b.updatedAt).localeCompare(clean(a.updatedAt))
    : a.name.localeCompare(b.name,"ko"));
  return result;
}

function renderList() {
  const items=filteredExperiments();
  el.list.innerHTML="";
  const template=$("#listItemTemplate");
  items.forEach(x=>{
    const node=template.content.cloneNode(true), row=$(".experiment-row",node), button=$(".experiment-item",node);
    button.dataset.id=x.id;
    row.classList.toggle("active",x.id===selectedId);
    const image=x.images[0];
    $(".thumb",node).innerHTML=image ? `<img src="${escapeHtml(image.thumbnailUrl || image.viewUrl)}" alt="">` : `<b>${escapeHtml(x.field?.[0] || "L")}</b>`;
    $(".item-code",node).textContent=x.code || x.id;
    $(".item-name",node).textContent=x.name || "이름 없는 실험";
    $(".item-meta",node).textContent=[x.field,x.grade,x.unit].filter(Boolean).join(" · ") || "분류 미입력";
    button.addEventListener("click",()=>selectExperiment(x.id));
    const menu=$(".item-menu",node);
    $(".more-button",node).addEventListener("click",event=>{
      event.stopPropagation();
      $$(".item-menu").forEach(openMenu=>{if(openMenu!==menu)openMenu.hidden=true});
      menu.hidden=!menu.hidden;
    });
    $('[data-action="edit"]',node).addEventListener("click",()=>{menu.hidden=true;selectExperiment(x.id);el.form.scrollIntoView({behavior:"smooth",block:"start"})});
    $('[data-action="delete"]',node).addEventListener("click",()=>{menu.hidden=true;deleteExperiment(x.id)});
    el.list.append(node);
  });
  $("#resultCount").textContent=items.length;
  $("#totalCount").textContent=archive.experiments.length;
  $("#emptyState").hidden=items.length>0;
}

function selectExperiment(id) {
  $$(".item-menu").forEach(menu=>menu.hidden=true);
  selectedId=id; imageIndex=0;
  const x=archive.experiments.find(v=>v.id===id);
  if(!x) return;
  el.welcome.hidden=true; el.form.hidden=false;
  $("#idInput").value=x.id; $("#nameInput").value=x.name; $("#codeInput").value=x.code;
  $("#fieldInput").value=x.field; $("#subfieldInput").value=x.subfield; $("#difficultyInput").value=x.difficulty;
  $("#targetInput").value=x.target; $("#gradeInput").value=x.grade; $("#curriculumInput").value=x.curriculum2025;
  $("#unitInput").value=x.unit; $("#conceptInput").value=x.coreConcepts;
  $("#editorHeading").textContent=x.name || "새 실험";
  $("#editorMode").textContent=x.status==="신규" ? "NEW EXPERIMENT PLAN" : "EXPERIMENT DETAIL";
  const w=x.worksheet || {};
  $("#goalInput").value=w.goal||""; $("#conceptSummaryInput").value=w.conceptSummary||"";
  $("#safetyInput").value=w.safety||""; $("#stepsInput").value=(w.steps||[]).join("\n");
  $("#observationsInput").value=(w.observations||[]).join("\n"); $("#questionsInput").value=(w.questions||[]).join("\n");
  $("#teacherNoteInput").value=w.teacherNote||"";
  renderMaterials(x.materials); renderImages(x); renderList();
}

function renderImages(x) {
  const images=x.images||[]; el.imageTabs.innerHTML="";
  if(!images.length){el.image.innerHTML="<span>실험지 이미지 없음</span>";return;}
  imageIndex=Math.min(imageIndex,images.length-1);
  const current=images[imageIndex];
  el.image.innerHTML=`<a href="${escapeHtml(current.viewUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(current.thumbnailUrl || current.viewUrl)}" alt="${escapeHtml(x.name)} 실험지 ${imageIndex+1}"></a>`;
  images.forEach((img,i)=>{
    const b=document.createElement("button"); b.type="button"; b.textContent=`실험지 ${img.page||i+1}`; b.className=i===imageIndex?"active":"";
    b.addEventListener("click",()=>{imageIndex=i;renderImages(x)}); el.imageTabs.append(b);
  });
}

function renderMaterials(materials=[]) {
  $("#materialsList").innerHTML="";
  (materials.length?materials:[{}]).forEach(addMaterialRow);
}
function addMaterialRow(m={}) {
  const node=$("#materialTemplate").content.cloneNode(true);
  $(".material-name",node).value=m.name||""; $(".material-quantity",node).value=m.quantity||""; $(".material-link",node).value=m.link||"";
  $(".remove-material",node).addEventListener("click",e=>e.currentTarget.closest(".material-row").remove());
  $("#materialsList").append(node);
}
function collectMaterials(){return $$(".material-row").map(r=>({name:clean($(".material-name",r).value),quantity:clean($(".material-quantity",r).value),link:clean($(".material-link",r).value)})).filter(x=>x.name||x.quantity||x.link)}
function nextId(){const nums=archive.experiments.map(x=>Number((x.id.match(/\d+$/)||[])[0])).filter(Number.isFinite);return `ARC-${String(Math.max(0,...nums)+1).padStart(4,"0")}`}
function nextCode(field){const prefix=FIELD_CODES[field]||"X";const nums=archive.experiments.map(x=>x.code).filter(x=>x?.startsWith(prefix+"-")).map(x=>Number(x.split("-").at(-1))).filter(Number.isFinite);return `${prefix}-${String(Math.max(0,...nums)+1).padStart(4,"0")}`}

function newExperiment(base=null) {
  const x=base ? structuredClone(base) : {images:[],materials:[],worksheet:{}};
  x.id=nextId(); x.code=""; x.name=base?`${base.name} 새 계획`:""; x.status="신규"; x.createdAt=new Date().toISOString(); x.updatedAt=x.createdAt;
  archive.experiments.unshift(normalizeArchive({experiments:[x]}).experiments[0]);
  persist(); selectExperiment(x.id);
}

function saveEditor(showMessage=true) {
  if (el.form.hidden) return true;
  const x=archive.experiments.find(v=>v.id===$("#idInput").value); if(!x)return false;
  if (!clean($("#nameInput").value)) {
    if (showMessage) alert("실험명을 입력해 주세요.");
    return false;
  }
  Object.assign(x,{name:clean($("#nameInput").value),code:clean($("#codeInput").value)||nextCode($("#fieldInput").value),field:$("#fieldInput").value,
    subfield:clean($("#subfieldInput").value),difficulty:$("#difficultyInput").value,target:$("#targetInput").value,grade:$("#gradeInput").value,
    curriculum2025:clean($("#curriculumInput").value),unit:clean($("#unitInput").value),coreConcepts:clean($("#conceptInput").value),
    materials:collectMaterials(),updatedAt:new Date().toISOString()});
  x.worksheet={goal:clean($("#goalInput").value),conceptSummary:clean($("#conceptSummaryInput").value),safety:clean($("#safetyInput").value),
    steps:lines($("#stepsInput").value),observations:lines($("#observationsInput").value),questions:lines($("#questionsInput").value),teacherNote:clean($("#teacherNoteInput").value)};
  $("#editorHeading").textContent=x.name; persist(); renderList();
  if (showMessage) $("#saveState").textContent="브라우저에 저장됨";
  return true;
}

el.form.addEventListener("submit",e=>{
  e.preventDefault();
  saveEditor(true);
});

function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(archive))}
function download(){
  archive.exportedAt=new Date().toISOString(); const blob=new Blob([JSON.stringify(archive,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="experiment-archive.json";a.click();URL.revokeObjectURL(a.href);
}

function deleteExperiment(id) {
  const x=archive.experiments.find(item=>item.id===id);
  if (!x || !confirm(`‘${x.name || "이름 없는 실험"}’을 삭제하시겠습니까?\n동기화 전에는 브라우저 임시본에서만 삭제됩니다.`)) return;
  archive.experiments=archive.experiments.filter(item=>item.id!==id);
  if(selectedId===id){selectedId="";el.form.hidden=true;el.welcome.hidden=false}
  persist();renderList();$("#saveState").textContent="삭제됨 · 동기화 필요";
}

function getSyncConfig() {
  try {
    const value=JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)||"null");
    return value?.url && value?.key ? value : null;
  } catch { return null; }
}

function configureSync() {
  const current=getSyncConfig()||{};
  const url=prompt("Apps Script 웹 앱 URL을 입력하세요.",current.url||"");
  if(url===null)return null;
  const key=prompt("Apps Script의 동기화 키를 입력하세요.",current.key||"");
  if(key===null)return null;
  const config={url:clean(url),key:clean(key)};
  if(!config.url||!config.key){alert("웹 앱 URL과 동기화 키가 모두 필요합니다.");return null}
  localStorage.setItem(SYNC_CONFIG_KEY,JSON.stringify(config));
  $("#saveState").textContent="동기화 연결 설정됨";
  return config;
}

async function syncArchive() {
  if(!saveEditor(false))return;
  const config=getSyncConfig()||configureSync();
  if(!config)return;
  const button=$("#syncButton");
  button.disabled=true;button.textContent="동기화 중…";$("#saveState").textContent="백업 및 시트 갱신 중";
  try {
    archive.exportedAt=new Date().toISOString();
    const response=await fetch(config.url,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({key:config.key,archive})
    });
    const result=await response.json();
    if(!result.ok)throw new Error(result.message||"동기화에 실패했습니다.");
    archive=normalizeArchive(result.archive||archive);persist();renderList();
    $("#saveState").textContent=`동기화 완료 · 신규 ${result.recentCount||0}개`;
    alert(`동기화가 완료되었습니다.\n백업: ${result.backupCount||0}개\n실험 마스터: ${archive.experiments.length}개\n최근 30일: ${result.recentCount||0}개`);
  } catch(error) {
    console.error(error);
    $("#saveState").textContent="동기화 실패";
    alert(`동기화하지 못했습니다.\n${error.message}\n\n배포 URL과 접근 권한을 확인해 주세요.`);
  } finally {
    button.disabled=false;button.textContent="동기화 및 백업";
  }
}

async function refreshFromSheet() {
  const config=getSyncConfig()||configureSync();
  if(!config)return;
  const button=$("#refreshJsonButton");
  button.disabled=true;button.textContent="가져오는 중…";$("#saveState").textContent="현재 시트 읽는 중";
  try{
    archive=await requestCurrentArchive(config);
    selectedId="";
    persist();
    el.form.hidden=true;
    el.welcome.hidden=false;
    renderList();
    $("#saveState").textContent=`현재 시트 반영 · ${archive.experiments.length}개`;
  }catch(error){
    console.error(error);
    $("#saveState").textContent="시트 가져오기 실패";
    alert(`현재 스프레드시트를 가져오지 못했습니다.\n${error.message}\n\nApps Script를 새 버전으로 배포했는지 확인해 주세요.`);
  }finally{
    button.disabled=false;button.textContent="JSON 가져오기";
  }
}

$("#newButton").addEventListener("click",()=>newExperiment());
$("#duplicateButton").addEventListener("click",()=>{const x=archive.experiments.find(v=>v.id===selectedId);if(x)newExperiment(x)});
$("#addMaterialButton").addEventListener("click",()=>addMaterialRow());
$("#exportButton").addEventListener("click",download);
$("#refreshJsonButton").addEventListener("click",refreshFromSheet);
$("#syncButton").addEventListener("click",syncArchive);
$("#syncSettingsButton").addEventListener("click",configureSync);
[el.search,el.field,el.grade,el.difficulty,el.sort].forEach(x=>["input","change"].forEach(ev=>x.addEventListener(ev,renderList)));
document.addEventListener("click",event=>{if(!event.target.closest(".experiment-row"))$$(".item-menu").forEach(menu=>menu.hidden=true)});
boot();
