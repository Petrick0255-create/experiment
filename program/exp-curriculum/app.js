const ARCHIVE_STORAGE_KEY="experiment-archive-working-v2";
const SYNC_CONFIG_KEY="experiment-archive-sync-config";
const STORAGE_KEY="experiment-curriculum-v2";
const LEGACY_STORAGE_KEY="experiment-curriculum-v1";
const GRADES=["7세","1학년","2학년","3학년","4학년","5학년","6학년","중등"];
const MONTHS=Array.from({length:12},(_,i)=>i+1);
const WEEKS=[1,2,3,4];
const $=(q,root=document)=>root.querySelector(q);
const $$=(q,root=document)=>[...root.querySelectorAll(q)];
const clean=value=>String(value??"").trim();
const escapeHtml=value=>clean(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));

let experiments=[];
let experimentById=new Map();
let state=loadState();
let currentGrade="7세";
let currentMonth=1;
let viewMode="month";
let selectedExperimentId="";
let modalExperiment=null;
let modalImageIndex=0;
let hoverTimer=0;
let cardDragging=false;
const dirtyYears=new Set(state.dirtyYears||[]);
const loadedYears=new Set();

function defaultState(){return{version:3,slotCount:2,slotCounts:{},dirtyYears:[],plans:{}}}

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_STORAGE_KEY)||"null");
    return saved?.plans?{...defaultState(),...saved}:defaultState();
  }catch{return defaultState()}
}

function persist(message="자동 저장됨",markDirty=true){
  if(markDirty)dirtyYears.add(currentYear());
  state.dirtyYears=[...dirtyYears];
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  $("#saveState").textContent=message;
}

function currentYear(){return String($("#yearInput").value||new Date().getFullYear())}
function currentSlotCount(year=currentYear()){
  return Number(state.slotCounts?.[year]||state.slotCount||2);
}

function normalizeArchive(raw){
  const base=Array.isArray(raw)?{experiments:raw}:raw||{};
  return(base.experiments||[]).map(item=>({
    ...item,
    id:clean(item.id),
    code:clean(item.code),
    name:clean(item.name||item.실험명),
    field:clean(item.field||item.분야),
    subfield:clean(item.subfield),
    difficulty:clean(item.difficulty),
    grade:clean(item.grade),
    images:Array.isArray(item.images)?item.images:[]
  })).filter(item=>item.id&&item.name);
}

function loadArchiveFromStorage(showAlert=true){
  try{
    const raw=localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if(!raw)throw new Error("저장된 아카이브 JSON이 없습니다.");
    const next=normalizeArchive(JSON.parse(raw));
    if(!next.length)throw new Error("저장된 아카이브에 실험이 없습니다.");
    experiments=next;
    experimentById=new Map(experiments.map(item=>[item.id,item]));
    $("#saveState").textContent=`아카이브 JSON ${experiments.length}개`;
    renderAll();
    return true;
  }catch(error){
    experiments=[];experimentById=new Map();
    $("#saveState").textContent="아카이브 JSON 필요";
    renderAll();
    if(showAlert)alert(`${error.message}\n\n먼저 실험 아카이브 페이지에서 JSON 가져오기를 한 번 실행해 주세요.`);
    return false;
  }
}

function ensureSlots(year,grade,month,week){
  state.plans[year]??={};
  state.plans[year][grade]??={};
  state.plans[year][grade][month]??={};
  state.plans[year][grade][month][week]??=[null,null];
  const slots=state.plans[year][grade][month][week];
  while(slots.length<2)slots.push(null);
  return slots;
}

function getSlots(year,grade,month,week){
  return state.plans?.[year]?.[grade]?.[month]?.[week]||[null,null];
}

async function boot(){
  $("#yearInput").value=new Date().getFullYear();
  $("#slotCountSelect").value=String(currentSlotCount());
  buildGradeTabs();
  bindEvents();
  loadArchiveFromStorage(false);
  if(!experiments.length){
    $("#saveState").textContent="아카이브 페이지에서 JSON을 먼저 가져오세요";
  }
  if(getSyncConfig()&&!dirtyYears.has(currentYear()))await loadCurriculumYear(false);
}

function buildGradeTabs(){
  GRADES.forEach(grade=>{
    const button=document.createElement("button");
    button.type="button";button.textContent=grade;button.dataset.grade=grade;
    button.addEventListener("click",()=>{currentGrade=grade;renderAll()});
    $("#gradeTabs").append(button);
  });
}

function visibleMonths(){
  if(viewMode==="year")return MONTHS;
  if(viewMode==="quarter"){
    const first=Math.floor((currentMonth-1)/3)*3+1;
    return[first,first+1,first+2];
  }
  return[currentMonth];
}

function buildPeriodTabs(){
  const tabs=$("#monthTabs");
  tabs.innerHTML="";
  if(viewMode==="year"){
    tabs.hidden=true;
    return;
  }
  tabs.hidden=false;
  const values=viewMode==="quarter"?[1,4,7,10]:MONTHS;
  values.forEach(value=>{
    const button=document.createElement("button");
    button.type="button";
    button.dataset.month=value;
    button.textContent=viewMode==="quarter"?`${Math.floor((value-1)/3)+1}분기`:`${value}월`;
    const active=viewMode==="quarter"
      ?Math.floor((currentMonth-1)/3)===Math.floor((value-1)/3)
      :currentMonth===value;
    button.classList.toggle("active",active);
    button.addEventListener("click",()=>{currentMonth=value;renderAll()});
    tabs.append(button);
  });
}

function renderAll(){
  $$("#gradeTabs button").forEach(button=>button.classList.toggle("active",button.dataset.grade===currentGrade));
  $$("#viewTabs button").forEach(button=>button.classList.toggle("active",button.dataset.view===viewMode));
  buildPeriodTabs();
  $("#headingGrade").textContent=currentGrade;
  $("#slotCountSelect").value=String(currentSlotCount());
  $("#boardYear").textContent=`${currentYear()}년`;
  const months=visibleMonths();
  $("#boardPeriod").textContent=viewMode==="year"?"연간":viewMode==="quarter"?`${Math.floor((months[0]-1)/3)+1}분기`:`${currentMonth}월`;
  renderLibrary();
  renderBoard();
  renderStats();
}

function filteredExperiments(){
  const query=clean($("#searchInput").value).toLowerCase();
  const field=$("#fieldFilter").value;
  const difficulty=$("#difficultyFilter").value;
  return experiments.filter(item=>{
    const haystack=[item.name,item.code,item.field,item.subfield,item.grade,item.curriculum2025,item.unit,item.coreConcepts].join(" ").toLowerCase();
    return(!query||haystack.includes(query))&&(!field||item.field===field)&&(!difficulty||item.difficulty===difficulty);
  }).sort((a,b)=>a.name.localeCompare(b.name,"ko"));
}

function fillCard(card,item){
  $(".card-code",card).textContent=item.code||item.id;
  $(".card-title",card).textContent=item.name;
  $(".card-grade",card).textContent=item.grade||"학년 미정";
  $(".card-field",card).textContent=item.field||"분야 미정";
  $(".card-difficulty",card).textContent=item.difficulty||"난이도 미정";
  $(".card-curriculum span",card).textContent=item.curriculum2025||item.unit||"교과 연계 미입력";
  attachPreviewEvents(card,item);
}

function attachPreviewEvents(card,item){
  card.addEventListener("mouseenter",event=>{
    clearTimeout(hoverTimer);
    hoverTimer=setTimeout(()=>showHoverPreview(item,event.currentTarget),180);
  });
  card.addEventListener("mouseleave",()=>{
    clearTimeout(hoverTimer);
    $("#hoverPreview").hidden=true;
  });
  card.addEventListener("mousemove",positionHoverPreview);
}

function showHoverPreview(item,anchor){
  const preview=$("#hoverPreview");
  const image=item.images?.[0];
  $("#hoverPreviewImage").hidden=!image;
  $("#hoverPreviewEmpty").hidden=!!image;
  if(image){
    $("#hoverPreviewImage").src=image.thumbnailUrl||image.viewUrl;
    $("#hoverPreviewImage").alt=`${item.name} 미리보기`;
  }
  preview.hidden=false;
  const rect=anchor.getBoundingClientRect();
  positionHoverPreview({clientX:Math.min(rect.right+8,window.innerWidth-20),clientY:rect.top+20});
}

function positionHoverPreview(event){
  const preview=$("#hoverPreview");
  if(preview.hidden)return;
  const width=260,height=Math.min(380,window.innerHeight-30);
  let left=event.clientX+16,top=event.clientY-40;
  if(left+width>window.innerWidth-12)left=event.clientX-width-18;
  top=Math.max(12,Math.min(top,window.innerHeight-height-12));
  preview.style.left=`${left}px`;preview.style.top=`${top}px`;
}

function openArchiveEditor(item){
  const url=new URL("../exp-archive/index.html",window.location.href);
  url.searchParams.set("experiment",item.id);
  window.location.href=url.href;
}

function openImageModal(item,index=0){
  modalExperiment=item;modalImageIndex=index;
  $("#modalCode").textContent=item.code||item.id;
  $("#modalTitle").textContent=item.name;
  renderModalImage();
  $("#imageModal").showModal();
}

function renderModalImage(){
  const images=modalExperiment?.images||[];
  const stage=$("#modalImageStage");
  const tabs=$("#modalImageTabs");
  stage.innerHTML="";tabs.innerHTML="";
  if(!images.length){
    stage.innerHTML="<span>실험지 이미지가 없습니다.</span>";
    return;
  }
  modalImageIndex=Math.min(modalImageIndex,images.length-1);
  const current=images[modalImageIndex];
  const img=document.createElement("img");
  img.src=current.thumbnailUrl||current.viewUrl;
  img.alt=`${modalExperiment.name} 실험지 ${modalImageIndex+1}`;
  stage.append(img);
  images.forEach((image,index)=>{
    const button=document.createElement("button");
    button.type="button";button.textContent=`${image.page||index+1}쪽`;
    button.classList.toggle("active",index===modalImageIndex);
    button.addEventListener("click",()=>{modalImageIndex=index;renderModalImage()});
    tabs.append(button);
  });
}

function renderLibrary(){
  const list=$("#experimentLibrary");
  const items=filteredExperiments();
  const assigned=assignedIds(currentYear());
  list.innerHTML="";
  items.forEach(item=>{
    const fragment=$("#libraryCardTemplate").content.cloneNode(true);
    const card=$(".library-card",fragment);
    fillCard(card,item);
    card.dataset.id=item.id;
    card.classList.toggle("used",assigned.has(item.id));
    card.classList.toggle("selected",selectedExperimentId===item.id);
    card.addEventListener("dragstart",event=>{
      if(assigned.has(item.id)){event.preventDefault();return}
      cardDragging=true;
      event.dataTransfer.effectAllowed="copy";
      event.dataTransfer.setData("text/plain",JSON.stringify({type:"library",experimentId:item.id}));
    });
    card.addEventListener("dragend",()=>setTimeout(()=>{cardDragging=false},0));
    card.addEventListener("click",event=>{
      if(cardDragging||event.target.closest(".select-card"))return;
      openArchiveEditor(item);
    });
    $(".select-card",card).addEventListener("click",event=>{
      event.stopPropagation();
      if(assigned.has(item.id)){
        alert(`이미 ${formatLocation(findAssignment(item.id,currentYear()))}에 배치되어 있습니다.`);
        return;
      }
      selectedExperimentId=selectedExperimentId===item.id?"":item.id;
      renderSelection();renderLibrary();
    });
    list.append(fragment);
  });
  $("#resultCount").textContent=items.length;
  $("#emptyLibrary").hidden=items.length>0;
  renderSelection();
}

function renderSelection(){
  const item=experimentById.get(selectedExperimentId);
  $("#selectedGuide").hidden=!item;
  $("#selectedName").textContent=item?.name||"";
}

function renderBoard(){
  const board=$("#weekBoard");
  const year=currentYear();
  const slotCount=currentSlotCount(year);
  const months=visibleMonths();
  board.innerHTML="";
  board.dataset.view=viewMode;
  months.forEach(month=>{
    const monthSection=document.createElement("section");
    monthSection.className="month-board";
    monthSection.innerHTML=`<div class="month-heading"><strong>${month}월</strong><span>${WEEKS.reduce((n,w)=>n+getSlots(year,currentGrade,month,w).slice(0,slotCount).filter(Boolean).length,0)} / ${4*slotCount}</span></div><div class="month-weeks"></div>`;
    const monthWeeks=$(".month-weeks",monthSection);
    WEEKS.forEach(week=>{
      const column=document.createElement("section");
      column.className="week-column";
      column.innerHTML=`<div class="week-head"><strong>${week}주</strong><span>${slotCount}개</span></div><div class="slot-list"></div>`;
      const slotList=$(".slot-list",column);
      for(let slotIndex=0;slotIndex<slotCount;slotIndex++){
        slotList.append(createSlot(year,currentGrade,month,week,slotIndex));
      }
      monthWeeks.append(column);
    });
    board.append(monthSection);
  });
}

function createSlot(year,grade,month,week,slotIndex){
  const slot=document.createElement("div");
  slot.className="experiment-slot";
  Object.assign(slot.dataset,{year,grade,month,week,slot:slotIndex});
  const experimentId=getSlots(year,grade,month,week)[slotIndex];
  if(experimentId&&experimentById.has(experimentId)){
    const item=experimentById.get(experimentId);
    const fragment=$("#placedCardTemplate").content.cloneNode(true);
    const card=$(".placed-card",fragment);
    fillCard(card,item);card.dataset.id=item.id;
    card.addEventListener("click",event=>{if(!cardDragging&&!event.target.closest(".remove-card"))openArchiveEditor(item)});
    card.addEventListener("dragstart",event=>{
      cardDragging=true;
      event.dataTransfer.effectAllowed="move";
      event.dataTransfer.setData("text/plain",JSON.stringify({type:"slot",experimentId:item.id,from:{year,grade,month,week,slot:slotIndex}}));
    });
    card.addEventListener("dragend",()=>setTimeout(()=>{cardDragging=false},0));
    $(".remove-card",card).addEventListener("click",event=>{
      event.stopPropagation();ensureSlots(year,grade,month,week)[slotIndex]=null;
      persist("배치 제거됨");renderAll();
    });
    slot.append(card);
  }else{
    slot.innerHTML=`<span class="slot-number">${slotIndex+1}</span><div class="slot-placeholder"><b>＋</b><span>카드 놓기</span></div>`;
  }
  slot.addEventListener("dragover",event=>{event.preventDefault();slot.classList.add("drag-over")});
  slot.addEventListener("dragleave",()=>slot.classList.remove("drag-over"));
  slot.addEventListener("drop",event=>{
    event.preventDefault();slot.classList.remove("drag-over");
    try{placeExperiment(JSON.parse(event.dataTransfer.getData("text/plain")),targetFromSlot(slot))}catch{alert("카드를 배치하지 못했습니다.")}
  });
  slot.addEventListener("click",event=>{
    if(event.target.closest(".placed-card")||!selectedExperimentId)return;
    placeExperiment({type:"library",experimentId:selectedExperimentId},targetFromSlot(slot));
  });
  return slot;
}

function targetFromSlot(slot){
  return{year:slot.dataset.year,grade:slot.dataset.grade,month:Number(slot.dataset.month),week:Number(slot.dataset.week),slot:Number(slot.dataset.slot)};
}

function placeExperiment(payload,target){
  const item=experimentById.get(payload.experimentId);if(!item)return;
  const existing=findAssignment(item.id,target.year,payload.type==="slot"?payload.from:null);
  if(existing){alert(`‘${item.name}’은(는) 이미 ${formatLocation(existing)}에 배치되어 있습니다.`);return}
  const targetSlots=ensureSlots(target.year,target.grade,target.month,target.week);
  const occupying=targetSlots[target.slot];
  if(payload.type==="slot"){
    const from=payload.from,fromSlots=ensureSlots(from.year,from.grade,from.month,from.week);
    if(sameLocation(from,target))return;
    fromSlots[from.slot]=occupying||null;targetSlots[target.slot]=item.id;
  }else{
    if(occupying&&!confirm(`이 칸의 실험을 ‘${item.name}’(으)로 교체할까요?`))return;
    targetSlots[target.slot]=item.id;
  }
  selectedExperimentId="";
  persist("배치 저장됨");renderAll();
}

function sameLocation(a,b){return String(a.year)===String(b.year)&&a.grade===b.grade&&Number(a.month)===Number(b.month)&&Number(a.week)===Number(b.week)&&Number(a.slot)===Number(b.slot)}

function findAssignment(experimentId,year,ignore=null){
  const yearPlan=state.plans?.[year]||{};
  for(const grade of GRADES)for(const month of MONTHS)for(const week of WEEKS){
    const slots=(yearPlan?.[grade]?.[month]?.[week]||[]).slice(0,currentSlotCount(year));
    for(let slot=0;slot<slots.length;slot++){
      const location={year,grade,month,week,slot};
      if(slots[slot]===experimentId&&(!ignore||!sameLocation(location,ignore)))return location;
    }
  }
  return null;
}

function formatLocation(location){return`${location.grade} ${location.month}월 ${location.week}주 ${location.slot+1}번째 실험`}

function assignedIds(year){
  const ids=new Set(),yearPlan=state.plans?.[year]||{};
  Object.values(yearPlan).forEach(months=>Object.values(months||{}).forEach(weeks=>Object.values(weeks||{}).forEach(slots=>
    (slots||[]).slice(0,currentSlotCount(year)).forEach(id=>{if(id)ids.add(id)})
  )));
  return ids;
}

function countGrade(year,grade){
  const slotCount=currentSlotCount(year);
  let count=0;MONTHS.forEach(month=>WEEKS.forEach(week=>{count+=getSlots(year,grade,month,week).slice(0,slotCount).filter(Boolean).length}));
  return count;
}

function renderStats(){
  $("#assignedCount").textContent=assignedIds(currentYear()).size;
  $("#annualCount").textContent=countGrade(currentYear(),currentGrade);
  $("#annualCapacity").textContent=`/ ${12*4*currentSlotCount()}`;
}

function changeSlotCount(){
  const next=Number($("#slotCountSelect").value);
  if(next===1){
    const year=currentYear();
    const hidden=GRADES.reduce((total,grade)=>total+MONTHS.reduce((m,month)=>m+WEEKS.filter(week=>getSlots(year,grade,month,week)[1]).length,0),0);
    if(hidden&&!confirm(`${year}년의 두 번째 실험 ${hidden}개가 숨겨집니다.\n데이터는 삭제되지 않습니다.`)){ $("#slotCountSelect").value="2";return }
  }
  state.slotCounts??={};
  state.slotCounts[currentYear()]=next;
  state.slotCount=next;
  persist("주당 실험 수 변경됨 · 동기화 필요");renderAll();
}

function exportPlan(){
  const payload={version:3,exportedAt:new Date().toISOString(),state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`curriculum-${currentYear()}.json`;link.click();URL.revokeObjectURL(link.href);
}

async function importPlan(file){
  try{
    const data=JSON.parse(await file.text()),incoming=data.state||data;
    if(!incoming.plans)throw new Error();
    state={...defaultState(),...incoming};
    dirtyYears.clear();
    Object.keys(state.plans||{}).forEach(year=>dirtyYears.add(year));
    state.dirtyYears=[...dirtyYears];
    $("#slotCountSelect").value=String(currentSlotCount());
    persist("배치 파일 불러옴");renderAll();
  }catch{alert("올바른 커리큘럼 JSON 파일이 아닙니다.")}
}

function resetCurrentYear(){
  const year=currentYear();if(!state.plans[year])return;
  if(!confirm(`${year}년의 모든 학년 커리큘럼을 초기화할까요?\n내려받은 백업이 없으면 복구할 수 없습니다.`))return;
  delete state.plans[year];selectedExperimentId="";persist(`${year}년 초기화됨`);renderAll();
}

function getSyncConfig(){
  try{
    const value=JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)||"null");
    return value?.url&&value?.key?value:null;
  }catch{return null}
}

function configureSync(){
  const current=getSyncConfig()||{};
  const url=prompt("Apps Script 웹 앱 URL을 입력하세요.",current.url||"");
  if(url===null)return null;
  const key=prompt("Apps Script의 동기화 키를 입력하세요.",current.key||"");
  if(key===null)return null;
  const config={url:clean(url),key:clean(key)};
  if(!config.url||!config.key){alert("웹 앱 URL과 동기화 키가 모두 필요합니다.");return null}
  localStorage.setItem(SYNC_CONFIG_KEY,JSON.stringify(config));
  return config;
}

function applyCurriculumYear(curriculum){
  const year=String(curriculum.year);
  state.plans[year]={};
  state.slotCounts??={};
  state.slotCounts[year]=Number(curriculum.slotCount)||2;
  (curriculum.placements||[]).forEach(item=>{
    const order=Number(item.order)-1;
    if(order<0||order>1)return;
    ensureSlots(year,item.grade,Number(item.month),Number(item.week))[order]=item.experimentId;
  });
  dirtyYears.delete(year);
  state.dirtyYears=[...dirtyYears];
  loadedYears.add(year);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  if(year===currentYear()){
    $("#slotCountSelect").value=String(currentSlotCount(year));
    selectedExperimentId="";
    renderAll();
  }
}

async function loadCurriculumYear(showAlert=true){
  const config=getSyncConfig()||(showAlert?configureSync():null);
  if(!config)return false;
  const year=currentYear();
  const button=$("#loadCurriculumButton");
  button.disabled=true;button.textContent="불러오는 중…";
  $("#saveState").textContent=`${year}년 배치 불러오는 중`;
  try{
    const separator=config.url.includes("?")?"&":"?";
    const response=await fetch(`${config.url}${separator}key=${encodeURIComponent(config.key)}&action=curriculum&year=${encodeURIComponent(year)}&_=${Date.now()}`,{cache:"no-store"});
    const result=await response.json();
    if(!result.ok)throw new Error(result.message||"배치를 불러오지 못했습니다.");
    applyCurriculumYear(result.curriculum);
    $("#saveState").textContent=`${year}년 시트 배치 ${result.curriculum.placements.length}개`;
    return true;
  }catch(error){
    console.error(error);
    $("#saveState").textContent="배치 불러오기 실패";
    if(showAlert)alert(`시트 배치를 불러오지 못했습니다.\n${error.message}\n\nApps Script를 새 버전으로 배포했는지 확인해 주세요.`);
    return false;
  }finally{
    button.disabled=false;button.textContent="시트에서 불러오기";
  }
}

function collectYearPlacements(year){
  const placements=[];
  const slotCount=currentSlotCount(year);
  GRADES.forEach(grade=>MONTHS.forEach(month=>WEEKS.forEach(week=>{
    getSlots(year,grade,month,week).slice(0,slotCount).forEach((experimentId,slot)=>{
      if(experimentId)placements.push({grade,month,week,order:slot+1,experimentId});
    });
  })));
  return placements;
}

async function syncCurriculumYear(){
  const config=getSyncConfig()||configureSync();
  if(!config)return;
  const year=currentYear();
  const placements=collectYearPlacements(year);
  const button=$("#syncCurriculumButton");
  button.disabled=true;button.textContent="동기화 중…";
  $("#saveState").textContent=`${year}년 배치 백업 및 저장 중`;
  try{
    const response=await fetch(config.url,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({
        key:config.key,
        action:"curriculum-sync",
        year,
        slotCount:currentSlotCount(year),
        placements
      })
    });
    const result=await response.json();
    if(!result.ok)throw new Error(result.message||"배치 동기화에 실패했습니다.");
    applyCurriculumYear(result.curriculum);
    $("#saveState").textContent=`${year}년 동기화 완료 · ${result.placementCount}개`;
    alert(`${year}년 배치 동기화가 완료되었습니다.\n기존 배치 백업: ${result.backupCount||0}개\n현재 배치: ${result.placementCount||0}개`);
  }catch(error){
    console.error(error);
    $("#saveState").textContent="배치 동기화 실패";
    alert(`배치를 동기화하지 못했습니다.\n${error.message}\n\nApps Script를 새 버전으로 배포했는지 확인해 주세요.`);
  }finally{
    button.disabled=false;button.textContent="배치 동기화";
  }
}

function bindEvents(){
  $("#searchInput").addEventListener("input",renderLibrary);
  $("#fieldFilter").addEventListener("change",renderLibrary);
  $("#difficultyFilter").addEventListener("change",renderLibrary);
  $("#yearInput").addEventListener("change",async()=>{
    renderAll();
    const year=currentYear();
    if(dirtyYears.has(year)){
      $("#saveState").textContent=`${year}년 로컬 수정본 · 동기화 필요`;
      return;
    }
    if(!loadedYears.has(year)&&getSyncConfig())await loadCurriculumYear(false);
  });
  $("#slotCountSelect").addEventListener("change",changeSlotCount);
  $("#cancelSelection").addEventListener("click",()=>{selectedExperimentId="";renderSelection();renderLibrary()});
  $("#reloadArchiveButton").addEventListener("click",()=>loadArchiveFromStorage(true));
  $("#loadCurriculumButton").addEventListener("click",()=>{
    const year=currentYear();
    if(dirtyYears.has(year)&&!confirm(`${year}년의 동기화하지 않은 로컬 수정본을 시트 내용으로 교체할까요?`))return;
    loadCurriculumYear(true);
  });
  $("#syncCurriculumButton").addEventListener("click",syncCurriculumYear);
  $$("#viewTabs button").forEach(button=>button.addEventListener("click",()=>{viewMode=button.dataset.view;renderAll()}));
  $("#exportButton").addEventListener("click",exportPlan);
  $("#importButton").addEventListener("click",()=>$("#importInput").click());
  $("#importInput").addEventListener("change",event=>{const file=event.target.files[0];if(file)importPlan(file);event.target.value=""});
  $("#resetButton").addEventListener("click",resetCurrentYear);
  $("#closeImageModal").addEventListener("click",()=>$("#imageModal").close());
  $("#imageModal").addEventListener("click",event=>{if(event.target===$("#imageModal"))$("#imageModal").close()});
  window.addEventListener("storage",event=>{if(event.key===ARCHIVE_STORAGE_KEY)loadArchiveFromStorage(false)});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadArchiveFromStorage(false)});
}

boot();
