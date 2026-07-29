const STORAGE_KEY = "lab-note-experiments-v1";

const FIELD_CODES = {
  물리: "PHY", 화학: "CHE", 생명과학: "BIO", 지구과학: "EAR",
  수학: "MAT", 공학: "ENG", 예술: "ART"
};

const sampleExperiments = [
  {
    id: crypto.randomUUID(), code: "PHY-001", name: "사이펀의 원리", category: "물리",
    grade: "3학년", difficulty: "보통", status: "완성",
    curriculum: "초-3-1-Ⅰ 힘과 우리 생활",
    description: "높이가 다른 두 용기 사이에서 물이 이동하는 현상을 관찰합니다.",
    materials: [{ name: "투명 호스", quantity: "1개", link: "" }, { name: "비커", quantity: "2개", link: "" }],
    image: "", localImage: "사이펀의 원리.png", goal: "사이펀 현상을 관찰하고 물의 이동을 설명한다.",
    safety: "물을 흘리지 않도록 주의한다.", procedure: "1. 두 비커의 높이를 다르게 놓는다.\n2. 호스에 물을 채운다.\n3. 물의 이동을 관찰한다.",
    observation: "", question: "물이 계속 이동하는 까닭은 무엇일까요?", teacherNote: "",
    createdAt: Date.now() - 500000, updatedAt: Date.now() - 500000
  },
  {
    id: crypto.randomUUID(), code: "CHE-001", name: "전분물 탐구", category: "화학",
    grade: "7세", difficulty: "쉬움", status: "완성",
    curriculum: "초-3-2-Ⅰ 물체와 물질",
    description: "전분물에 힘을 가할 때 나타나는 독특한 성질을 탐구합니다.",
    materials: [{ name: "전분", quantity: "100 g", link: "" }, { name: "물", quantity: "적당량", link: "" }],
    image: "", localImage: "전분물 탐구.png", goal: "전분물의 점성과 탄성을 감각적으로 비교한다.",
    safety: "전분물을 먹지 않는다.", procedure: "1. 전분과 물을 섞는다.\n2. 천천히 누르고 빠르게 두드린다.",
    observation: "", question: "누르는 방법에 따라 느낌이 다른 이유는 무엇일까요?", teacherNote: "",
    createdAt: Date.now() - 400000, updatedAt: Date.now() - 400000
  },
  {
    id: crypto.randomUUID(), code: "BIO-001", name: "나무 줄기의 구조", category: "생명과학",
    grade: "2학년", difficulty: "쉬움", status: "완성",
    curriculum: "초-3-1-Ⅲ 식물의 생활",
    description: "나무 줄기의 단면에서 나이테와 여러 구조를 관찰합니다.",
    materials: [{ name: "나무 단면 표본", quantity: "모둠별 1개", link: "" }, { name: "돋보기", quantity: "1개", link: "" }],
    image: "", localImage: "나무 줄기의 구조.png", goal: "줄기의 구조를 관찰하고 각 부분의 특징을 말한다.",
    safety: "표본의 거친 면에 손을 다치지 않도록 한다.", procedure: "1. 맨눈으로 관찰한다.\n2. 돋보기로 세부 구조를 찾는다.",
    observation: "", question: "나이테의 간격이 다른 까닭은 무엇일까요?", teacherNote: "",
    createdAt: Date.now() - 300000, updatedAt: Date.now() - 300000
  },
  {
    id: crypto.randomUUID(), code: "ENG-001", name: "에어로켓 설계", category: "공학",
    grade: "4학년", difficulty: "어려움", status: "계획 중",
    curriculum: "초-4-1 힘과 운동 연계",
    description: "발사 거리와 안정성을 고려해 에어로켓을 설계하는 신규 프로그램입니다.",
    materials: [{ name: "페트병", quantity: "1개", link: "" }, { name: "두꺼운 종이", quantity: "2장", link: "" }],
    image: "", localImage: "", goal: "조건에 맞는 로켓을 설계하고 개선한다.", safety: "사람을 향해 발사하지 않는다.",
    procedure: "", observation: "", question: "", teacherNote: "야외 실험 공간 확인",
    createdAt: Date.now() - 200000, updatedAt: Date.now() - 200000
  }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  grid: $("#experimentGrid"), empty: $("#emptyState"), form: $("#experimentForm"),
  dialog: $("#editorDialog"), materials: $("#materialsList"), imagePreview: $("#imagePreview"),
  search: $("#searchInput"), field: $("#fieldFilter"), grade: $("#gradeFilter"),
  difficulty: $("#difficultyFilter"), sort: $("#sortSelect"), resultCount: $("#resultCount")
};

let experiments = loadExperiments();
let activeView = "all";
let stagedImage = "";

function loadExperiments() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : sampleExperiments;
  } catch {
    return sampleExperiments;
  }
}

function saveExperiments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
  render();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function imageSource(experiment) {
  if (experiment.image) return experiment.image;
  if (experiment.localImage) return `../../data/${encodeURIComponent(experiment.localImage)}`;
  return "";
}

function render() {
  const query = elements.search.value.trim().toLowerCase();
  const filtered = experiments.filter((item) => {
    const haystack = [
      item.name, item.code, item.category, item.curriculum, item.description,
      ...(item.materials || []).map((material) => material.name)
    ].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!elements.field.value || item.category === elements.field.value)
      && (!elements.grade.value || item.grade === elements.grade.value)
      && (!elements.difficulty.value || item.difficulty === elements.difficulty.value)
      && (activeView === "all" || (activeView === "draft" ? item.status === "계획 중" : item.status === "완성"));
  });

  filtered.sort((a, b) => {
    if (elements.sort.value === "name") return a.name.localeCompare(b.name, "ko");
    if (elements.sort.value === "code") return a.code.localeCompare(b.code, "ko", { numeric: true });
    return b.updatedAt - a.updatedAt;
  });

  elements.grid.innerHTML = "";
  const template = $("#cardTemplate");
  filtered.forEach((experiment) => {
    const node = template.content.cloneNode(true);
    const imageBox = $(".card-image", node);
    const src = imageSource(experiment);
    if (src) {
      const image = new Image();
      image.alt = `${experiment.name} 실험지`;
      image.src = src;
      image.onerror = () => {
        imageBox.innerHTML = `<span class="image-code">${escapeHtml(experiment.code)}</span>`;
      };
      imageBox.append(image);
    } else {
      imageBox.innerHTML = `<span class="image-code">${escapeHtml(experiment.code)}</span>`;
    }
    $(".code", node).textContent = experiment.code;
    $(".state", node).textContent = experiment.status;
    $(".state", node).classList.toggle("complete", experiment.status === "완성");
    $("h3", node).textContent = experiment.name;
    $(".card-description", node).textContent = experiment.description || "실험 설명이 아직 없습니다.";
    $(".tag-line", node).innerHTML = [experiment.category, experiment.grade, experiment.difficulty]
      .map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    $(".curriculum", node).textContent = experiment.curriculum || "연계 교과 단원 미입력";
    $(".edit-action", node).addEventListener("click", () => openEditor(experiment));
    $(".duplicate-action", node).addEventListener("click", () => duplicateExperiment(experiment));
    elements.grid.append(node);
  });

  elements.empty.hidden = filtered.length > 0;
  elements.resultCount.textContent = filtered.length;
  updateCounts();
}

function updateCounts() {
  const draft = experiments.filter((item) => item.status === "계획 중").length;
  const complete = experiments.filter((item) => item.status === "완성").length;
  $("#allCount").textContent = experiments.length;
  $("#draftCount").textContent = draft;
  $("#completeCount").textContent = complete;
  $("#summaryTotal").textContent = experiments.length;
  $("#summaryDraft").textContent = draft;
  $("#summaryComplete").textContent = complete;
}

function nextCode(category) {
  const prefix = FIELD_CODES[category] || "EXP";
  const numbers = experiments
    .filter((item) => item.code?.startsWith(`${prefix}-`))
    .map((item) => Number(item.code.split("-")[1]))
    .filter(Number.isFinite);
  return `${prefix}-${String((Math.max(0, ...numbers) + 1)).padStart(3, "0")}`;
}

function clearForm() {
  elements.form.reset();
  $("#experimentId").value = "";
  elements.materials.innerHTML = "";
  stagedImage = "";
  updateImagePreview();
  addMaterialRow();
  $("#deleteButton").hidden = true;
}

function openEditor(experiment = null) {
  clearForm();
  if (experiment) {
    $("#editorEyebrow").textContent = "EDIT EXPERIMENT";
    $("#editorTitle").textContent = "실험 내용 수정";
    $("#deleteButton").hidden = false;
    $("#experimentId").value = experiment.id;
    $("#nameInput").value = experiment.name;
    $("#codeInput").value = experiment.code;
    $("#categoryInput").value = experiment.category;
    $("#gradeInput").value = experiment.grade;
    $("#difficultyInput").value = experiment.difficulty;
    $("#statusInput").value = experiment.status;
    $("#curriculumInput").value = experiment.curriculum || "";
    $("#descriptionInput").value = experiment.description || "";
    $("#localImageInput").value = experiment.localImage || "";
    $("#goalInput").value = experiment.goal || "";
    $("#safetyInput").value = experiment.safety || "";
    $("#procedureInput").value = experiment.procedure || "";
    $("#observationInput").value = experiment.observation || "";
    $("#questionInput").value = experiment.question || "";
    $("#teacherNoteInput").value = experiment.teacherNote || "";
    stagedImage = experiment.image || "";
    elements.materials.innerHTML = "";
    (experiment.materials?.length ? experiment.materials : [{}]).forEach(addMaterialRow);
    updateImagePreview();
  } else {
    $("#editorEyebrow").textContent = "NEW EXPERIMENT";
    $("#editorTitle").textContent = "새 실험 등록";
  }
  elements.dialog.showModal();
}

function duplicateExperiment(experiment) {
  const copy = structuredClone(experiment);
  copy.id = "";
  copy.code = "";
  copy.name = `${experiment.name} - 새 계획`;
  copy.status = "계획 중";
  copy.teacherNote = `원본 실험: ${experiment.code}\n${copy.teacherNote || ""}`.trim();
  openEditor(copy);
  $("#experimentId").value = "";
  $("#deleteButton").hidden = true;
  $("#editorEyebrow").textContent = "PLAN FROM EXISTING";
  $("#editorTitle").textContent = "기존 실험을 바탕으로 계획";
}

function addMaterialRow(material = {}) {
  const node = $("#materialTemplate").content.cloneNode(true);
  $(".material-name", node).value = material.name || "";
  $(".material-quantity", node).value = material.quantity || "";
  $(".material-link", node).value = material.link || "";
  $(".remove-line-button", node).addEventListener("click", (event) => {
    event.currentTarget.closest(".material-row").remove();
    if (!elements.materials.children.length) addMaterialRow();
  });
  elements.materials.append(node);
}

function updateImagePreview() {
  const localFile = $("#localImageInput").value.trim();
  const src = stagedImage || (localFile ? `../../data/${encodeURIComponent(localFile)}` : "");
  elements.imagePreview.innerHTML = "";
  if (!src) {
    elements.imagePreview.innerHTML = "<span>이미지 없음</span>";
    return;
  }
  const image = new Image();
  image.alt = "실험지 미리보기";
  image.src = src;
  image.onerror = () => {
    elements.imagePreview.innerHTML = "<span>이미지를 찾을 수 없습니다.</span>";
  };
  elements.imagePreview.append(image);
}

function collectMaterials() {
  return $$(".material-row", elements.materials).map((row) => ({
    name: $(".material-name", row).value.trim(),
    quantity: $(".material-quantity", row).value.trim(),
    link: $(".material-link", row).value.trim()
  })).filter((material) => material.name || material.quantity || material.link);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#experimentId").value;
  const existing = experiments.find((item) => item.id === id);
  const category = $("#categoryInput").value;
  const experiment = {
    id: id || crypto.randomUUID(),
    code: $("#codeInput").value.trim() || nextCode(category),
    name: $("#nameInput").value.trim(),
    category,
    grade: $("#gradeInput").value,
    difficulty: $("#difficultyInput").value,
    status: $("#statusInput").value,
    curriculum: $("#curriculumInput").value.trim(),
    description: $("#descriptionInput").value.trim(),
    materials: collectMaterials(),
    image: stagedImage,
    localImage: $("#localImageInput").value.trim(),
    goal: $("#goalInput").value.trim(),
    safety: $("#safetyInput").value.trim(),
    procedure: $("#procedureInput").value.trim(),
    observation: $("#observationInput").value.trim(),
    question: $("#questionInput").value.trim(),
    teacherNote: $("#teacherNoteInput").value.trim(),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  if (existing) experiments = experiments.map((item) => item.id === id ? experiment : item);
  else experiments.unshift(experiment);
  saveExperiments();
  elements.dialog.close();
});

$("#newButton").addEventListener("click", () => openEditor());
$("#addMaterialButton").addEventListener("click", () => addMaterialRow());
$("#closeButton").addEventListener("click", () => elements.dialog.close());
$("#cancelButton").addEventListener("click", () => elements.dialog.close());
$("#deleteButton").addEventListener("click", () => {
  const id = $("#experimentId").value;
  if (!id || !confirm("이 실험을 삭제할까요?")) return;
  experiments = experiments.filter((item) => item.id !== id);
  saveExperiments();
  elements.dialog.close();
});
$("#imageInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { stagedImage = reader.result; updateImagePreview(); };
  reader.readAsDataURL(file);
});
$("#removeImageButton").addEventListener("click", () => {
  stagedImage = "";
  $("#imageInput").value = "";
  $("#localImageInput").value = "";
  updateImagePreview();
});
$("#localImageInput").addEventListener("input", updateImagePreview);

["input", "change"].forEach((eventName) => {
  [elements.search, elements.field, elements.grade, elements.difficulty, elements.sort]
    .forEach((element) => element.addEventListener(eventName, render));
});

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeView = button.dataset.view;
    render();
  });
});

$("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(experiments, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `lab-note-experiments-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#importInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error();
    experiments = parsed;
    saveExperiments();
    alert("실험 데이터를 가져왔습니다.");
  } catch {
    alert("올바른 실험 JSON 파일이 아닙니다.");
  }
  event.target.value = "";
});

elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

render();
