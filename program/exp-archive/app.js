const DATA_URL = "./experiment-archive.json";
const STORAGE_KEY = "experiment-archive-working-v2";
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
  try {
    const response = await fetch(DATA_URL, { cache:"no-store" });
    if (!response.ok) throw new Error();
    archive = normalizeArchive(await response.json());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
    $("#saveState").textContent = "Drive JSON 기준";
  } catch {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      archive = normalizeArchive(JSON.parse(saved));
      $("#saveState").textContent = "브라우저 임시본";
    } else {
      $("#saveState").textContent = "JSON을 가져오세요";
    }
  }
  renderList();
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
    const node=template.content.cloneNode(true), button=$(".experiment-item",node);
    button.dataset.id=x.id;
    button.classList.toggle("active",x.id===selectedId);
    const image=x.images[0];
    $(".thumb",node).innerHTML=image ? `<img src="${escapeHtml(image.thumbnailUrl || image.viewUrl)}" alt="">` : `<b>${escapeHtml(x.field?.[0] || "L")}</b>`;
    $(".item-code",node).textContent=x.code || x.id;
    $(".item-name",node).textContent=x.name || "이름 없는 실험";
    $(".item-meta",node).textContent=[x.field,x.grade,x.unit].filter(Boolean).join(" · ") || "분류 미입력";
    button.addEventListener("click",()=>selectExperiment(x.id));
    el.list.append(node);
  });
  $("#resultCount").textContent=items.length;
  $("#totalCount").textContent=archive.experiments.length;
  $("#emptyState").hidden=items.length>0;
}

function selectExperiment(id) {
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

el.form.addEventListener("submit",e=>{
  e.preventDefault(); const x=archive.experiments.find(v=>v.id===$("#idInput").value); if(!x)return;
  Object.assign(x,{name:clean($("#nameInput").value),code:clean($("#codeInput").value)||nextCode($("#fieldInput").value),field:$("#fieldInput").value,
    subfield:clean($("#subfieldInput").value),difficulty:$("#difficultyInput").value,target:$("#targetInput").value,grade:$("#gradeInput").value,
    curriculum2025:clean($("#curriculumInput").value),unit:clean($("#unitInput").value),coreConcepts:clean($("#conceptInput").value),
    materials:collectMaterials(),updatedAt:new Date().toISOString()});
  x.worksheet={goal:clean($("#goalInput").value),conceptSummary:clean($("#conceptSummaryInput").value),safety:clean($("#safetyInput").value),
    steps:lines($("#stepsInput").value),observations:lines($("#observationsInput").value),questions:lines($("#questionsInput").value),teacherNote:clean($("#teacherNoteInput").value)};
  $("#editorHeading").textContent=x.name; persist(); renderList(); $("#saveState").textContent="브라우저에 저장됨";
});

function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(archive))}
function download(){
  archive.exportedAt=new Date().toISOString(); const blob=new Blob([JSON.stringify(archive,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="experiment-archive.json";a.click();URL.revokeObjectURL(a.href);
}

$("#newButton").addEventListener("click",()=>newExperiment());
$("#duplicateButton").addEventListener("click",()=>{const x=archive.experiments.find(v=>v.id===selectedId);if(x)newExperiment(x)});
$("#addMaterialButton").addEventListener("click",()=>addMaterialRow());
$("#exportButton").addEventListener("click",download);
$("#importInput").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{archive=normalizeArchive(JSON.parse(await f.text()));selectedId="";persist();el.form.hidden=true;el.welcome.hidden=false;renderList();$("#saveState").textContent="가져온 JSON";}catch{alert("올바른 JSON 파일이 아닙니다.");}e.target.value=""});
[el.search,el.field,el.grade,el.difficulty,el.sort].forEach(x=>["input","change"].forEach(ev=>x.addEventListener(ev,renderList)));
$$(".tab").forEach(b=>b.addEventListener("click",()=>{$$(".tab").forEach(x=>x.classList.toggle("active",x===b));$$(".tab-page").forEach(x=>x.classList.toggle("active",x.dataset.page===b.dataset.tab))}));
boot();
