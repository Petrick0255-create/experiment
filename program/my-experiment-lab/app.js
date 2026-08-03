const STORAGE_KEY="my-experiment-lab-state-v1";
const SYNC_CONFIG_KEY="my-experiment-lab-sync-config";
const ARCHIVE_STORAGE_KEY="experiment-archive-working-v2";
const GRADES=["7세","1학년","2학년","3학년","4학년","5학년","6학년","중등"];
const MONTHS=Array.from({length:12},(_,i)=>i+1);
const WEEKS=[1,2,3,4];
const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>[...root.querySelectorAll(q)];
const clean=value=>String(value??"").trim();
const lines=value=>clean(value).split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const escapeHtml=value=>clean(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

let state=loadState();
let archiveExperiments=loadArchiveStorage();
let selectedExperimentId="";
let selectedDeckId="";
let currentTab="experiments";
let curriculumGrade="7세";
let curriculumMonth=1;
let curriculumView="month";
let dragStarted=false;

function defaultState(){return{version:1,experiments:[],placements:[],checks:{},slotCounts:{},dirty:false,updatedAt:""}}

function normalizeState(raw){
  const base={...defaultState(),...(raw||{})};
  base.experiments=(base.experiments||[]).map(item=>({
    id:clean(item.id),name:clean(item.name),referenceId:clean(item.referenceId),referenceName:clean(item.referenceName),
    field:clean(item.field),difficulty:clean(item.difficulty),target:clean(item.target),grade:clean(item.grade),
    curriculum:clean(item.curriculum),unit:clean(item.unit),goal:clean(item.goal),
    materials:Array.isArray(item.materials)?item.materials.map(m=>({name:clean(m.name),quantity:clean(m.quantity),link:clean(m.link)})):[],
    steps:Array.isArray(item.steps)?item.steps:lines(item.steps),observation:clean(item.observation),note:clean(item.note),
    createdAt:item.createdAt||"",updatedAt:item.updatedAt||""
  })).filter(item=>item.id);
  base.placements=(base.placements||[]).map(item=>({
    id:clean(item.id),year:Number(item.year),grade:clean(item.grade),month:Number(item.month),week:Number(item.week),
    order:Number(item.order),experimentId:clean(item.experimentId),updatedAt:item.updatedAt||""
  })).filter(item=>item.id&&item.experimentId);
  base.checks=base.checks&&typeof base.checks==="object"?base.checks:{};
  base.slotCounts=base.slotCounts&&typeof base.slotCounts==="object"?base.slotCounts:{};
  return base;
}

function loadState(){
  try{return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||"null"))}catch{return defaultState()}
}

function persist(message="브라우저에 저장됨",dirty=true){
  if(dirty)state.dirty=true;
  state.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  $("#saveState").textContent=message;
}

function loadArchiveStorage(){
  try{return normalizeArchive(JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY)||"null"))}catch{return[]}
}

function normalizeArchive(raw){
  const base=Array.isArray(raw)?{experiments:raw}:raw||{};
  return(base.experiments||[]).map(item=>{
    const rawField=clean(item.field||item.분야);
    const rawDifficulty=clean(item.difficulty||item.난이도);
    return{
      id:clean(item.id),code:clean(item.code),name:clean(item.name||item.실험명),
      field:rawField==="생명과학"?"생명":rawField,
      difficulty:rawDifficulty==="보통"?"중간":rawDifficulty,
      target:clean(item.target||item.대상),grade:clean(item.grade||item.학년),
      curriculum:clean(item.curriculum2025||item.curriculum||item["2025 교과 연계"]),
      unit:clean(item.unit||item["연계 단원"])
    };
  }).filter(item=>item.id&&item.name);
}

function boot(){
  const year=new Date().getFullYear();
  $("#materialYear").value=year;$("#curriculumYear").value=year;
  buildGradeOptions();buildPeriodOptions();buildGradeTabs();bindEvents();
  renderAll();
  const config=getSyncConfig();
  if(config&&!state.dirty)loadFromSheet(false);
}

function buildGradeOptions(){
  $("#materialGrade").innerHTML=GRADES.map(g=>`<option>${g}</option>`).join("");
}

function buildPeriodOptions(){
  $("#materialPeriod").innerHTML=MONTHS.flatMap(month=>WEEKS.map(week=>`<option value="${month}-${week}">${month}월 ${week}주</option>`)).join("");
}

function buildGradeTabs(){
  $("#gradeTabs").innerHTML=GRADES.map(grade=>`<button type="button" data-grade="${grade}">${grade}</button>`).join("");
}

function switchTab(tab){
  currentTab=tab;
  $$(".tab-page").forEach(page=>page.classList.toggle("active",page.dataset.page===tab));
  $$(".bottom-tabs button").forEach(button=>button.classList.toggle("active",button.dataset.tab===tab));
  if(tab==="materials")renderMaterialsChecklist();
  if(tab==="curriculum")renderCurriculum();
  window.scrollTo({top:0,behavior:"smooth"});
}

function nextExperimentId(){
  const numbers=state.experiments.map(item=>Number((item.id.match(/\d+$/)||[])[0])).filter(Number.isFinite);
  return`MY-${String(Math.max(0,...numbers)+1).padStart(4,"0")}`;
}

function newExperiment(base=null){
  const now=new Date().toISOString();
  const item={id:nextExperimentId(),name:base?`${base.name} 새 계획`:"",referenceId:base?.referenceId||"",referenceName:base?.referenceName||"",
    field:base?.field||"",difficulty:base?.difficulty||"",target:base?.target||"",grade:base?.grade||"",curriculum:base?.curriculum||"",unit:base?.unit||"",
    goal:base?.goal||"",materials:base?structuredClone(base.materials):[],steps:base?[...base.steps]:[],observation:base?.observation||"",note:base?.note||"",createdAt:now,updatedAt:now};
  state.experiments.unshift(item);selectedExperimentId=item.id;persist("새 실험 생성됨");renderExperiments();openEditor(item.id);
}

function filteredMyExperiments(){
  const query=clean($("#experimentSearch").value).toLowerCase();
  const field=$("#experimentFieldFilter").value,grade=$("#experimentGradeFilter").value;
  return state.experiments.filter(item=>{
    const text=[item.name,item.referenceName,item.field,item.grade,item.curriculum,item.unit,item.goal].join(" ").toLowerCase();
    return(!query||text.includes(query))&&(!field||item.field===field)&&(!grade||item.grade===grade);
  }).sort((a,b)=>clean(b.updatedAt).localeCompare(clean(a.updatedAt))||a.name.localeCompare(b.name,"ko"));
}

function renderExperiments(){
  const items=filteredMyExperiments(),list=$("#myExperimentList");list.innerHTML="";
  items.forEach(item=>{
    const button=document.createElement("button");button.type="button";button.className="my-experiment-card";button.classList.toggle("active",item.id===selectedExperimentId);
    button.innerHTML=`<div><strong>${escapeHtml(item.name||"이름 없는 실험")}</strong><small>${escapeHtml([item.field,item.grade,item.unit].filter(Boolean).join(" · ")||"분류 미입력")}</small><div class="card-tags">${item.difficulty?`<span class="tag blue">${escapeHtml(item.difficulty)}</span>`:""}${item.curriculum?`<span class="tag">${escapeHtml(item.curriculum)}</span>`:""}</div></div>${item.referenceId?'<span class="reference-tag">참고 연결</span>':''}`;
    button.addEventListener("click",()=>openEditor(item.id));list.append(button);
  });
  $("#myExperimentCount").textContent=state.experiments.length;$("#filteredExperimentCount").textContent=`${items.length}개 표시`;
  $("#myExperimentEmpty").hidden=items.length>0;
}

function openEditor(id){
  const item=state.experiments.find(x=>x.id===id);if(!item)return;
  selectedExperimentId=id;$("#editorEmpty").hidden=true;$("#experimentForm").hidden=false;
  $("#myExperimentId").value=item.id;$("#nameInput").value=item.name;$("#fieldInput").value=item.field;$("#difficultyInput").value=item.difficulty;
  $("#targetInput").value=item.target;$("#gradeInput").value=item.grade;$("#curriculumInput").value=item.curriculum;$("#unitInput").value=item.unit;
  $("#goalInput").value=item.goal;$("#stepsInput").value=item.steps.join("\n");$("#observationInput").value=item.observation;$("#noteInput").value=item.note;
  $("#referenceId").value=item.referenceId;$("#referenceName").value=item.referenceName;$("#editorTitle").textContent=item.name||"새 실험";
  renderReferenceSummary();renderMaterialRows(item.materials);renderExperiments();
}

function renderReferenceSummary(){
  const id=$("#referenceId").value,name=$("#referenceName").value;
  $("#referenceSummary").textContent=id?`${name||"이름 없음"} · ${id}`:"연결된 실험이 없습니다.";
  $("#clearReferenceButton").hidden=!id;
}

function renderMaterialRows(materials=[]){
  $("#materialsList").innerHTML="";(materials.length?materials:[{}]).forEach(addMaterialRow);
}

function addMaterialRow(material={}){
  const fragment=$("#materialRowTemplate").content.cloneNode(true),row=$(".material-row",fragment);
  $(".material-name",row).value=material.name||"";$(".material-quantity",row).value=material.quantity||"";$(".material-link",row).value=material.link||"";
  $(".remove-material",row).addEventListener("click",()=>row.remove());$("#materialsList").append(fragment);
}

function collectMaterials(){
  return $$(".material-row").map(row=>({name:clean($(".material-name",row).value),quantity:clean($(".material-quantity",row).value),link:clean($(".material-link",row).value)})).filter(m=>m.name||m.quantity||m.link);
}

function saveExperiment(event){
  event?.preventDefault();const item=state.experiments.find(x=>x.id===$("#myExperimentId").value);if(!item)return;
  const name=clean($("#nameInput").value);if(!name){alert("실험명을 입력해 주세요.");return}
  Object.assign(item,{name,referenceId:clean($("#referenceId").value),referenceName:clean($("#referenceName").value),field:$("#fieldInput").value,
    difficulty:$("#difficultyInput").value,target:$("#targetInput").value,grade:$("#gradeInput").value,curriculum:clean($("#curriculumInput").value),
    unit:clean($("#unitInput").value),goal:clean($("#goalInput").value),materials:collectMaterials(),steps:lines($("#stepsInput").value),
    observation:clean($("#observationInput").value),note:clean($("#noteInput").value),updatedAt:new Date().toISOString()});
  $("#editorTitle").textContent=item.name;persist("내 실험 저장됨");renderAll();
}

function deleteExperiment(){
  const item=state.experiments.find(x=>x.id===selectedExperimentId);if(!item||!confirm(`‘${item.name||"이름 없는 실험"}’을 삭제할까요?\n커리큘럼 배치와 준비물 체크도 함께 삭제됩니다.`))return;
  state.experiments=state.experiments.filter(x=>x.id!==item.id);state.placements=state.placements.filter(p=>p.experimentId!==item.id);
  Object.keys(state.checks).forEach(key=>{if(key.includes(`-${item.id}-`))delete state.checks[key]});
  selectedExperimentId="";$("#experimentForm").hidden=true;$("#editorEmpty").hidden=false;persist("실험 삭제됨");renderAll();
}

function openArchivePicker(){archiveExperiments=loadArchiveStorage().length?loadArchiveStorage():archiveExperiments;renderArchiveList();$("#archiveDialog").showModal()}

function renderArchiveList(){
  const query=clean($("#archiveSearch").value).toLowerCase();
  const items=archiveExperiments.filter(item=>!query||[item.name,item.code,item.field,item.grade,item.curriculum,item.unit].join(" ").toLowerCase().includes(query)).slice(0,300);
  $("#archiveList").innerHTML="";items.forEach(item=>{
    const row=document.createElement("div");row.className="archive-item";row.innerHTML=`<div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([item.code||item.id,item.field,item.grade,item.curriculum].filter(Boolean).join(" · "))}</small></div><button class="button ghost small" type="button">선택</button>`;
    $("button",row).addEventListener("click",()=>selectReference(item));$("#archiveList").append(row);
  });$("#archiveEmpty").hidden=items.length>0;
}

function selectReference(item){
  $("#referenceId").value=item.id;$("#referenceName").value=item.name;
  if(!clean($("#nameInput").value))$("#nameInput").value=item.name+" 새 계획";
  if(!$("#fieldInput").value)$("#fieldInput").value=item.field;if(!$("#difficultyInput").value)$("#difficultyInput").value=item.difficulty;
  if(!$("#targetInput").value)$("#targetInput").value=item.target;if(!$("#gradeInput").value)$("#gradeInput").value=item.grade;
  if(!clean($("#curriculumInput").value))$("#curriculumInput").value=item.curriculum;if(!clean($("#unitInput").value))$("#unitInput").value=item.unit;
  renderReferenceSummary();$("#archiveDialog").close();
}

async function importArchiveFile(file){
  if(!file)return;try{archiveExperiments=normalizeArchive(JSON.parse(await file.text()));if(!archiveExperiments.length)throw new Error();cacheArchiveExperiments();renderArchiveList()}catch{alert("올바른 실험 아카이브 JSON이 아닙니다.")}
}

function cacheArchiveExperiments(){
  localStorage.setItem(ARCHIVE_STORAGE_KEY,JSON.stringify({schemaVersion:2,experiments:archiveExperiments,exportedAt:new Date().toISOString()}));
}

function currentCurriculumYear(){return Number($("#curriculumYear").value)||new Date().getFullYear()}
function currentSlotCount(year=currentCurriculumYear()){return Number(state.slotCounts[year]||2)}
function placementAt(year,grade,month,week,order){return state.placements.find(p=>p.year===year&&p.grade===grade&&p.month===month&&p.week===week&&p.order===order)}
function assignmentOf(year,experimentId){return state.placements.find(p=>p.year===year&&p.experimentId===experimentId)}
function experimentById(id){return state.experiments.find(item=>item.id===id)}

function placementId(year,grade,month,week,order){return`${year}-${grade}-${String(month).padStart(2,"0")}-${String(week).padStart(2,"0")}-${order}`}

function visibleMonths(){
  if(curriculumView==="year")return MONTHS;
  if(curriculumView==="quarter"){const first=Math.floor((curriculumMonth-1)/3)*3+1;return[first,first+1,first+2]}
  return[curriculumMonth];
}

function renderCurriculum(){
  $$("#gradeTabs button").forEach(button=>button.classList.toggle("active",button.dataset.grade===curriculumGrade));
  $$("#viewTabs button").forEach(button=>button.classList.toggle("active",button.dataset.view===curriculumView));
  $("#curriculumGradeTitle").textContent=curriculumGrade;$("#slotCount").value=currentSlotCount();buildMonthTabs();renderCurriculumLibrary();renderBoard();renderCurriculumStats();
}

function buildMonthTabs(){
  const values=curriculumView==="quarter"?[1,4,7,10]:MONTHS,tabs=$("#monthTabs");tabs.hidden=curriculumView==="year";tabs.innerHTML="";
  values.forEach(month=>{const button=document.createElement("button");button.type="button";button.textContent=curriculumView==="quarter"?`${Math.floor((month-1)/3)+1}분기`:`${month}월`;
    button.classList.toggle("active",curriculumView==="quarter"?Math.floor((curriculumMonth-1)/3)===Math.floor((month-1)/3):curriculumMonth===month);
    button.addEventListener("click",()=>{curriculumMonth=month;renderCurriculum()});tabs.append(button)});
}

function curriculumFilteredExperiments(){
  const query=clean($("#curriculumSearch").value).toLowerCase();return state.experiments.filter(item=>!query||[item.name,item.field,item.grade,item.unit].join(" ").toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name,"ko"));
}

function cardInner(item,addButton=false){
  return`${addButton?'<button class="card-add" type="button" aria-label="배치 선택">＋</button>':''}<strong>${escapeHtml(item.name||"이름 없는 실험")}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.grade||"학년 미정")}</small><div class="card-tags"><span class="tag blue">${escapeHtml(item.field||"분야 미정")}</span>${item.difficulty?`<span class="tag">${escapeHtml(item.difficulty)}</span>`:""}</div>`;
}

function renderCurriculumLibrary(){
  const list=$("#curriculumLibrary"),items=curriculumFilteredExperiments(),year=currentCurriculumYear();list.innerHTML="";
  items.forEach(item=>{const card=document.createElement("article");card.className="deck-card";card.draggable=!assignmentOf(year,item.id);card.classList.toggle("used",!!assignmentOf(year,item.id));card.classList.toggle("selected",selectedDeckId===item.id);card.innerHTML=cardInner(item,true);
    card.addEventListener("dragstart",event=>{if(assignmentOf(year,item.id)){event.preventDefault();return}dragStarted=true;event.dataTransfer.setData("text/plain",JSON.stringify({type:"library",experimentId:item.id}))});
    card.addEventListener("dragend",()=>setTimeout(()=>{dragStarted=false},0));
    $(".card-add",card).addEventListener("click",event=>{event.stopPropagation();if(assignmentOf(year,item.id)){alert("이미 이 연도에 배치된 실험입니다.");return}selectedDeckId=selectedDeckId===item.id?"":item.id;renderCurriculumLibrary()});
    card.addEventListener("click",event=>{if(dragStarted||event.target.closest(".card-add"))return;switchTab("experiments");openEditor(item.id)});list.append(card)});
  $("#curriculumResultCount").textContent=`${items.length}개`;$("#curriculumLibraryEmpty").hidden=items.length>0;
}

function renderBoard(){
  const board=$("#curriculumBoard"),year=currentCurriculumYear(),slotCount=currentSlotCount(),months=visibleMonths();board.innerHTML="";board.classList.toggle("year-view",curriculumView==="year");
  $("#boardYear").textContent=`${year}년`;$("#boardPeriod").textContent=curriculumView==="year"?"연간 프로그램":curriculumView==="quarter"?`${Math.floor((months[0]-1)/3)+1}분기 프로그램`:`${curriculumMonth}월 프로그램`;
  months.forEach(month=>{const section=document.createElement("section");section.className="month-board";const count=state.placements.filter(p=>p.year===year&&p.grade===curriculumGrade&&p.month===month&&p.order<=slotCount).length;
    section.innerHTML=`<div class="month-heading"><strong>${month}월</strong><span>${count} / ${4*slotCount}</span></div><div class="month-weeks"></div>`;const weeks=$(".month-weeks",section);
    WEEKS.forEach(week=>{const column=document.createElement("section");column.className="week-column";column.innerHTML=`<div class="week-head"><strong>${week}주</strong><span>${slotCount}개</span></div><div class="slot-list"></div>`;
      for(let order=1;order<=slotCount;order++)$(".slot-list",column).append(createSlot(year,curriculumGrade,month,week,order));weeks.append(column)});board.append(section)});
}

function createSlot(year,grade,month,week,order){
  const slot=document.createElement("div");slot.className="experiment-slot";const placement=placementAt(year,grade,month,week,order),item=placement&&experimentById(placement.experimentId);
  if(item){const card=document.createElement("article");card.className="placed-card";card.draggable=true;card.innerHTML=`<button class="remove-card" type="button">×</button>${cardInner(item)}`;
    card.addEventListener("dragstart",event=>{dragStarted=true;event.dataTransfer.setData("text/plain",JSON.stringify({type:"placement",placementId:placement.id,experimentId:item.id}))});card.addEventListener("dragend",()=>setTimeout(()=>{dragStarted=false},0));
    $(".remove-card",card).addEventListener("click",event=>{event.stopPropagation();removePlacement(placement.id)});card.addEventListener("click",event=>{if(!dragStarted&&!event.target.closest(".remove-card")){switchTab("experiments");openEditor(item.id)}});slot.append(card);
  }else slot.innerHTML='<div class="slot-placeholder"><b>＋</b><span>카드 놓기</span></div>';
  slot.addEventListener("dragover",event=>{event.preventDefault();slot.classList.add("drag-over")});slot.addEventListener("dragleave",()=>slot.classList.remove("drag-over"));
  slot.addEventListener("drop",event=>{event.preventDefault();slot.classList.remove("drag-over");try{placeExperiment(JSON.parse(event.dataTransfer.getData("text/plain")),{year,grade,month,week,order})}catch{alert("카드를 배치하지 못했습니다.")}});
  slot.addEventListener("click",event=>{if(event.target.closest(".placed-card")||!selectedDeckId)return;placeExperiment({type:"library",experimentId:selectedDeckId},{year,grade,month,week,order})});return slot;
}

function placeExperiment(payload,target){
  const experimentId=payload.experimentId,item=experimentById(experimentId);if(!item)return;
  const existingAssignment=assignmentOf(target.year,experimentId),targetPlacement=placementAt(target.year,target.grade,target.month,target.week,target.order);
  if(existingAssignment&&existingAssignment.id!==payload.placementId){alert(`이미 ${existingAssignment.grade} ${existingAssignment.month}월 ${existingAssignment.week}주 ${existingAssignment.order}번째에 배치되어 있습니다.`);return}
  if(targetPlacement&&targetPlacement.id!==payload.placementId&&!confirm(`‘${experimentById(targetPlacement.experimentId)?.name||"기존 실험"}’을 교체할까요?`))return;
  if(targetPlacement)state.placements=state.placements.filter(p=>p.id!==targetPlacement.id);
  if(payload.type==="placement")state.placements=state.placements.filter(p=>p.id!==payload.placementId);
  const id=placementId(target.year,target.grade,target.month,target.week,target.order);
  state.placements.push({id,...target,experimentId,updatedAt:new Date().toISOString()});selectedDeckId="";persist("커리큘럼 배치 저장됨");renderCurriculum();
}

function removePlacement(id){state.placements=state.placements.filter(p=>p.id!==id);persist("배치 제거됨");renderCurriculum()}

function renderCurriculumStats(){
  const year=currentCurriculumYear(),slotCount=currentSlotCount(),count=state.placements.filter(p=>p.year===year&&p.grade===curriculumGrade&&p.order<=slotCount).length;
  $("#annualPlacementCount").textContent=count;$("#annualCapacity").textContent=`/ ${12*4*slotCount}`;
}

function materialSelection(){
  const [month,week]=$("#materialPeriod").value.split("-").map(Number);return{year:Number($("#materialYear").value),grade:$("#materialGrade").value,month,week};
}

function checkId(selection,placement,materialIndex){return`${selection.year}-${selection.grade}-${String(selection.month).padStart(2,"0")}-${String(selection.week).padStart(2,"0")}-${placement.order}-${placement.experimentId}-${materialIndex}`}

function renderMaterialsChecklist(){
  const selection=materialSelection(),placements=state.placements.filter(p=>p.year===selection.year&&p.grade===selection.grade&&p.month===selection.month&&p.week===selection.week).sort((a,b)=>a.order-b.order),container=$("#materialChecklist");container.innerHTML="";
  let total=0,done=0;placements.forEach(placement=>{const item=experimentById(placement.experimentId);if(!item)return;const group=document.createElement("section");group.className="material-group";
    group.innerHTML=`<div class="material-group-head"><div><span class="order-badge">${placement.order}</span><strong>${escapeHtml(item.name)}</strong></div><small>${escapeHtml(item.id)}</small></div><div class="check-rows"></div>`;
    const rows=$(".check-rows",group);if(!item.materials.length)rows.innerHTML='<div class="check-row"><span></span><span class="check-name">준비물이 입력되지 않았습니다.</span><span></span><span></span></div>';
    item.materials.forEach((material,index)=>{const id=checkId(selection,placement,index),checked=!!state.checks[id];total++;if(checked)done++;const row=document.createElement("label");row.className="check-row";row.classList.toggle("done",checked);
      row.innerHTML=`<input type="checkbox" ${checked?"checked":""}><span class="check-name">${escapeHtml(material.name||"이름 없는 준비물")}</span><span class="check-quantity">${escapeHtml(material.quantity||"수량 미입력")}</span>${material.link?`<a class="purchase-link" href="${escapeHtml(material.link)}" target="_blank" rel="noopener">구매처 열기 ↗</a>`:'<span class="no-link">링크 없음</span>'}`;
      $("input",row).addEventListener("change",event=>{state.checks[id]=event.target.checked;if(!event.target.checked)delete state.checks[id];persist("준비물 체크 저장됨");renderMaterialsChecklist()});rows.append(row)});container.append(group)});
  $("#materialEmpty").hidden=placements.length>0;$("#weeklyYearLabel").textContent=`${selection.year} CURRICULUM · ${selection.grade}`;$("#weeklyTitle").textContent=`${selection.month}월 ${selection.week}주 준비물`;
  $("#materialProgress").textContent=`${done} / ${total}`;$("#materialProgressBar").style.width=total?`${done/total*100}%`:"0%";
}

function clearWeekChecks(){
  const s=materialSelection(),prefix=`${s.year}-${s.grade}-${String(s.month).padStart(2,"0")}-${String(s.week).padStart(2,"0")}-`;
  if(!Object.keys(state.checks).some(k=>k.startsWith(prefix)))return;if(!confirm("이번 주 준비물 체크를 모두 해제할까요?"))return;
  Object.keys(state.checks).forEach(key=>{if(key.startsWith(prefix))delete state.checks[key]});persist("체크 초기화됨");renderMaterialsChecklist();
}

function renderAll(){renderExperiments();renderCurriculum();renderMaterialsChecklist()}

function getSyncConfig(){
  try{const value=JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)||"null");return value?.url&&value?.key?value:null}catch{return null}
}

function configureSync(){
  const current=getSyncConfig()||{};const url=prompt("Apps Script 웹 앱 URL을 입력하세요.",current.url||"");if(url===null)return null;
  const key=prompt("동기화 키를 입력하세요.",current.key||"");if(key===null)return null;const config={url:clean(url),key:clean(key)};
  if(!config.url||!config.key){alert("웹 앱 URL과 동기화 키가 모두 필요합니다.");return null}localStorage.setItem(SYNC_CONFIG_KEY,JSON.stringify(config));$("#saveState").textContent="동기화 연결 설정됨";return config;
}

async function loadFromSheet(showAlert=true){
  const config=getSyncConfig()||(showAlert?configureSync():null);if(!config)return false;const button=$("#syncButton");button.disabled=true;button.textContent="불러오는 중…";
  try{const sep=config.url.includes("?")?"&":"?",response=await fetch(`${config.url}${sep}key=${encodeURIComponent(config.key)}&action=load&_=${Date.now()}`,{cache:"no-store"});const result=await response.json();if(!result.ok)throw new Error(result.message||"불러오기 실패");
    archiveExperiments=normalizeArchive(result.payload.archiveExperiments||[]);cacheArchiveExperiments();state=normalizeState({...result.payload,dirty:false});persist(`시트에서 불러옴 · 내 실험 ${state.experiments.length}개 · 참고 ${archiveExperiments.length}개`,false);renderAll();return true;
  }catch(error){console.error(error);if(showAlert)alert(`시트 정보를 불러오지 못했습니다.\n${error.message}`);$("#saveState").textContent="시트 불러오기 실패";return false}
  finally{button.disabled=false;button.textContent="시트 동기화"}
}

async function syncToSheet(){
  const config=getSyncConfig()||configureSync();if(!config)return;if(!state.dirty&&state.experiments.length===0){await loadFromSheet(true);return}
  const button=$("#syncButton");button.disabled=true;button.textContent="동기화 중…";$("#saveState").textContent="백업 및 시트 갱신 중";
  try{const payload={version:1,experiments:state.experiments,placements:state.placements,checks:state.checks,slotCounts:state.slotCounts,updatedAt:new Date().toISOString()};
    const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({key:config.key,action:"sync",payload})});const result=await response.json();if(!result.ok)throw new Error(result.message||"동기화 실패");
    archiveExperiments=normalizeArchive(result.payload.archiveExperiments||[]);cacheArchiveExperiments();state=normalizeState({...result.payload,dirty:false});persist(`동기화 완료 · 내 실험 ${state.experiments.length}개 · 참고 ${archiveExperiments.length}개`,false);renderAll();alert(`동기화가 완료되었습니다.\n내 실험 ${state.experiments.length}개 · 배치 ${state.placements.length}개\n아카이브 참고 목록 ${archiveExperiments.length}개`);
  }catch(error){console.error(error);$("#saveState").textContent="동기화 실패";alert(`동기화하지 못했습니다.\n${error.message}`)}finally{button.disabled=false;button.textContent="시트 동기화"}
}

function bindEvents(){
  $$(".bottom-tabs button").forEach(button=>button.addEventListener("click",()=>switchTab(button.dataset.tab)));
  $("#newExperimentButton").addEventListener("click",()=>newExperiment());$("#experimentForm").addEventListener("submit",saveExperiment);$("#deleteExperimentButton").addEventListener("click",deleteExperiment);
  $("#addMaterialButton").addEventListener("click",()=>addMaterialRow());[$("#experimentSearch"),$("#experimentFieldFilter"),$("#experimentGradeFilter")].forEach(input=>["input","change"].forEach(ev=>input.addEventListener(ev,renderExperiments)));
  $("#chooseReferenceButton").addEventListener("click",openArchivePicker);$("#clearReferenceButton").addEventListener("click",()=>{$("#referenceId").value="";$("#referenceName").value="";renderReferenceSummary()});
  $("#closeArchiveDialog").addEventListener("click",()=>$("#archiveDialog").close());$("#archiveSearch").addEventListener("input",renderArchiveList);$("#loadArchiveFileButton").addEventListener("click",()=>$("#archiveFileInput").click());$("#archiveFileInput").addEventListener("change",event=>importArchiveFile(event.target.files[0]));
  [$ ("#materialYear"),$("#materialGrade"),$("#materialPeriod")].forEach(input=>input.addEventListener("change",renderMaterialsChecklist));$("#clearWeekChecks").addEventListener("click",clearWeekChecks);
  $("#gradeTabs").addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;curriculumGrade=button.dataset.grade;renderCurriculum()});
  $("#viewTabs").addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;curriculumView=button.dataset.view;renderCurriculum()});
  $("#curriculumSearch").addEventListener("input",renderCurriculumLibrary);$("#curriculumYear").addEventListener("change",()=>{selectedDeckId="";renderCurriculum()});
  $("#slotCount").addEventListener("change",()=>{const year=currentCurriculumYear(),next=Number($("#slotCount").value);if(next===1&&state.placements.some(p=>p.year===year&&p.order===2)&&!confirm("두 번째 실험 배치는 숨겨집니다. 계속할까요?")){ $("#slotCount").value=2;return}state.slotCounts[year]=next;persist("주당 실험 수 저장됨");renderCurriculum()});
  $("#syncSettingsButton").addEventListener("click",configureSync);$("#syncButton").addEventListener("click",syncToSheet);
}

boot();
