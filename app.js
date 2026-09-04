/* ============================================================
   SILVAN.OS — persönliches Life-Dashboard
   Daten liegen lokal im Browser (localStorage), optional
   gespiegelt in eine private GitHub Gist (Cloud Sync).
   ============================================================ */

const STORAGE_KEY = "silvanos_data_v2";
const SYNC_TOKEN_KEY = "silvanos_sync_token";
const SYNC_GIST_KEY = "silvanos_sync_gistid";
const GIST_FILENAME = "silvanos-data.json";
const GIST_DESCRIPTION = "SILVAN.OS data (do not rename the file inside)";

/* fixed training order — always this order, 2x/week */
const EXERCISES = [
  { id: "chestpress", name: "Chestpress" },
  { id: "schraegbank", name: "Schrägbank drücken" },
  { id: "cable_h2l", name: "High to Low Cable Flys" },
  { id: "cable_l2h", name: "Low to High Cable Flys" },
  { id: "latzug", name: "Latzug" },
  { id: "rudern_eng", name: "Enges Rudern" },
  { id: "rudern_breit", name: "Breites Rudern hoch" },
  { id: "seitheben", name: "Seitheben an Maschine" },
  { id: "schulterpresse", name: "Schulterpresse" },
  { id: "bizeps", name: "Bizeps" },
  { id: "brachialis", name: "Brachialis" },
  { id: "trizeps", name: "Trizeps Presse" },
  { id: "bauch_gerade", name: "Gerade Bauchmuskelmaschine" },
  { id: "bauch_seitlich", name: "Seitliche Bauchmuskelmaschine" },
];

function mkSub(names) {
  return names.map((n, i) => ({ id: "s" + i + "_" + Math.random().toString(36).slice(2, 6), text: n, done: false }));
}
function mkTask(name, subtaskNames) {
  return {
    id: "t_" + Math.random().toString(36).slice(2, 9),
    name,
    done: false,
    expanded: false,
    subtasks: subtaskNames ? mkSub(subtaskNames) : [],
  };
}

function defaultProjects() {
  return [
    {
      id: "p_lehre",
      title: "LEHRE",
      goal: null,
      tasks: [
        mkTask("M106 · SQL/Datenbanken", ["MySQL Grundlagen", "Normalisierung", "DML/DDL/DCL", "Prüfung"]),
        mkTask("M129 · Netzwerk", ["OSI-Modell", "TCP/IP", "Protokolltabellen", "Prüfung"]),
        mkTask("M169 · Docker/Monitoring", ["Docker Compose Stack", "Prometheus/Grafana", "Security Bands H/I", "Prüfung"]),
        mkTask("M188", ["Theorie", "Praxis", "Dokumentation", "Prüfung"]),
        mkTask("M231 · Datenschutz", ["Cookies-Aufgabe", "Grundlagen Datenschutz", "Dokumentation", "Prüfung"]),
        mkTask("M346 · IaC (Terraform/Ansible)", ["Terraform Setup", "Ansible Roles", "Multi-VM Deployment", "Prüfung"]),
      ],
    },
    {
      id: "p_moto",
      title: "MOTO-FONDS",
      goal: { target: 3000, current: 0, unit: "CHF" },
      tasks: [
        mkTask("Brixton BX 125 / Crossfire", []),
        mkTask("CFMoto 125/300", []),
      ],
    },
    {
      id: "p_roblox",
      title: "STEAL & ESCAPE",
      goal: null,
      tasks: [
        { ...mkTask("M1 · PlayerDataService", []), done: true },
        { ...mkTask("M2 · LootService & InventoryService", []), done: true },
        { ...mkTask("M3 · EconomyService", []), done: true },
        { ...mkTask("M4 · ExtractionService & CombatService", []), done: true },
        mkTask("M5 · Minimal HUD mit echten Server-Daten", []),
      ],
    },
  ];
}

function defaultData() {
  return {
    xp: 0,
    lastWeightLogDate: null,
    weightLog: [],
    workoutLog: [], // [{date, exercises: {exId: {done, weight, reps}}}]
    programStart: null,
    projects: defaultProjects(),
    calendar: {}, // { "YYYY-MM-DD": [{id, text, done}] }
  };
}

let data = loadData();
let selectedExerciseId = EXERCISES[0].id;
let weekOffset = 0;
let selectedDate = todayStr();
let weightChart, exWeightChart, exRepsChart;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch (e) {
    console.error("Load error", e);
    return defaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Save error", e);
  }
  scheduleSync();
}

/* ---------------- XP SYSTEM ---------------- */
function addXP(amount) {
  const prevLevel = levelForXP(data.xp);
  data.xp = Math.max(0, data.xp + amount);
  const newLevel = levelForXP(data.xp);
  saveData();
  renderXP();
  if (newLevel > prevLevel) showLevelUp(newLevel);
}
function levelForXP(xp) { return Math.floor(xp / 100) + 1; }
function renderXP() {
  const level = levelForXP(data.xp);
  const xpIntoLevel = data.xp % 100;
  document.getElementById("level").textContent = level;
  document.getElementById("xpCurrent").textContent = xpIntoLevel;
  document.getElementById("xpNext").textContent = 100;
  document.getElementById("xpBarFill").style.width = xpIntoLevel + "%";
}
function showLevelUp(level) {
  const toast = document.getElementById("levelUpToast");
  document.getElementById("levelUpNum").textContent = level;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2400);
}

/* ---------------- HELPERS ---------------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthsSince(dateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr);
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

/* ---------------- FITNESS: weight + phase ---------------- */
function currentPhase() {
  const m = monthsSince(data.programStart);
  if (m === null) return null;
  if (m <= 7) return { phase: "BULK", month: m, of: 7 };
  if (m <= 10) return { phase: "CUT", month: m - 7, of: 3 };
  return { phase: "FERTIG", month: null };
}

function renderFitness() {
  const phaseInfo = currentPhase();
  const phaseLabel = document.getElementById("phaseLabel");
  const macroReadout = document.getElementById("macroReadout");
  const targetWeightEl = document.getElementById("targetWeight");

  if (!phaseInfo) {
    phaseLabel.textContent = "Kein Startdatum gesetzt";
    macroReadout.innerHTML = "Setze dein Programmstart-Datum, um Phase &amp; Makros zu sehen.";
    targetWeightEl.textContent = "--.- kg";
  } else if (phaseInfo.phase === "BULK") {
    phaseLabel.textContent = `BULK — Monat ${phaseInfo.month}/${phaseInfo.of}`;
    macroReadout.innerHTML = `<b>3450–3500</b> kcal/Tag · <b>175–190g</b> Protein<br>Ziel: ~85kg @ 15–16% KFA (+0.9kg/Monat)`;
    targetWeightEl.textContent = "85.0 kg";
  } else if (phaseInfo.phase === "CUT") {
    phaseLabel.textContent = `CUT — Monat ${phaseInfo.month}/${phaseInfo.of}`;
    macroReadout.innerHTML = `<b>2350–2450</b> kcal/Tag · <b>200–210g</b> Protein<br>Ziel: 82–83kg @ 10–11% KFA`;
    targetWeightEl.textContent = "82–83 kg";
  } else {
    phaseLabel.textContent = "Programm abgeschlossen 🎉";
    macroReadout.innerHTML = "10-Monats-Plan durchlaufen. Zeit für ein neues Ziel.";
    targetWeightEl.textContent = "--.- kg";
  }

  const sorted = [...data.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const avg = last7.length ? (last7.reduce((s, e) => s + e.weight, 0) / last7.length) : null;
  document.getElementById("avgWeight").textContent = avg ? avg.toFixed(1) + " kg" : "--.- kg";
  document.getElementById("programStart").value = data.programStart || "";

  renderWeightChart(sorted);
  renderExerciseList();
  renderExerciseHistory();
}

function renderWeightChart(sorted) {
  const ctx = document.getElementById("weightChart");
  const labels = sorted.map(e => e.date.slice(5));
  const values = sorted.map(e => e.weight);
  if (weightChart) weightChart.destroy();
  weightChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{
      label: "Gewicht (kg)", data: values,
      borderColor: "#4CE0B3", backgroundColor: "rgba(76,224,179,0.08)",
      tension: 0.3, fill: true, pointRadius: 2, pointBackgroundColor: "#4CE0B3",
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "#1A222C" } },
        y: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "#1A222C" } },
      }
    }
  });
}

/* ---------------- FITNESS: exercises (weight + reps tracking) ---------------- */
function getTodayWorkoutEntry(create) {
  const today = todayStr();
  let entry = data.workoutLog.find(w => w.date === today);
  if (!entry && create) {
    entry = { date: today, exercises: {} };
    data.workoutLog.push(entry);
  }
  return entry;
}

function renderExerciseList() {
  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
  const today = todayStr();
  const entry = data.workoutLog.find(w => w.date === today);

  EXERCISES.forEach(ex => {
    const rec = entry && entry.exercises[ex.id] ? entry.exercises[ex.id] : { done: false, weight: "", reps: "" };
    const row = document.createElement("div");
    row.className = "exercise-item" + (rec.done ? " done" : "");
    row.innerHTML = `
      <input type="checkbox" data-exid="${ex.id}" data-field="done" ${rec.done ? "checked" : ""}>
      <span class="ex-name">${ex.name}</span>
      <input type="number" step="0.5" placeholder="kg" data-exid="${ex.id}" data-field="weight" value="${rec.weight ?? ""}">
      <input type="number" step="1" placeholder="#" data-exid="${ex.id}" data-field="reps" value="${rec.reps ?? ""}">
    `;
    list.appendChild(row);
  });

  const now = new Date();
  const mondayStr = isoDate(mondayOf(now));
  const trainedDates = new Set(
    data.workoutLog.filter(w => w.date >= mondayStr && Object.values(w.exercises).some(e => e.done)).map(w => w.date)
  );
  document.getElementById("workoutStreak").textContent = trainedDates.size;
}

function updateExerciseField(exId, field, rawValue) {
  const entry = getTodayWorkoutEntry(true);
  if (!entry.exercises[exId]) entry.exercises[exId] = { done: false, weight: null, reps: null };
  const rec = entry.exercises[exId];
  const wasDone = rec.done;

  if (field === "done") {
    rec.done = rawValue;
  } else if (field === "weight") {
    rec.weight = rawValue === "" ? null : parseFloat(rawValue);
    if (rec.weight !== null) rec.done = true;
  } else if (field === "reps") {
    rec.reps = rawValue === "" ? null : parseInt(rawValue, 10);
    if (rec.reps !== null) rec.done = true;
  }

  saveData();
  if (rec.done && !wasDone) addXP(5);
  if (!rec.done && wasDone) addXP(-5);
  renderExerciseList();
  renderExerciseHistory();
}

function renderExerciseHistory() {
  const select = document.getElementById("exerciseSelect");
  if (select.options.length === 0) {
    EXERCISES.forEach(ex => {
      const opt = document.createElement("option");
      opt.value = ex.id;
      opt.textContent = ex.name;
      select.appendChild(opt);
    });
    select.value = selectedExerciseId;
  }

  const points = data.workoutLog
    .filter(w => w.exercises[selectedExerciseId] && (w.exercises[selectedExerciseId].weight != null || w.exercises[selectedExerciseId].reps != null))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => ({ date: w.date, weight: w.exercises[selectedExerciseId].weight, reps: w.exercises[selectedExerciseId].reps }));

  const labels = points.map(p => p.date.slice(5));

  if (exWeightChart) exWeightChart.destroy();
  exWeightChart = new Chart(document.getElementById("exWeightChart"), {
    type: "line",
    data: { labels, datasets: [{
      label: "Gewicht (kg)", data: points.map(p => p.weight),
      borderColor: "#4CE0B3", backgroundColor: "rgba(76,224,179,0.08)",
      tension: 0.3, fill: true, pointRadius: 2, spanGaps: true,
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: true, labels: { color: "#6B7785", font: { family: "JetBrains Mono", size: 10 } } } },
      scales: {
        x: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 9 } }, grid: { color: "#1A222C" } },
        y: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 9 } }, grid: { color: "#1A222C" } },
      }
    }
  });

  if (exRepsChart) exRepsChart.destroy();
  exRepsChart = new Chart(document.getElementById("exRepsChart"), {
    type: "line",
    data: { labels, datasets: [{
      label: "Wiederholungen", data: points.map(p => p.reps),
      borderColor: "#E0A64C", backgroundColor: "rgba(224,166,76,0.08)",
      tension: 0.3, fill: true, pointRadius: 2, spanGaps: true,
    }] },
    options: {
      responsive: true,
      plugins: { legend: { display: true, labels: { color: "#6B7785", font: { family: "JetBrains Mono", size: 10 } } } },
      scales: {
        x: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 9 } }, grid: { color: "#1A222C" } },
        y: { ticks: { color: "#6B7785", font: { family: "JetBrains Mono", size: 9 } }, grid: { color: "#1A222C" } },
      }
    }
  });
}

/* ================= GENERIC PROJECTS (editable holders) ================= */
function renderProjects() {
  const container = document.getElementById("projectsContainer");
  container.innerHTML = "";

  data.projects.forEach((project, idx) => {
    const num = String(idx + 2).padStart(2, "0");
    const totalTasks = project.tasks.length;
    const doneTasks = project.tasks.filter(t => t.done).length;
    const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const panel = document.createElement("section");
    panel.className = "panel project-panel";
    panel.dataset.projectId = project.id;

    panel.innerHTML = `
      <div class="project-title-row">
        <span class="panel-sub" style="flex-shrink:0;">${num} ·</span>
        <input class="project-title" data-projid="${project.id}" value="${escapeAttr(project.title)}">
        <button class="project-del" data-projid="${project.id}" title="Projekt löschen">✕</button>
      </div>
      <span class="project-pct">${pct}% abgeschlossen</span>

      ${project.goal ? goalBlockHTML(project) : `<button class="add-goal-btn" data-projid="${project.id}">+ Sparziel/Zahlenziel hinzufügen</button>`}

      <div class="task-list" data-projid="${project.id}">
        ${project.tasks.map(t => taskHTML(project.id, t)).join("")}
      </div>

      <form class="add-task-form" data-projid="${project.id}">
        <input type="text" placeholder="Neue Aufgabe..." data-projid="${project.id}">
        <button type="submit">+</button>
      </form>
    `;
    container.appendChild(panel);
  });

  // renumber the calendar panel to continue after projects
  const calNum = String(data.projects.length + 2).padStart(2, "0");
  document.getElementById("calendarNumber").textContent = calNum + " · TAGESPLANER";
}

function goalBlockHTML(project) {
  const pct = project.goal.target ? Math.min(100, Math.round((project.goal.current / project.goal.target) * 100)) : 0;
  return `
    <div class="goal-block" data-projid="${project.id}">
      <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
      <div class="goal-numbers">
        <span>
          <input type="number" class="goal-current" data-projid="${project.id}" value="${project.goal.current}">
          / <input type="number" class="goal-target" data-projid="${project.id}" value="${project.goal.target}">
          <input type="text" class="goal-unit" data-projid="${project.id}" value="${escapeAttr(project.goal.unit)}" style="width:40px;">
        </span>
        <span>${pct}%</span>
      </div>
      <button class="goal-remove" data-projid="${project.id}">Ziel entfernen</button>
    </div>
  `;
}

function taskHTML(projId, task) {
  return `
    <div class="task ${task.done ? "done" : ""}" data-taskid="${task.id}">
      <div class="task-row">
        <input type="checkbox" data-projid="${projId}" data-taskid="${task.id}" data-action="toggle-task" ${task.done ? "checked" : ""}>
        <input class="task-name" data-projid="${projId}" data-taskid="${task.id}" data-action="rename-task" value="${escapeAttr(task.name)}">
        <button class="task-expand" data-projid="${projId}" data-taskid="${task.id}" data-action="expand-task">${task.expanded ? "▾" : "▸"} ${task.subtasks.length}</button>
        <button class="task-del" data-projid="${projId}" data-taskid="${task.id}" data-action="del-task">✕</button>
      </div>
      <div class="subtasks ${task.expanded ? "" : "hidden"}">
        ${task.subtasks.map(s => `
          <div class="subtask-row ${s.done ? "done" : ""}">
            <input type="checkbox" data-projid="${projId}" data-taskid="${task.id}" data-subid="${s.id}" data-action="toggle-subtask" ${s.done ? "checked" : ""}>
            <input class="subtask-name" data-projid="${projId}" data-taskid="${task.id}" data-subid="${s.id}" data-action="rename-subtask" value="${escapeAttr(s.text)}">
            <button class="subtask-del" data-projid="${projId}" data-taskid="${task.id}" data-subid="${s.id}" data-action="del-subtask">✕</button>
          </div>
        `).join("")}
        <form class="add-subtask-form" data-projid="${projId}" data-taskid="${task.id}">
          <input type="text" placeholder="Teilschritt...">
          <button type="submit">+</button>
        </form>
      </div>
    </div>
  `;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function findProject(id) { return data.projects.find(p => p.id === id); }
function findTask(proj, taskId) { return proj.tasks.find(t => t.id === taskId); }

/* delegated events for the whole dynamic project area */
document.getElementById("projectsContainer").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const projId = btn.dataset.projid;
  const proj = findProject(projId);

  if (btn.classList.contains("project-del")) {
    if (confirm(`Projekt "${proj.title}" wirklich löschen?`)) {
      data.projects = data.projects.filter(p => p.id !== projId);
      saveData(); renderProjects();
    }
    return;
  }
  if (btn.classList.contains("add-goal-btn")) {
    proj.goal = { target: 100, current: 0, unit: "CHF" };
    saveData(); renderProjects();
    return;
  }
  if (btn.classList.contains("goal-remove")) {
    proj.goal = null;
    saveData(); renderProjects();
    return;
  }
  if (btn.dataset.action === "expand-task") {
    const task = findTask(proj, btn.dataset.taskid);
    task.expanded = !task.expanded;
    saveData(); renderProjects();
    return;
  }
  if (btn.dataset.action === "del-task") {
    proj.tasks = proj.tasks.filter(t => t.id !== btn.dataset.taskid);
    saveData(); renderProjects();
    return;
  }
  if (btn.dataset.action === "del-subtask") {
    const task = findTask(proj, btn.dataset.taskid);
    task.subtasks = task.subtasks.filter(s => s.id !== btn.dataset.subid);
    saveData(); renderProjects();
    return;
  }
});

document.getElementById("projectsContainer").addEventListener("change", e => {
  const el = e.target;
  const projId = el.dataset.projid;
  if (!projId) return;
  const proj = findProject(projId);

  if (el.dataset.action === "toggle-task") {
    const task = findTask(proj, el.dataset.taskid);
    const changed = task.done !== el.checked;
    task.done = el.checked;
    saveData();
    if (changed) addXP(el.checked ? 10 : -10);
    renderProjects();
    return;
  }
  if (el.dataset.action === "toggle-subtask") {
    const task = findTask(proj, el.dataset.taskid);
    const sub = task.subtasks.find(s => s.id === el.dataset.subid);
    const changed = sub.done !== el.checked;
    sub.done = el.checked;
    saveData();
    if (changed) addXP(el.checked ? 5 : -5);
    renderProjects();
    return;
  }
  if (el.classList.contains("goal-current") || el.classList.contains("goal-target")) {
    const wasReached = proj.goal.current >= proj.goal.target;
    proj.goal.current = parseFloat(document.querySelector(`.goal-current[data-projid="${projId}"]`).value) || 0;
    proj.goal.target = parseFloat(document.querySelector(`.goal-target[data-projid="${projId}"]`).value) || 0;
    const nowReached = proj.goal.current >= proj.goal.target && proj.goal.target > 0;
    saveData();
    if (nowReached && !wasReached) addXP(50);
    renderProjects();
    return;
  }
  if (el.classList.contains("goal-unit")) {
    proj.goal.unit = el.value;
    saveData();
    return;
  }
});

/* commit text edits (title / task name / subtask name) on blur, not on every keystroke */
document.getElementById("projectsContainer").addEventListener("focusout", e => {
  const el = e.target;
  const projId = el.dataset.projid;
  if (!projId) return;
  const proj = findProject(projId);

  if (el.classList.contains("project-title")) {
    proj.title = el.value.trim() || proj.title;
    saveData(); renderProjects();
  } else if (el.dataset.action === "rename-task") {
    const task = findTask(proj, el.dataset.taskid);
    task.name = el.value.trim() || task.name;
    saveData();
  } else if (el.dataset.action === "rename-subtask") {
    const task = findTask(proj, el.dataset.taskid);
    const sub = task.subtasks.find(s => s.id === el.dataset.subid);
    sub.text = el.value.trim() || sub.text;
    saveData();
  }
});

document.getElementById("projectsContainer").addEventListener("submit", e => {
  e.preventDefault();
  const form = e.target;
  const projId = form.dataset.projid;
  const proj = findProject(projId);

  if (form.classList.contains("add-task-form")) {
    const input = form.querySelector("input");
    const name = input.value.trim();
    if (!name) return;
    proj.tasks.push(mkTask(name, []));
    saveData(); renderProjects();
  } else if (form.classList.contains("add-subtask-form")) {
    const taskId = form.dataset.taskid;
    const task = findTask(proj, taskId);
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    task.subtasks.push({ id: "s_" + Math.random().toString(36).slice(2, 8), text, done: false });
    task.expanded = true;
    saveData(); renderProjects();
  }
});

document.getElementById("addProjectBtn").addEventListener("click", () => {
  const title = prompt("Name des neuen Projekts/Tabs:", "Neues Projekt");
  if (!title) return;
  data.projects.push({
    id: "p_" + Math.random().toString(36).slice(2, 9),
    title: title.toUpperCase(),
    goal: null,
    tasks: [],
  });
  saveData();
  renderProjects();
});

/* ================= DAILY CALENDAR ================= */
const DOW_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DOW_FULL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function renderCalendar() {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);

  const weekDaysEl = document.getElementById("weekDays");
  weekDaysEl.innerHTML = "";
  const today = todayStr();

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const first = days[0], last = days[6];
  document.getElementById("calendarWeekLabel").textContent =
    `${first.getDate()}. ${MONTH_NAMES[first.getMonth()].slice(0,3)} – ${last.getDate()}. ${MONTH_NAMES[last.getMonth()].slice(0,3)}`;

  days.forEach((d, i) => {
    const iso = isoDate(d);
    const hasTasks = (data.calendar[iso] || []).length > 0;
    const chip = document.createElement("div");
    chip.className = "day-chip" + (iso === today ? " today" : "") + (iso === selectedDate ? " selected" : "");
    chip.dataset.date = iso;
    chip.innerHTML = `
      <span class="dow">${DOW_LABELS[i]}</span>
      <span class="dom">${d.getDate()}</span>
      <span class="dot ${hasTasks ? "" : "hidden"}"></span>
    `;
    weekDaysEl.appendChild(chip);
  });

  renderDayTasks();
}

function renderDayTasks() {
  const d = new Date(selectedDate);
  const dow = (d.getDay() + 6) % 7;
  document.getElementById("calendarDayLabel").textContent =
    `${DOW_FULL[dow]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}${selectedDate === todayStr() ? " · heute" : ""}`;

  const list = document.getElementById("dayTaskList");
  list.innerHTML = "";
  const tasks = data.calendar[selectedDate] || [];

  if (!tasks.length) {
    list.innerHTML = `<div class="day-task-empty">Keine Aufgaben für diesen Tag.</div>`;
    return;
  }

  tasks.forEach(t => {
    const row = document.createElement("div");
    row.className = "day-task" + (t.done ? " done" : "");
    row.innerHTML = `
      <input type="checkbox" data-taskid="${t.id}" ${t.done ? "checked" : ""}>
      <span>${escapeAttr(t.text)}</span>
      <button data-del="${t.id}">✕</button>
    `;
    list.appendChild(row);
  });
}

document.getElementById("weekPrevBtn").addEventListener("click", () => { weekOffset--; renderCalendar(); });
document.getElementById("weekNextBtn").addEventListener("click", () => { weekOffset++; renderCalendar(); });

document.getElementById("weekDays").addEventListener("click", e => {
  const chip = e.target.closest(".day-chip");
  if (!chip) return;
  selectedDate = chip.dataset.date;
  renderCalendar();
});

document.getElementById("dayTaskForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("dayTaskInput");
  const text = input.value.trim();
  if (!text) return;
  if (!data.calendar[selectedDate]) data.calendar[selectedDate] = [];
  data.calendar[selectedDate].push({ id: "d_" + Math.random().toString(36).slice(2, 8), text, done: false });
  saveData();
  input.value = "";
  renderCalendar();
});

document.getElementById("dayTaskList").addEventListener("change", e => {
  if (e.target.matches("input[type=checkbox]")) {
    const id = e.target.dataset.taskid;
    const task = (data.calendar[selectedDate] || []).find(t => t.id === id);
    if (!task) return;
    const changed = task.done !== e.target.checked;
    task.done = e.target.checked;
    saveData();
    if (changed) addXP(task.done ? 10 : -10);
    renderCalendar();
  }
});

document.getElementById("dayTaskList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-del]");
  if (!btn) return;
  const id = btn.dataset.del;
  data.calendar[selectedDate] = (data.calendar[selectedDate] || []).filter(t => t.id !== id);
  saveData();
  renderCalendar();
});

/* ---------------- RENDER ALL ---------------- */
function renderAll() {
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
  renderXP();
  renderFitness();
  renderProjects();
  renderCalendar();
}

/* ---------------- FITNESS EVENT LISTENERS ---------------- */
document.getElementById("weightForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("weightInput");
  const val = parseFloat(input.value);
  if (isNaN(val)) return;
  const today = todayStr();
  const existing = data.weightLog.find(w => w.date === today);
  if (existing) existing.weight = val;
  else data.weightLog.push({ date: today, weight: val });
  const isNewDay = data.lastWeightLogDate !== today;
  data.lastWeightLogDate = today;
  saveData();
  if (isNewDay) addXP(5);
  input.value = "";
  renderFitness();
});

document.getElementById("programStart").addEventListener("change", e => {
  data.programStart = e.target.value || null;
  saveData();
  renderFitness();
});

document.getElementById("exerciseList").addEventListener("change", e => {
  const el = e.target;
  if (!el.matches("input")) return;
  const value = el.type === "checkbox" ? el.checked : el.value;
  updateExerciseField(el.dataset.exid, el.dataset.field, value);
});

document.getElementById("exerciseSelect").addEventListener("change", e => {
  selectedExerciseId = e.target.value;
  renderExerciseHistory();
});

/* ---------------- EXPORT / IMPORT ---------------- */
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `silvanos-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      data = { ...defaultData(), ...parsed };
      saveData();
      renderAll();
    } catch (err) {
      alert("Import fehlgeschlagen: ungültige Datei.");
    }
  };
  reader.readAsText(file);
});

/* ================= CLOUD SYNC (private GitHub Gist) ================= */
let syncTimer = null;
let syncInFlight = false;

function getSyncToken() { return localStorage.getItem(SYNC_TOKEN_KEY); }
function getGistId() { return localStorage.getItem(SYNC_GIST_KEY); }

function scheduleSync() {
  if (!getSyncToken()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushToGist(), 1500);
}

function setSyncStatus(text, mode) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("connected", "error");
  if (mode) el.classList.add(mode);
}

async function githubRequest(url, options = {}) {
  const token = getSyncToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function findExistingGist() {
  let page = 1;
  while (page <= 5) {
    const gists = await githubRequest(`https://api.github.com/gists?per_page=100&page=${page}`);
    if (!gists.length) break;
    const match = gists.find(g => g.files && g.files[GIST_FILENAME]);
    if (match) return match.id;
    if (gists.length < 100) break;
    page++;
  }
  return null;
}

async function createGist() {
  const gist = await githubRequest("https://api.github.com/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } },
    }),
  });
  return gist.id;
}

async function pullFromGist(gistId) {
  const gist = await githubRequest(`https://api.github.com/gists/${gistId}`);
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file || !file.content) return null;
  return JSON.parse(file.content);
}

async function pushToGist() {
  const token = getSyncToken();
  if (!token || syncInFlight) return;
  syncInFlight = true;
  setSyncStatus("synce...", null);
  try {
    let gistId = getGistId();
    if (!gistId) {
      gistId = await findExistingGist();
      if (!gistId) gistId = await createGist();
      localStorage.setItem(SYNC_GIST_KEY, gistId);
    }
    await githubRequest(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } }),
    });
    setSyncStatus("verbunden · zuletzt " + new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }), "connected");
  } catch (e) {
    console.error("Sync push error", e);
    setSyncStatus("Fehler beim Sync — Token prüfen", "error");
  } finally {
    syncInFlight = false;
  }
}

async function initialSyncPull() {
  const token = getSyncToken();
  if (!token) { setSyncStatus("nicht verbunden", null); return; }
  setSyncStatus("verbinde...", null);
  try {
    let gistId = getGistId();
    if (!gistId) {
      gistId = await findExistingGist();
      if (gistId) localStorage.setItem(SYNC_GIST_KEY, gistId);
    }
    if (gistId) {
      const remote = await pullFromGist(gistId);
      if (remote) data = { ...defaultData(), ...remote };
    } else {
      const newId = await createGist();
      localStorage.setItem(SYNC_GIST_KEY, newId);
    }
    setSyncStatus("verbunden · zuletzt " + new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }), "connected");
  } catch (e) {
    console.error("Sync pull error", e);
    setSyncStatus("Fehler beim Verbinden — Token prüfen", "error");
  }
}

function connectSync(token) {
  localStorage.setItem(SYNC_TOKEN_KEY, token.trim());
  localStorage.removeItem(SYNC_GIST_KEY);
  return initialSyncPull().then(renderAll);
}

function disconnectSync() {
  localStorage.removeItem(SYNC_TOKEN_KEY);
  localStorage.removeItem(SYNC_GIST_KEY);
  setSyncStatus("nicht verbunden", null);
  document.getElementById("syncSetup").classList.add("hidden");
  document.getElementById("syncDisconnectBtn").classList.add("hidden");
}

document.getElementById("syncToggleBtn").addEventListener("click", () => {
  document.getElementById("syncSetup").classList.toggle("hidden");
});
document.getElementById("syncForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("syncTokenInput");
  const token = input.value.trim();
  if (!token) return;
  await connectSync(token);
  input.value = "";
  document.getElementById("syncSetup").classList.add("hidden");
  document.getElementById("syncDisconnectBtn").classList.remove("hidden");
});
document.getElementById("syncDisconnectBtn").addEventListener("click", () => disconnectSync());

/* ---------------- SCANLINE BACKGROUND ---------------- */
function initScanlines() {
  const canvas = document.getElementById("scanlines");
  const ctx = canvas.getContext("2d");
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(76,224,179,0.025)";
    ctx.lineWidth = 1;
    for (let y = 0; y < canvas.height; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(76,224,179,0.015)";
    for (let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  }
  window.addEventListener("resize", resize);
  resize();
}

/* ---------------- PWA: service worker registration ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(err => console.error("SW registration failed", err));
  });
}

/* ---------------- BOOT ---------------- */
async function boot() {
  initScanlines();
  if (getSyncToken()) {
    document.getElementById("syncDisconnectBtn").classList.remove("hidden");
    await initialSyncPull();
  }
  renderAll();
  setTimeout(() => {
    document.getElementById("boot").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }, 600);
}

boot();
