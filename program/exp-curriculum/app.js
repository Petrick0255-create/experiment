const ARCHIVE_URL="../exp-archive/experiment-archive.json";
const STORAGE_KEY="experiment-curriculum-v1";
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
let selectedExperimentId="";

function defaultState(){
  return{version:1,slotCount:2,plans:{}};
}

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    return saved&&saved.plans?{...defaultState(),...saved}:defaultState();
  }catch{return defaultState()}
}

function persist(message="자동 저장됨"){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  $("#saveState").textContent=message;
}

function currentYear(){
  return String($("#yearInput").value||new Date().getFullYear());
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
  $("#slotCountSelect").value=String(state.slotCount||2);
  buildTabs();
  try{
    const response=await fetch(ARCHIVE_URL,{cache:"no-store"});
    if(!response.ok)throw new Error("실험 JSON을 찾지 못했습니다.");
    const data=await response.json();
    experiments=(data.experiments||[]).filter(item=>item.id&&item.name);
    experimentById=new Map(experiments.map(item=>[item.id,item]));
    $("#saveState").textContent=`실험 ${experiments.length}개 준비됨`;
  }catch(error){
    $("#saveState").textContent="실험 목록 불러오기 실패";
    alert(`${error.message}\nexp-archive 폴더의 experiment-archive.json 위치를 확인해 주세요.`);
  }
  renderAll();
}

function buildTabs(){
  const gradeTabs=$("#gradeTabs");
  GRADES.forEach(grade=>{
    const button=document.createElement("button");
    button.type="button";button.textContent=grade;button.dataset.grade=grade;
    button.addEventListener("click",()=>{currentGrade=grade;renderAll()});
    gradeTabs.append(button);
  });
  const monthTabs=$("#monthTabs");
  MONTHS.forEach(month=>{
    const button=document.createElement("button");
    button.type="button";button.textContent=`${month}월`;button.dataset.month=month;
    button.addEventListener("click",()=>{currentMonth=month;renderAll()});
    monthTabs.append(button);
  });
}

function renderAll(){
  $$("#gradeTabs button").forEach(button=>button.classList.toggle("active",button.dataset.grade===currentGrade));
  $$("#monthTabs button").forEach(button=>button.classList.toggle("active",Number(button.dataset.month)===currentMonth));
  $("#headingGrade").textContent=currentGrade;
  $("#boardYear").textContent=`${currentYear()}년`;
  $("#boardMonth").textContent=`${currentMonth}월`;
  renderLibrary();
  renderBoard();
  renderStats();
}

function filteredExperiments(){
  const query=clean($("#searchInput").value).toLowerCase();
  const field=$("#fieldFilter").value;
  const difficulty=$("#difficultyFilter").value;
  return experiments.filter(item=>{
    const haystack=[item.name,item.code,item.field,item.subfield,item.grade,item.curriculum2025,item.unit,item.coreConcepts]
      .join(" ").toLowerCase();
    return(!query||haystack.includes(query))&&(!field||item.field===field)&&(!difficulty||item.difficulty===difficulty);
  }).sort((a,b)=>a.name.localeCompare(b.name,"ko"));
}

function imageMarkup(item){
  const image=item.images?.[0];
  return image?`<img src="${escapeHtml(image.thumbnailUrl||image.viewUrl)}" alt="">`:`<b>${escapeHtml(item.field?.[0]||"L")}</b>`;
}

function fillCard(card,item){
  $(".card-image",card).innerHTML=imageMarkup(item);
  $(".card-code",card).textContent=item.code||item.id;
  $(".card-title",card).textContent=item.name;
  $(".card-meta",card).textContent=[item.field,item.difficulty].filter(Boolean).join(" · ")||"분류 미입력";
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
      event.dataTransfer.effectAllowed="copy";
      event.dataTransfer.setData("text/plain",JSON.stringify({type:"library",experimentId:item.id}));
    });
    card.addEventListener("click",()=>{
      if(assigned.has(item.id)){
        const location=findAssignment(item.id,currentYear());
        alert(`이미 ${formatLocation(location)}에 배치되어 있습니다.`);
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
  board.innerHTML="";
  WEEKS.forEach(week=>{
    const column=document.createElement("section");
    column.className="week-column";
    column.innerHTML=`<div class="week-head"><strong>${week}주</strong><span>${state.slotCount}개 프로그램</span></div><div class="slot-list"></div>`;
    const slotList=$(".slot-list",column);
    for(let slotIndex=0;slotIndex<state.slotCount;slotIndex++){
      slotList.append(createSlot(year,currentGrade,currentMonth,week,slotIndex));
    }
    board.append(column);
  });
}

function createSlot(year,grade,month,week,slotIndex){
  const slot=document.createElement("div");
  slot.className="experiment-slot";
  slot.dataset.year=year;slot.dataset.grade=grade;slot.dataset.month=month;
  slot.dataset.week=week;slot.dataset.slot=slotIndex;
  const experimentId=getSlots(year,grade,month,week)[slotIndex];
  if(experimentId&&experimentById.has(experimentId)){
    const item=experimentById.get(experimentId);
    const fragment=$("#placedCardTemplate").content.cloneNode(true);
    const card=$(".placed-card",fragment);
    fillCard(card,item);
    card.dataset.id=item.id;
    card.addEventListener("dragstart",event=>{
      event.dataTransfer.effectAllowed="move";
      event.dataTransfer.setData("text/plain",JSON.stringify({
        type:"slot",experimentId:item.id,
        from:{year,grade,month,week,slot:slotIndex}
      }));
    });
    $(".remove-card",card).addEventListener("click",event=>{
      event.stopPropagation();
      ensureSlots(year,grade,month,week)[slotIndex]=null;
      persist("배치 제거됨");renderAll();
    });
    slot.append(card);
  }else{
    slot.innerHTML=`<span class="slot-number">${slotIndex+1}번째 실험</span><div class="slot-placeholder"><b>＋</b><span>카드를 여기에 놓기</span></div>`;
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
  const item=experimentById.get(payload.experimentId);
  if(!item)return;
  const existing=findAssignment(item.id,target.year,payload.type==="slot"?payload.from:null);
  if(existing){
    alert(`‘${item.name}’은(는) 이미 ${formatLocation(existing)}에 배치되어 있습니다.`);
    return;
  }
  const targetSlots=ensureSlots(target.year,target.grade,target.month,target.week);
  const occupying=targetSlots[target.slot];
  if(payload.type==="slot"){
    const from=payload.from;
    const fromSlots=ensureSlots(from.year,from.grade,from.month,from.week);
    if(sameLocation(from,target))return;
    fromSlots[from.slot]=occupying||null;
    targetSlots[target.slot]=item.id;
  }else{
    if(occupying&&!confirm(`이 칸의 실험을 ‘${item.name}’(으)로 교체할까요?`))return;
    targetSlots[target.slot]=item.id;
  }
  selectedExperimentId="";
  persist("배치 저장됨");renderAll();
}

function sameLocation(a,b){
  return String(a.year)===String(b.year)&&a.grade===b.grade&&Number(a.month)===Number(b.month)&&Number(a.week)===Number(b.week)&&Number(a.slot)===Number(b.slot);
}

function findAssignment(experimentId,year,ignore=null){
  const yearPlan=state.plans?.[year]||{};
  for(const grade of GRADES){
    for(const month of MONTHS){
      for(const week of WEEKS){
        const slots=yearPlan?.[grade]?.[month]?.[week]||[];
        for(let slot=0;slot<slots.length;slot++){
          const location={year,grade,month,week,slot};
          if(slots[slot]===experimentId&&(!ignore||!sameLocation(location,ignore)))return location;
        }
      }
    }
  }
  return null;
}

function formatLocation(location){
  return `${location.grade} ${location.month}월 ${location.week}주 ${location.slot+1}번째 실험`;
}

function assignedIds(year){
  const ids=new Set();
  const yearPlan=state.plans?.[year]||{};
  Object.values(yearPlan).forEach(months=>Object.values(months||{}).forEach(weeks=>Object.values(weeks||{}).forEach(slots=>Object.values(slots||{}).flat().forEach(id=>{if(id)ids.add(id)}))));
  return ids;
}

function countGrade(year,grade){
  let count=0;
  MONTHS.forEach(month=>WEEKS.forEach(week=>{
    count+=getSlots(year,grade,month,week).slice(0,state.slotCount).filter(Boolean).length;
  }));
  return count;
}

function renderStats(){
  const assigned=assignedIds(currentYear());
  $("#assignedCount").textContent=assigned.size;
  $("#annualCount").textContent=countGrade(currentYear(),currentGrade);
  $("#annualCapacity").textContent=`/ ${12*4*state.slotCount}`;
}

function changeSlotCount(){
  const next=Number($("#slotCountSelect").value);
  if(next===1){
    const year=currentYear();
    const secondSlotCount=GRADES.reduce((total,grade)=>total+MONTHS.reduce((mTotal,month)=>mTotal+WEEKS.filter(week=>getSlots(year,grade,month,week)[1]).length,0),0);
    if(secondSlotCount&&!confirm(`${year}년의 두 번째 실험 ${secondSlotCount}개가 숨겨집니다.\n데이터는 삭제하지 않고 보존할까요?`)){
      $("#slotCountSelect").value="2";return;
    }
  }
  state.slotCount=next;persist("주당 실험 수 변경됨");renderAll();
}

function exportPlan(){
  const payload={version:1,exportedAt:new Date().toISOString(),state};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);link.download=`curriculum-${currentYear()}.json`;link.click();
  URL.revokeObjectURL(link.href);
}

async function importPlan(file){
  try{
    const data=JSON.parse(await file.text());
    const incoming=data.state||data;
    if(!incoming.plans)throw new Error();
    state={...defaultState(),...incoming};
    $("#slotCountSelect").value=String(state.slotCount||2);
    persist("배치 파일 불러옴");renderAll();
  }catch{alert("올바른 커리큘럼 JSON 파일이 아닙니다.")}
}

function resetCurrentYear(){
  const year=currentYear();
  if(!state.plans[year])return;
  if(!confirm(`${year}년의 모든 학년 커리큘럼을 초기화할까요?\n내려받은 백업이 없으면 복구할 수 없습니다.`))return;
  delete state.plans[year];selectedExperimentId="";
  persist(`${year}년 초기화됨`);renderAll();
}

$("#searchInput").addEventListener("input",renderLibrary);
$("#fieldFilter").addEventListener("change",renderLibrary);
$("#difficultyFilter").addEventListener("change",renderLibrary);
$("#yearInput").addEventListener("change",renderAll);
$("#slotCountSelect").addEventListener("change",changeSlotCount);
$("#cancelSelection").addEventListener("click",()=>{selectedExperimentId="";renderSelection();renderLibrary()});
$("#exportButton").addEventListener("click",exportPlan);
$("#importButton").addEventListener("click",()=>$("#importInput").click());
$("#importInput").addEventListener("change",event=>{const file=event.target.files[0];if(file)importPlan(file);event.target.value=""});
$("#resetButton").addEventListener("click",resetCurrentYear);

boot();
