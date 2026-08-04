const STORAGE_KEY="my-experiment-lab-state-v1";
const SYNC_CONFIG_KEY="my-experiment-lab-sync-config";
const ARCHIVE_STORAGE_KEY="experiment-archive-working-v2";
const CURRICULUM_STORAGE_KEY="my-experiment-lab-curriculum-units-v1";
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
let curriculumUnits=loadCurriculumStorage();
let stepImageDrafts=new Map();
let activeStepImageIndex=null;
let stepImageLoadToken=0;
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
    curriculum:clean(item.curriculum),unit:clean(item.unit),goal:clean(item.goal),thinking:clean(item.thinking),worksheetColor:clean(item.worksheetColor)||"#6f93d6",
    stepImages:Array.isArray(item.stepImages)?item.stepImages.slice(0,6).map((image,index)=>({step:Number(image.step)||index+1,fileId:clean(image.fileId),fileName:clean(image.fileName),viewUrl:clean(image.viewUrl),mimeType:clean(image.mimeType),size:Number(image.size)||0,updatedAt:clean(image.updatedAt)})):[],
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

function normalizeCurriculumUnits(raw){
  const seen=new Set();
  return(Array.isArray(raw)?raw:[]).map(item=>({grade:clean(item.grade),semester:clean(item.semester),unitName:clean(item.unitName),content:clean(item.content),unit:clean(item.unit)})).filter(item=>{
    const key=[item.grade,item.semester,item.unit].join("|");if(!item.unit||seen.has(key))return false;seen.add(key);return true;
  });
}

function loadCurriculumStorage(){
  try{return normalizeCurriculumUnits(JSON.parse(localStorage.getItem(CURRICULUM_STORAGE_KEY)||"[]"))}catch{return[]}
}

function cacheCurriculumUnits(){localStorage.setItem(CURRICULUM_STORAGE_KEY,JSON.stringify(curriculumUnits))}

function gradeKey(value){
  const text=clean(value);if(text.includes("7세"))return"7세";if(text.includes("중"))return"중등";const match=text.match(/[1-6]/);return match?`${match[0]}학년`:text;
}

function renderCurriculumOptions(selectedValue=""){
  const select=$("#curriculumInput");if(!select)return;
  const selected=clean(selectedValue||select.value),grade=gradeKey($("#gradeInput")?.value),matched=curriculumUnits.filter(item=>grade&&gradeKey(item.grade)===grade),items=matched.length?matched:curriculumUnits;
  select.innerHTML='<option value="">교과 연계 단원 선택</option>';
  const groups=new Map();items.forEach(item=>{const semester=item.semester?(item.semester.includes("학기")?item.semester:`${item.semester}학기`):"";const label=[item.grade,semester].filter(Boolean).join(" · ")||"교과 단원";if(!groups.has(label))groups.set(label,[]);groups.get(label).push(item)});
  groups.forEach((group,label)=>{const optgroup=document.createElement("optgroup");optgroup.label=label;group.forEach(item=>{const option=document.createElement("option");option.value=item.unit;option.textContent=item.unit.replace(/\r?\n/g," / ");option.title=[item.unitName,item.content].filter(Boolean).join(" — ");optgroup.append(option)});select.append(optgroup)});
  if(selected&&!items.some(item=>item.unit===selected)){const option=document.createElement("option");option.value=selected;option.textContent=`기존 값 · ${selected}`;select.append(option)}
  select.value=selected;
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
      unit:clean(item.unit||item["연계 단원"]),subfield:clean(item.subfield||item["세부 분야"]),
      coreConcepts:clean(item.coreConcepts||item["핵심 개념"]),
      images:Array.isArray(item.images)?item.images.map(image=>({
        fileId:clean(image.fileId),fileName:clean(image.fileName),page:Number(image.page)||1,
        viewUrl:clean(image.viewUrl),thumbnailUrl:clean(image.thumbnailUrl)
      })).sort((a,b)=>a.page-b.page):[]
    };
  }).filter(item=>item.id&&item.name);
}

function boot(){
  const year=new Date().getFullYear();
  $("#materialYear").value=year;$("#curriculumYear").value=year;
  buildGradeOptions();buildPeriodOptions();buildGradeTabs();setupWorksheetModeControl();setupStepImageInputs();bindEvents();
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
    goal:base?.goal||"",thinking:base?.thinking||"",worksheetColor:base?.worksheetColor||"#6f93d6",stepImages:[],materials:base?structuredClone(base.materials):[],steps:base?[...base.steps]:[],observation:base?.observation||"",note:base?.note||"",createdAt:now,updatedAt:now};
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
  $("#targetInput").value=item.target;$("#gradeInput").value=item.grade;renderCurriculumOptions(item.curriculum);$("#unitInput").value=item.unit;
  $("#goalInput").value=item.goal;$("#thinkingInput").value=item.thinking;$("#worksheetColorInput").value=item.worksheetColor||"#6f93d6";$$('.step-input').forEach((input,index)=>{input.value=item.steps[index]||""});$("#observationInput").value=item.observation;$("#noteInput").value=item.note;
  $("#referenceId").value=item.referenceId;$("#referenceName").value=item.referenceName;$("#editorTitle").textContent=item.name||"새 실험";
  renderReferenceSummary();renderMaterialRows(item.materials);prepareStepImages(item);renderExperiments();renderWorksheetPreview();
}

function renderReferenceSummary(){
  const id=$("#referenceId").value,name=$("#referenceName").value;
  $("#referenceSummary").textContent=id?`${name||"이름 없음"} · ${id}`:"연결된 실험이 없습니다.";
  $("#clearReferenceButton").hidden=!id;
  renderReferencePreview();
}

function safeHttpUrl(value){
  try{const url=new URL(clean(value),window.location.href);return["http:","https:"].includes(url.protocol)?url.href:""}catch{return""}
}

function renderReferencePreview(){
  const id=clean($("#referenceId").value),empty=$("#referencePreviewEmpty"),content=$("#referencePreviewContent");
  if(!id){empty.hidden=false;content.hidden=true;return}
  const item=archiveExperiments.find(experiment=>experiment.id===id);
  if(!item){empty.hidden=false;content.hidden=true;$("#referencePreviewEmptyText").textContent="최신 아카이브를 불러오면 원본 정보와 실험지를 확인할 수 있습니다.";return}
  empty.hidden=true;content.hidden=false;$("#referencePreviewEmptyText").textContent="아카이브에서 실험을 선택하면 원본 정보와 실험지가 표시됩니다.";
  $("#referencePreviewCode").textContent=item.code||item.id;$("#referencePreviewName").textContent=item.name;
  $("#openArchiveExperiment").href=`../exp-archive/index.html?experiment=${encodeURIComponent(item.id)}`;
  const info=[
    ["분야",[item.field,item.subfield].filter(Boolean).join(" · ")],
    ["난이도",item.difficulty],["대상·학년",[item.target,item.grade].filter(Boolean).join(" · ")],
    ["교과 연계",item.curriculum],["연계 단원",item.unit],["핵심 개념",item.coreConcepts]
  ].filter(([,value])=>value);
  $("#referenceInfoList").innerHTML=info.map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const imageList=$("#referenceImageList");imageList.innerHTML="";
  if(!item.images.length){imageList.innerHTML='<div class="reference-no-image">연결된 실험지 이미지가 없습니다.</div>';return}
  item.images.forEach((image,index)=>{
    const source=safeHttpUrl(image.thumbnailUrl||image.viewUrl),link=safeHttpUrl(image.viewUrl||image.thumbnailUrl);
    if(!source)return;
    const figure=document.createElement("figure"),anchor=document.createElement("a"),img=document.createElement("img"),caption=document.createElement("figcaption");
    anchor.href=link||source;anchor.target="_blank";anchor.rel="noopener";
    img.src=source;img.alt=`${item.name} 실험지 ${index+1}`;img.loading=index===0?"eager":"lazy";
    caption.textContent=`실험지 ${image.page||index+1}${image.fileName?` · ${image.fileName}`:""}`;
    anchor.append(img);figure.append(anchor,caption);imageList.append(figure);
  });
  if(!imageList.children.length)imageList.innerHTML='<div class="reference-no-image">실험지 주소를 확인할 수 없습니다.</div>';
}

function renderMaterialRows(materials=[]){
  $("#materialsList").innerHTML="";(materials.length?materials:[{}]).forEach(addMaterialRow);
}

function addMaterialRow(material={}){
  const fragment=$("#materialRowTemplate").content.cloneNode(true),row=$(".material-row",fragment);
  $(".material-name",row).value=material.name||"";$(".material-quantity",row).value=material.quantity||"";$(".material-link",row).value=material.link||"";
  $(".remove-material",row).addEventListener("click",()=>{row.remove();renderWorksheetPreview()});$("#materialsList").append(fragment);
}

function collectMaterials(){
  return $$(".material-row").map(row=>({name:clean($(".material-name",row).value),quantity:clean($(".material-quantity",row).value),link:clean($(".material-link",row).value)})).filter(m=>m.name||m.quantity||m.link);
}

function saveExperiment(event){
  event?.preventDefault();const item=state.experiments.find(x=>x.id===$("#myExperimentId").value);if(!item)return;
  const name=clean($("#nameInput").value);if(!name){alert("실험명을 입력해 주세요.");return}
  Object.assign(item,{name,referenceId:clean($("#referenceId").value),referenceName:clean($("#referenceName").value),field:$("#fieldInput").value,
    difficulty:$("#difficultyInput").value,target:$("#targetInput").value,grade:$("#gradeInput").value,curriculum:clean($("#curriculumInput").value),
    unit:clean($("#unitInput").value),goal:clean($("#goalInput").value),thinking:clean($("#thinkingInput").value),worksheetColor:clean($("#worksheetColorInput").value)||"#6f93d6",materials:collectMaterials(),steps:$$('.step-input').map(input=>clean(input.value)),
    observation:clean($("#observationInput").value),note:clean($("#noteInput").value),updatedAt:new Date().toISOString()});
  $("#editorTitle").textContent=item.name;persist("내 실험 저장됨");renderAll();
}

function deleteExperiment(){
  const item=state.experiments.find(x=>x.id===selectedExperimentId);if(!item||!confirm(`‘${item.name||"이름 없는 실험"}’을 삭제할까요?\n커리큘럼 배치와 준비물 체크도 함께 삭제됩니다.`))return;
  state.experiments=state.experiments.filter(x=>x.id!==item.id);state.placements=state.placements.filter(p=>p.experimentId!==item.id);stepImageDrafts.delete(item.id);
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
  const currentCurriculum=clean($("#curriculumInput").value);renderCurriculumOptions(currentCurriculum||item.curriculum);if(!clean($("#unitInput").value))$("#unitInput").value=item.unit;
  renderReferenceSummary();renderWorksheetPreview();$("#archiveDialog").close();
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

const WORKSHEET_SIZE={width:1240,height:1754};
let worksheetRenderFrame=0;

function worksheetValues(){
  const materials=collectMaterials().map(item=>[item.name,item.quantity].filter(Boolean).join(" ")).filter(Boolean).join(" · ");
  return{
    title:clean($("#nameInput")?.value)||"실험 제목",
    curriculum:clean($("#curriculumInput")?.value)||clean($("#unitInput")?.value),
    audience:[clean($("#targetInput")?.value),clean($("#gradeInput")?.value)].filter(Boolean).join(" · "),
    goal:clean($("#goalInput")?.value),materials,thinking:clean($("#thinkingInput")?.value),color:clean($("#worksheetColorInput")?.value)||"#6f93d6",
    steps:$$('.step-input').map(input=>clean(input.value))
  };
}

function mixHex(color,mix="#ffffff",amount=.5){
  const parse=value=>{const raw=String(value||"").replace("#","");if(!/^[0-9a-f]{6}$/i.test(raw))return[111,147,214];return[0,2,4].map(index=>parseInt(raw.slice(index,index+2),16))};
  const a=parse(color),b=parse(mix);return`#${a.map((value,index)=>Math.round(value*(1-amount)+b[index]*amount).toString(16).padStart(2,"0")).join("")}`;
}

function roundedRect(context,x,y,width,height,radius,fill,stroke=""){
  const r=Math.min(radius,width/2,height/2);context.beginPath();context.moveTo(x+r,y);context.lineTo(x+width-r,y);context.quadraticCurveTo(x+width,y,x+width,y+r);context.lineTo(x+width,y+height-r);context.quadraticCurveTo(x+width,y+height,x+width-r,y+height);context.lineTo(x+r,y+height);context.quadraticCurveTo(x,y+height,x,y+height-r);context.lineTo(x,y+r);context.quadraticCurveTo(x,y,x+r,y);context.closePath();if(fill){context.fillStyle=fill;context.fill()}if(stroke){context.strokeStyle=stroke;context.lineWidth=1.5;context.stroke()}
}

function drawImageContain(context,image,x,y,width,height){
  if(!image?.naturalWidth&&!image?.width)return;const sourceWidth=image.naturalWidth||image.width,sourceHeight=image.naturalHeight||image.height,ratio=Math.min(width/sourceWidth,height/sourceHeight),drawWidth=sourceWidth*ratio,drawHeight=sourceHeight*ratio;
  context.fillStyle="#fff";context.fillRect(x,y,width,height);context.drawImage(image,x+(width-drawWidth)/2,y+(height-drawHeight)/2,drawWidth,drawHeight);
}

function splitCanvasLines(context,text,maxWidth){
  const paragraphs=String(text||"").split(/\r?\n/),result=[];
  paragraphs.forEach((paragraph,paragraphIndex)=>{
    if(!paragraph){result.push("");return}
    let line="";
    [...paragraph].forEach(char=>{
      const candidate=line+char;
      if(line&&context.measureText(candidate).width>maxWidth){result.push(line.trimEnd());line=char.trimStart()}else line=candidate;
    });
    if(line)result.push(line.trimEnd());
    if(paragraphIndex<paragraphs.length-1&&paragraph)result.push("");
  });
  return result;
}

function drawFittedText(context,text,box,options={}){
  const value=clean(text);if(!value)return{shrunk:false,truncated:false};
  const weight=options.weight||500,maxSize=options.maxSize||34,minSize=options.minSize||18,lineRatio=options.lineRatio||1.48;
  let size=maxSize,lines=[],lineHeight=0,maxLines=0;
  while(size>=minSize){
    context.font=`${weight} ${size}px "Noto Sans KR", sans-serif`;
    lines=splitCanvasLines(context,value,box.width);lineHeight=size*lineRatio;maxLines=Math.max(1,Math.floor(box.height/lineHeight));
    if(lines.length<=maxLines)break;size-=2;
  }
  const truncated=lines.length>maxLines;
  if(truncated){
    lines=lines.slice(0,maxLines);let last=lines.length-1,ending=lines[last].replace(/\s+$/g,"");
    while(ending&&context.measureText(`${ending}…`).width>box.width)ending=ending.slice(0,-1);
    lines[last]=`${ending}…`;
  }
  context.fillStyle=options.color||"#1d1d1f";context.textBaseline="top";context.textAlign=options.align||"left";
  const x=options.align==="right"?box.x+box.width:options.align==="center"?box.x+box.width/2:box.x;
  lines.forEach((line,index)=>{
    const y=box.y+index*lineHeight,characters=[...line],measured=context.measureText(line).width;
    if(options.justify&&index<lines.length-1&&characters.length>1&&measured>box.width*.7){
      const widths=characters.map(char=>context.measureText(char).width),spacing=Math.max(0,(box.width-widths.reduce((sum,width)=>sum+width,0))/(characters.length-1));let cursor=box.x;
      characters.forEach((char,charIndex)=>{context.fillText(char,cursor,y);cursor+=widths[charIndex]+(charIndex<characters.length-1?spacing:0)});
    }else context.fillText(line,x,y);
  });
  return{shrunk:size<maxSize,truncated};
}

function setupWorksheetModeControl(){
  const tools=$(".worksheet-tools");if(!tools||$("#worksheetMode"))return;
  const label=document.createElement("label");label.className="color-picker";label.textContent="유형";
  const select=document.createElement("select");select.id="worksheetMode";select.innerHTML='<option value="auto">자동</option><option value="low">저학년용</option><option value="high">고학년용</option>';select.style.cssText="height:25px;padding:0 5px;border:0;border-radius:5px;background:#f3f5f8;color:#334057;font-size:9px;font-weight:700;outline:0";
  label.append(select);tools.prepend(label);select.addEventListener("change",renderWorksheetPreview);
}

function worksheetMode(){
  const selected=$("#worksheetMode")?.value||"auto";if(selected!=="auto")return selected;
  return["7세","1학년","2학년"].includes(gradeKey($("#gradeInput")?.value))?"low":"high";
}

function worksheetModeName(){return worksheetMode()==="low"?"저학년용":"고학년용"}

function setupStepImageInputs(){
  $$(".step-input").forEach((textarea,index)=>{
    if(textarea.parentElement.querySelector(".step-image-box"))return;
    const box=document.createElement("div");box.className="step-image-box";box.dataset.stepImage=String(index);box.tabIndex=0;
    box.innerHTML=`<img alt="${index+1}단계 실험 사진" hidden><div class="step-image-placeholder"><strong>실험 사진</strong><span>클릭 후 Ctrl+V · 드래그 가능</span></div><div class="step-image-actions"><button type="button" data-image-select>파일 선택</button><button type="button" data-image-remove hidden>삭제</button></div><input type="file" accept="image/*" hidden>`;
    textarea.before(box);const input=$("input[type=file]",box);
    box.addEventListener("click",()=>{activeStepImageIndex=index;box.focus()});
    $("[data-image-select]",box).addEventListener("click",event=>{event.stopPropagation();activeStepImageIndex=index;input.click()});
    $("[data-image-remove]",box).addEventListener("click",event=>{event.stopPropagation();removeStepImage(index)});
    input.addEventListener("change",event=>{const file=event.target.files[0];if(file)setStepImageFile(index,file);event.target.value=""});
    box.addEventListener("dragover",event=>{event.preventDefault();box.classList.add("drag-over")});box.addEventListener("dragleave",()=>box.classList.remove("drag-over"));
    box.addEventListener("drop",event=>{event.preventDefault();box.classList.remove("drag-over");activeStepImageIndex=index;const file=[...event.dataTransfer.files].find(item=>item.type.startsWith("image/"));if(file)setStepImageFile(index,file)});
  });
  document.addEventListener("paste",event=>{const direct=[...(event.clipboardData?.files||[])].find(item=>item.type.startsWith("image/")),clipboardItem=[...(event.clipboardData?.items||[])].find(item=>item.type.startsWith("image/")),file=direct||clipboardItem?.getAsFile();if(!file||activeStepImageIndex===null)return;event.preventDefault();setStepImageFile(activeStepImageIndex,file)});
}

function draftArrayFor(item){
  if(!item)return Array(6).fill(null);
  if(!stepImageDrafts.has(item.id)){
    const drafts=Array(6).fill(null);(item.stepImages||[]).forEach((image,index)=>{const position=Math.max(0,Math.min(5,(Number(image.step)||index+1)-1));drafts[position]={...image,dirty:false,removed:false,dataUrl:"",image:null}});stepImageDrafts.set(item.id,drafts);
  }
  return stepImageDrafts.get(item.id);
}

function currentStepImageDrafts(){return draftArrayFor(state.experiments.find(item=>item.id===selectedExperimentId))}

function prepareStepImages(item){
  draftArrayFor(item);renderStepImageInputs();
  if((item.stepImages||[]).some(image=>image.fileId))loadStoredStepImages(item.id);
}

function renderStepImageInputs(){
  const drafts=currentStepImageDrafts();$$('.step-image-box').forEach((box,index)=>{const draft=drafts[index],img=$("img",box),placeholder=$(".step-image-placeholder",box),remove=$("[data-image-remove]",box);box.classList.toggle("active",activeStepImageIndex===index);
    if(draft?.dataUrl){img.src=draft.dataUrl;img.hidden=false;placeholder.hidden=true;remove.hidden=false;box.classList.add("has-image")}
    else{img.removeAttribute("src");img.hidden=true;placeholder.hidden=false;remove.hidden=!draft?.fileId;box.classList.remove("has-image");$("span",placeholder).textContent=draft?.fileId?"Drive 이미지 불러오는 중…":"클릭 후 Ctrl+V · 드래그 가능"}
  });
}

async function imageSource(file){
  if(window.createImageBitmap)return createImageBitmap(file);
  const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url})}finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}
}

function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}

function dataUrlImage(dataUrl){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=dataUrl})}

async function compressStepImage(file){
  if(!file.type.startsWith("image/"))throw new Error("이미지 파일만 사용할 수 있습니다.");
  const source=await imageSource(file),maxWidth=1200,maxHeight=900,ratio=Math.min(1,maxWidth/source.width,maxHeight/source.height),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(source.width*ratio));canvas.height=Math.max(1,Math.round(source.height*ratio));
  const context=canvas.getContext("2d");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);if(source.close)source.close();
  let blob=null;for(const quality of[.78,.68,.58]){blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));if(blob&&blob.size<=320000)break}if(!blob)throw new Error("이미지를 압축하지 못했습니다.");
  return{dataUrl:await blobDataUrl(blob),mimeType:"image/jpeg",size:blob.size};
}

async function setStepImageFile(index,file){
  const item=state.experiments.find(experiment=>experiment.id===selectedExperimentId);if(!item){alert("실험을 먼저 선택해 주세요.");return}
  const box=$(`.step-image-box[data-step-image="${index}"]`);box?.classList.add("loading");$("#saveState").textContent=`${index+1}단계 이미지 압축 중…`;
  try{const compressed=await compressStepImage(file),image=await dataUrlImage(compressed.dataUrl),drafts=draftArrayFor(item),previous=drafts[index]||{};drafts[index]={...previous,step:index+1,dataUrl:compressed.dataUrl,image,mimeType:compressed.mimeType,size:compressed.size,dirty:true,removed:false};state.dirty=true;persist(`${index+1}단계 이미지 준비됨 · 시트 동기화 필요`);renderStepImageInputs();renderWorksheetPreview()}
  catch(error){console.error(error);alert(error.message)}finally{box?.classList.remove("loading")}
}

function removeStepImage(index){
  const item=state.experiments.find(experiment=>experiment.id===selectedExperimentId);if(!item)return;const drafts=draftArrayFor(item),previous=drafts[index]||{};drafts[index]={...previous,step:index+1,dataUrl:"",image:null,dirty:true,removed:true};state.dirty=true;persist(`${index+1}단계 이미지 삭제 예정 · 시트 동기화 필요`);renderStepImageInputs();renderWorksheetPreview();
}

async function loadStoredStepImages(experimentId){
  const config=getSyncConfig();if(!config)return;const token=++stepImageLoadToken;
  try{const sep=config.url.includes("?")?"&":"?",response=await fetch(`${config.url}${sep}key=${encodeURIComponent(config.key)}&action=stepImages&experimentId=${encodeURIComponent(experimentId)}&_=${Date.now()}`,{cache:"no-store"}),result=await response.json();if(!result.ok)throw new Error(result.message||"단계 이미지 불러오기 실패");if(token!==stepImageLoadToken||selectedExperimentId!==experimentId)return;
    const item=state.experiments.find(experiment=>experiment.id===experimentId),drafts=draftArrayFor(item);for(const stored of result.images||[]){const index=Number(stored.step)-1;if(index<0||index>5||drafts[index]?.dirty)continue;const image=await dataUrlImage(stored.dataUrl);drafts[index]={...(drafts[index]||{}),...stored,image,dirty:false,removed:false}}
    renderStepImageInputs();renderWorksheetPreview();
  }catch(error){console.error(error);$("#saveState").textContent="단계 이미지 불러오기 실패"}
}

function collectStepImageChanges(){
  const changes=[];stepImageDrafts.forEach((drafts,experimentId)=>drafts.forEach((draft,index)=>{if(!draft?.dirty)return;changes.push({experimentId,step:index+1,fileId:draft.fileId||"",dataUrl:draft.removed?"":draft.dataUrl||"",remove:!!draft.removed})}));return changes;
}

function reconcileStepImageDrafts(){
  state.experiments.forEach(item=>{const drafts=stepImageDrafts.get(item.id);if(!drafts)return;const metadata=Array(6).fill(null);(item.stepImages||[]).forEach((image,index)=>metadata[(Number(image.step)||index+1)-1]=image);for(let index=0;index<6;index++){const current=drafts[index],saved=metadata[index];drafts[index]=saved?{...saved,dataUrl:current?.removed?"":current?.dataUrl||"",image:current?.removed?null:current?.image||null,dirty:false,removed:false}:null}});renderStepImageInputs();
}

function drawWorksheet(canvas,exportScale=1){
  const context=canvas.getContext("2d"),scale=(canvas.width/WORKSHEET_SIZE.width)||exportScale;
  context.setTransform(scale,0,0,scale,0,0);context.clearRect(0,0,WORKSHEET_SIZE.width,WORKSHEET_SIZE.height);
  const data=worksheetValues(),warnings=[],isLow=worksheetMode()==="low";
  const accent=data.color,background=mixHex(accent,"#ffffff",isLow ? .89 : .95),soft=mixHex(accent,"#ffffff",isLow ? .77 : .86),line=mixHex(accent,"#ffffff",isLow ? .48 : .58),ink="#202532";
  context.fillStyle=background;context.fillRect(0,0,WORKSHEET_SIZE.width,WORKSHEET_SIZE.height);
  roundedRect(context,55,45,1130,1664,isLow?40:28,"#ffffff",mixHex(accent,"#ffffff",.7));
  roundedRect(context,55,45,1130,isLow?18:12,isLow?9:6,accent);
  context.fillStyle=soft;context.beginPath();context.arc(1124,104,isLow?74:60,0,Math.PI*2);context.fill();
  context.fillStyle=accent;const dots=isLow?[[1068,103,7],[1100,139,5],[1143,153,9],[101,1664,7],[126,1642,4]]:[[1090,118,5],[1112,137,4],[1081,148,3]];dots.forEach(([x,y,r])=>{context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill()});
  const text=(value,x,y,size,weight=700,color=ink)=>{context.fillStyle=color;context.font=`${weight} ${size}px "Noto Sans KR", sans-serif`;context.textBaseline="top";context.textAlign="left";context.fillText(value,x,y)};
  const fit=(value,box,options)=>{const result=drawFittedText(context,value,box,options);if(result.shrunk||result.truncated)warnings.push(result);return result};
  const sectionLabel=(label,x,y,width)=>{if(isLow){roundedRect(context,x,y,width,37,18,soft);text(label,x+16,y+7,18,700,accent)}else{context.fillStyle=accent;context.fillRect(x,y,34,4);text(label,x,y+16,23,700,ink)}};

  text(isLow?"MY LITTLE SCIENCE LAB":"EXPERIMENT WORKSHEET",77,76,isLow?14:13,700,accent);
  text("①",76,108,isLow?50:46,700,accent);fit(data.title,{x:143,y:108,width:650,height:72},{maxSize:isLow?45:43,minSize:29,weight:700,lineRatio:1.25,color:ink});
  text("교과 연계",835,83,18,700,accent);fit(data.curriculum||"교과 연계를 입력하세요",{x:835,y:113,width:310,height:72},{maxSize:18,minSize:12,weight:500,lineRatio:1.28,color:data.curriculum?ink:"#a4a9b2"});
  if(data.audience)fit(data.audience,{x:835,y:194,width:310,height:22},{maxSize:14,minSize:11,weight:600,color:"#626b79",align:"right"});
  context.strokeStyle=line;context.lineWidth=1.5;context.beginPath();context.moveTo(76,220);context.lineTo(1164,220);context.stroke();

  sectionLabel("학습 목표",76,258,isLow?126:0);
  fit(data.goal||"학습 목표를 입력하세요",{x:76,y:320,width:505,height:112},{maxSize:21,minSize:15,weight:500,lineRatio:1.34,color:data.goal?ink:"#a4a9b2"});
  context.strokeStyle=mixHex(accent,"#ffffff",.72);context.beginPath();context.moveTo(618,258);context.lineTo(618,438);context.stroke();
  sectionLabel("준비물",655,258,isLow?103:0);
  fit(data.materials||"준비물을 입력하세요",{x:655,y:320,width:490,height:112},{maxSize:21,minSize:15,weight:500,lineRatio:1.55,color:data.materials?ink:"#a4a9b2"});
  context.strokeStyle=line;context.beginPath();context.moveTo(76,463);context.lineTo(1164,463);context.stroke();

  sectionLabel(isLow?"생각 톡톡":"수업 전 생각해보기",76,500,isLow?116:0);
  fit(data.thinking||"실험 전에 생각해 볼 내용을 입력하세요",{x:305,y:502,width:840,height:112},{maxSize:22,minSize:15,weight:500,lineRatio:1.34,color:data.thinking?ink:"#a4a9b2"});
  context.strokeStyle=line;context.beginPath();context.moveTo(76,640);context.lineTo(1164,640);context.stroke();
  text(isLow?"차근차근 실험해요":"실험 과정",76,675,isLow?27:25,700,isLow?accent:ink);text("사진을 붙이고 각 단계의 과정을 정리합니다.",isLow?300:205,682,14,500,"#7b8390");

  const columns=[76,447,818],rows=[735,1215],stepDrafts=currentStepImageDrafts();
  for(let index=0;index<6;index++){
    const x=columns[index%3],y=rows[Math.floor(index/3)];
    text(isLow?`${index+1}단계`:`STEP ${String(index+1).padStart(2,"0")}`,x,y,isLow?16:14,700,accent);
    const photo=stepDrafts[index]?.image;if(photo){context.save();context.beginPath();context.rect(x+3,y+33,340,214);context.clip();drawImageContain(context,photo,x+3,y+33,340,214);context.restore();roundedRect(context,x,y+30,346,220,isLow?24:15,"",mixHex(accent,"#ffffff",.52))}
    else{context.save();context.setLineDash(isLow?[6,6]:[8,7]);roundedRect(context,x,y+30,346,220,isLow?24:15,"",mixHex(accent,"#ffffff",.52));context.restore();context.strokeStyle=mixHex(accent,"#ffffff",.5);context.lineWidth=2;context.beginPath();context.moveTo(x+154,y+129);context.lineTo(x+192,y+129);context.moveTo(x+173,y+110);context.lineTo(x+173,y+148);context.stroke();context.textAlign="center";context.fillStyle="#a0a7b1";context.font=`500 ${isLow?14:13}px "Noto Sans KR", sans-serif`;context.fillText(isLow?"사진 붙이기":"실험 사진",x+173,y+164);context.textAlign="left"}
    roundedRect(context,x,y+270,36,36,isLow?18:10,accent);text(`${index+1}`,x+12,y+276,18,700,"#fff");
    fit(data.steps[index]||`${index+1}단계를 입력하세요`,{x:x+50,y:y+270,width:296,height:140},{maxSize:20,minSize:14,weight:500,lineRatio:1.42,justify:true,color:data.steps[index]?ink:"#a4a9b2"});
  }
  text(isLow?"MY LAB · LITTLE SCIENTIST":"MY LAB · EXPERIMENT WORKSHEET",isLow?900:852,1668,11,700,mixHex(accent,"#1d1d1f",.25));
  return warnings;
}

function renderWorksheetPreview(){
  cancelAnimationFrame(worksheetRenderFrame);worksheetRenderFrame=requestAnimationFrame(async()=>{
    if(document.fonts?.ready)await document.fonts.ready;
    const canvas=$("#worksheetCanvas");if(!canvas)return;
    const warnings=drawWorksheet(canvas),status=$("#worksheetStatus");
    if(status)status.textContent=warnings.some(item=>item.truncated)?`${worksheetModeName()} · 내용이 너무 길어 일부가 생략되었습니다.`:warnings.length?`${worksheetModeName()} · 긴 내용에 맞춰 글자 크기를 조절했습니다.`:`${worksheetModeName()} · 입력 내용이 실시간으로 반영됩니다.`;
  });
}

function switchPreview(tab){
  $$("#previewTabs button").forEach(button=>button.classList.toggle("active",button.dataset.preview===tab));
  $$("[data-preview-panel]").forEach(panel=>panel.classList.toggle("active",panel.dataset.previewPanel===tab));
  if(tab==="worksheet")renderWorksheetPreview();
}

async function downloadWorksheet(){
  const button=$("#downloadWorksheetButton");button.disabled=true;button.textContent="만드는 중…";
  try{
    if(document.fonts?.ready)await document.fonts.ready;
    const canvas=document.createElement("canvas");canvas.width=2480;canvas.height=3508;drawWorksheet(canvas,2);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("이미지를 만들 수 없습니다.");
    const url=URL.createObjectURL(blob),link=document.createElement("a"),safeName=(clean($("#nameInput").value)||"실험지").replace(/[\\/:*?\"<>|]/g,"_");
    link.href=url;link.download=`${clean($("#myExperimentId").value)||"MY"}_${safeName}_${worksheetModeName()}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){console.error(error);alert(error.message)}finally{button.disabled=false;button.textContent="PNG 저장"}
}

function renderAll(){renderExperiments();renderCurriculum();renderMaterialsChecklist();renderReferencePreview();renderCurriculumOptions($("#curriculumInput")?.value);renderWorksheetPreview()}

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
    archiveExperiments=normalizeArchive(result.payload.archiveExperiments||[]);cacheArchiveExperiments();curriculumUnits=normalizeCurriculumUnits(result.payload.curriculumUnits||[]);cacheCurriculumUnits();state=normalizeState({...result.payload,dirty:false});persist(`시트에서 불러옴 · 내 실험 ${state.experiments.length}개 · 교과 단원 ${curriculumUnits.length}개`,false);renderAll();return true;
  }catch(error){console.error(error);if(showAlert)alert(`시트 정보를 불러오지 못했습니다.\n${error.message}`);$("#saveState").textContent="시트 불러오기 실패";return false}
  finally{button.disabled=false;button.textContent="시트 동기화"}
}

async function syncToSheet(){
  const config=getSyncConfig()||configureSync();if(!config)return;if(!state.dirty&&state.experiments.length===0){await loadFromSheet(true);return}
  const button=$("#syncButton");button.disabled=true;button.textContent="동기화 중…";$("#saveState").textContent="백업 및 시트 갱신 중";
  try{const payload={version:1,experiments:state.experiments,placements:state.placements,checks:state.checks,slotCounts:state.slotCounts,updatedAt:new Date().toISOString()},imageChanges=collectStepImageChanges();
    const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({key:config.key,action:"sync",payload,imageChanges})});const result=await response.json();if(!result.ok)throw new Error(result.message||"동기화 실패");
    archiveExperiments=normalizeArchive(result.payload.archiveExperiments||[]);cacheArchiveExperiments();curriculumUnits=normalizeCurriculumUnits(result.payload.curriculumUnits||[]);cacheCurriculumUnits();state=normalizeState({...result.payload,dirty:false});reconcileStepImageDrafts();persist(`동기화 완료 · 내 실험 ${state.experiments.length}개 · 단계 이미지 ${result.savedImageCount||0}장`,false);renderAll();alert(`동기화가 완료되었습니다.\n내 실험 ${state.experiments.length}개 · 배치 ${state.placements.length}개\n저장·삭제된 단계 이미지 ${result.savedImageCount||0}장`);
  }catch(error){console.error(error);$("#saveState").textContent="동기화 실패";alert(`동기화하지 못했습니다.\n${error.message}`)}finally{button.disabled=false;button.textContent="시트 동기화"}
}

function bindEvents(){
  $$(".bottom-tabs button").forEach(button=>button.addEventListener("click",()=>switchTab(button.dataset.tab)));
  $("#newExperimentButton").addEventListener("click",()=>newExperiment());$("#experimentForm").addEventListener("submit",saveExperiment);$("#deleteExperimentButton").addEventListener("click",deleteExperiment);
  $("#addMaterialButton").addEventListener("click",()=>{addMaterialRow();renderWorksheetPreview()});[$("#experimentSearch"),$("#experimentFieldFilter"),$("#experimentGradeFilter")].forEach(input=>["input","change"].forEach(ev=>input.addEventListener(ev,renderExperiments)));
  $("#chooseReferenceButton").addEventListener("click",openArchivePicker);$("#clearReferenceButton").addEventListener("click",()=>{$("#referenceId").value="";$("#referenceName").value="";renderReferenceSummary()});
  $("#closeArchiveDialog").addEventListener("click",()=>$("#archiveDialog").close());$("#archiveSearch").addEventListener("input",renderArchiveList);$("#loadArchiveFileButton").addEventListener("click",()=>$("#archiveFileInput").click());$("#archiveFileInput").addEventListener("change",event=>importArchiveFile(event.target.files[0]));
  [$ ("#materialYear"),$("#materialGrade"),$("#materialPeriod")].forEach(input=>input.addEventListener("change",renderMaterialsChecklist));$("#clearWeekChecks").addEventListener("click",clearWeekChecks);
  $("#gradeTabs").addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;curriculumGrade=button.dataset.grade;renderCurriculum()});
  $("#viewTabs").addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;curriculumView=button.dataset.view;renderCurriculum()});
  $("#curriculumSearch").addEventListener("input",renderCurriculumLibrary);$("#curriculumYear").addEventListener("change",()=>{selectedDeckId="";renderCurriculum()});
  $("#slotCount").addEventListener("change",()=>{const year=currentCurriculumYear(),next=Number($("#slotCount").value);if(next===1&&state.placements.some(p=>p.year===year&&p.order===2)&&!confirm("두 번째 실험 배치는 숨겨집니다. 계속할까요?")){ $("#slotCount").value=2;return}state.slotCounts[year]=next;persist("주당 실험 수 저장됨");renderCurriculum()});
  $("#syncSettingsButton").addEventListener("click",configureSync);$("#syncButton").addEventListener("click",syncToSheet);
  $("#previewTabs").addEventListener("click",event=>{const button=event.target.closest("button[data-preview]");if(button)switchPreview(button.dataset.preview)});
  $("#experimentForm").addEventListener("input",renderWorksheetPreview);$("#experimentForm").addEventListener("change",renderWorksheetPreview);
  $("#downloadWorksheetButton").addEventListener("click",downloadWorksheet);
  $("#gradeInput").addEventListener("change",()=>renderCurriculumOptions(""));
}

boot();
