/* ============================================================
   SILVAN.OS — persönliches Life-Dashboard
   Daten liegen lokal im Browser (localStorage), optional
   gespiegelt in eine private GitHub Gist (Cloud Sync).
   ============================================================ */

const GIST_FILENAME = "silvanos-data.json";
const GIST_DESCRIPTION = "SILVAN.OS data (do not rename the file inside)";

/* multi-account: each account's data/token/gist live under its own key,
   so several people can share one browser (or the same account can be
   connected on several devices via its own GitHub token). */
const ACCOUNTS_KEY = "silvanos_accounts_v1";
const CURRENT_ACCOUNT_KEY = "silvanos_current_account";
const LEGACY_STORAGE_KEY = "silvanos_data_v2";
const LEGACY_SYNC_TOKEN_KEY = "silvanos_sync_token";
const LEGACY_SYNC_GIST_KEY = "silvanos_sync_gistid";

function accountDataKey(id) { return `silvanos_data_v2::${id}`; }
function accountTokenKey(id) { return `silvanos_sync_token::${id}`; }
function accountGistKey(id) { return `silvanos_sync_gistid::${id}`; }

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

function defaultFitnessProfile() {
  return {
    sex: "m",              // "m" | "w" — used for the BMR formula
    age: null,
    heightCm: null,
    activityLevel: "moderate", // sedentary | light | moderate | active | very_active
    goalType: "maintain",  // lose | gain | recomp | maintain
    targetWeight: null,
    targetDate: null,      // ISO date — deadline used to derive the required rate
    proteinPerKg: null,    // optional manual override, else derived from goalType
  };
}

function defaultData() {
  return {
    xp: 0,
    lastWeightLogDate: null,
    weightLog: [],
    workoutLog: [], // [{date, session: 1|2, exercises: {exId: {done, weight, reps}}}]
    fitnessProfile: defaultFitnessProfile(),
    projects: defaultProjects(),
    calendar: {}, // { "YYYY-MM-DD": [{id, text, done}] }
  };
}

let currentAccountId = null;
let data = defaultData();
let selectedExerciseId = EXERCISES[0].id;
let weekOffset = 0;
let selectedDate = todayStr();
let weightChart, exWeightChart, exRepsChart;

function loadData() {
  if (!currentAccountId) return defaultData();
  try {
    const raw = localStorage.getItem(accountDataKey(currentAccountId));
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch (e) {
    console.error("Load error", e);
    return defaultData();
  }
}

function saveData() {
  if (!currentAccountId) return;
  try {
    localStorage.setItem(accountDataKey(currentAccountId), JSON.stringify(data));
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
// Local calendar date as YYYY-MM-DD. toISOString() converts to UTC first,
// which silently rolls the date back (e.g. shortly after local midnight in
// any UTC+ timezone) — always format from local getFullYear/Month/Date.
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return isoDate(new Date()); }
// Parse a stored "YYYY-MM-DD" as a local calendar date, not UTC midnight —
// bare ISO date strings parse as UTC per spec, which can land on the wrong
// side of midnight once converted to local time (e.g. UTC- timezones).
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d;
}

/* time range shared by the weight chart and the exercise history charts */
let chartRange = "month"; // "week" | "month" | "all"
function filterByRange(sortedByDate, range) {
  if (range === "all") return sortedByDate;
  const cutoff = new Date();
  if (range === "week") cutoff.setDate(cutoff.getDate() - 7);
  else cutoff.setMonth(cutoff.getMonth() - 1);
  const cutoffStr = isoDate(cutoff);
  return sortedByDate.filter(e => e.date >= cutoffStr);
}
function renderRangeToggle() {
  document.querySelectorAll("#chartRangeToggle button").forEach(b => {
    b.classList.toggle("active", b.dataset.range === chartRange);
  });
}

/* ---------------- FITNESS: nutrition plan (BMR/TDEE-based, editable profile) ---------------- */
const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const GOAL_LABELS = { lose: "Abnehmen", gain: "Zunehmen", recomp: "Muskelaufbau", maintain: "Halten" };
const GOAL_DEFAULT_PROTEIN_PER_KG = { lose: 2.2, gain: 1.8, recomp: 2.0, maintain: 1.7 };
const GOAL_DEFAULT_DAILY_DELTA = { lose: -500, gain: 300, recomp: 150, maintain: 0 };
const KCAL_PER_KG_BODY_MASS = 7700; // rough energy density of a kg of body-mass change
const MAX_SAFE_WEEKLY_CHANGE_KG = 1.0; // clamp aggressive targets to a sustainable rate

function latestWeight() {
  const sorted = [...data.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.length ? sorted[sorted.length - 1].weight : null;
}

function computeNutritionPlan() {
  const p = data.fitnessProfile;
  const weight = latestWeight();
  if (!weight || !p.age || !p.heightCm) return null;

  const bmr = p.sex === "w"
    ? 10 * weight + 6.25 * p.heightCm - 5 * p.age - 161
    : 10 * weight + 6.25 * p.heightCm - 5 * p.age + 5;
  const tdee = bmr * (ACTIVITY_MULTIPLIERS[p.activityLevel] || ACTIVITY_MULTIPLIERS.moderate);

  let dailyDelta;
  let rateInfo = null;
  if (p.targetWeight && p.targetDate) {
    const daysLeft = Math.max(1, Math.round((parseLocalDate(p.targetDate) - new Date()) / 86400000));
    const weeksLeft = Math.max(1, daysLeft / 7);
    const rawWeeklyChangeKg = (p.targetWeight - weight) / weeksLeft;
    const weeklyChangeKg = Math.max(-MAX_SAFE_WEEKLY_CHANGE_KG, Math.min(MAX_SAFE_WEEKLY_CHANGE_KG, rawWeeklyChangeKg));
    dailyDelta = (weeklyChangeKg * KCAL_PER_KG_BODY_MASS) / 7;
    rateInfo = { weeksLeft, weeklyChangeKg, clamped: weeklyChangeKg !== rawWeeklyChangeKg };
  } else {
    dailyDelta = GOAL_DEFAULT_DAILY_DELTA[p.goalType] ?? 0;
  }

  const kcalFloor = p.sex === "w" ? 1200 : 1500;
  const targetKcal = Math.max(kcalFloor, Math.round(tdee + dailyDelta));

  const proteinPerKg = p.proteinPerKg || GOAL_DEFAULT_PROTEIN_PER_KG[p.goalType] || 1.8;
  const proteinG = Math.round(proteinPerKg * weight);
  const proteinKcal = proteinG * 4;
  const fatG = Math.round((targetKcal * 0.25) / 9);
  const fatKcal = fatG * 9;
  const carbsG = Math.max(0, Math.round((targetKcal - proteinKcal - fatKcal) / 4));

  return {
    weight, bmr: Math.round(bmr), tdee: Math.round(tdee), dailyDelta: Math.round(dailyDelta),
    targetKcal, proteinG, fatG, carbsG, rateInfo,
  };
}

function populateGoalForm() {
  const p = data.fitnessProfile;
  document.getElementById("goalSex").value = p.sex;
  document.getElementById("goalAge").value = p.age ?? "";
  document.getElementById("goalHeight").value = p.heightCm ?? "";
  document.getElementById("goalActivity").value = p.activityLevel;
  document.getElementById("goalType").value = p.goalType;
  document.getElementById("goalTargetWeight").value = p.targetWeight ?? "";
  document.getElementById("goalTargetDate").value = p.targetDate ?? "";
  document.getElementById("goalProteinOverride").value = p.proteinPerKg ?? "";
}

/* ---------------- FITNESS: weight + nutrition rendering ---------------- */
function renderFitness() {
  const plan = computeNutritionPlan();
  const p = data.fitnessProfile;
  const phaseLabel = document.getElementById("phaseLabel");
  const macroReadout = document.getElementById("macroReadout");
  const targetWeightEl = document.getElementById("targetWeight");

  targetWeightEl.textContent = p.targetWeight ? `${p.targetWeight.toFixed(1)} kg` : "--.- kg";

  if (!plan) {
    phaseLabel.textContent = `Ziel: ${GOAL_LABELS[p.goalType]} · Profil unvollständig`;
    macroReadout.innerHTML = "Gewicht loggen sowie Alter &amp; Grösse im Profil eintragen, um Kalorien &amp; Makros zu berechnen.";
  } else {
    let rateText = "";
    if (plan.rateInfo) {
      const weeks = Math.round(plan.rateInfo.weeksLeft);
      const rate = plan.rateInfo.weeklyChangeKg;
      rateText = ` · ${weeks} Wochen verbleibend (${rate >= 0 ? "+" : ""}${rate.toFixed(2)}kg/Woche${plan.rateInfo.clamped ? ", gedrosselt" : ""})`;
    }
    phaseLabel.textContent = `${GOAL_LABELS[p.goalType]}${rateText}`;
    macroReadout.innerHTML =
      `<b>${plan.targetKcal}</b> kcal/Tag · <b>${plan.proteinG}g</b> Protein · ${plan.fatG}g Fett · ${plan.carbsG}g Kohlenhydrate<br>` +
      `TDEE ${plan.tdee} kcal (BMR ${plan.bmr}) ${plan.dailyDelta >= 0 ? "+" : ""}${plan.dailyDelta} kcal/Tag`;
  }

  const sorted = [...data.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const avg = last7.length ? (last7.reduce((s, e) => s + e.weight, 0) / last7.length) : null;
  document.getElementById("avgWeight").textContent = avg ? avg.toFixed(1) + " kg" : "--.- kg";

  renderRangeToggle();
  renderWeightChart(filterByRange(sorted, chartRange));
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

/* ---------------- FITNESS: exercises (weight + reps tracking) ----------------
   Two weekly training sessions, tracked as explicit tabs rather than tied to
   "today" — lets you log both this week's sessions (even on the same day, or
   backfill a past one) so the history charts get one real data point per
   session instead of at most one per calendar day. */
let selectedSession = 1;

function currentWeekMonday() { return isoDate(mondayOf(new Date())); }

function findWeekSessionEntry(session) {
  const monday = currentWeekMonday();
  return data.workoutLog.find(w => isoDate(mondayOf(parseLocalDate(w.date))) === monday && (w.session || 1) === session);
}

function getOrCreateWeekSessionEntry(session) {
  let entry = findWeekSessionEntry(session);
  if (!entry) {
    entry = { date: todayStr(), session, exercises: {} };
    data.workoutLog.push(entry);
  }
  return entry;
}

function renderSessionTabs() {
  [1, 2].forEach(session => {
    const btn = document.querySelector(`.session-tab[data-session="${session}"]`);
    const entry = findWeekSessionEntry(session);
    const done = entry && Object.values(entry.exercises).some(e => e.done);
    btn.classList.toggle("active", selectedSession === session);
    btn.classList.toggle("done", !!done);
    btn.textContent = `TRAINING ${session}${done ? " ✓" : ""}`;
  });
  const entry = findWeekSessionEntry(selectedSession);
  document.getElementById("sessionDateInput").value = entry ? entry.date : todayStr();
}

function renderExerciseList() {
  const list = document.getElementById("exerciseList");
  list.innerHTML = "";
  const entry = findWeekSessionEntry(selectedSession);

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

  const trainedSessions = [1, 2].filter(s => {
    const e = findWeekSessionEntry(s);
    return e && Object.values(e.exercises).some(x => x.done);
  });
  document.getElementById("workoutStreak").textContent = trainedSessions.length;

  renderSessionTabs();
}

function updateExerciseField(exId, field, rawValue) {
  const entry = getOrCreateWeekSessionEntry(selectedSession);
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

  const allPoints = data.workoutLog
    .filter(w => w.exercises[selectedExerciseId] && (w.exercises[selectedExerciseId].weight != null || w.exercises[selectedExerciseId].reps != null))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => ({ date: w.date, weight: w.exercises[selectedExerciseId].weight, reps: w.exercises[selectedExerciseId].reps }));
  const points = filterByRange(allPoints, chartRange);

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

document.getElementById("goalToggleBtn").addEventListener("click", () => {
  populateGoalForm();
  document.getElementById("goalForm").classList.toggle("hidden");
});

document.getElementById("goalForm").addEventListener("submit", e => {
  e.preventDefault();
  data.fitnessProfile = {
    sex: document.getElementById("goalSex").value,
    age: parseInt(document.getElementById("goalAge").value, 10) || null,
    heightCm: parseFloat(document.getElementById("goalHeight").value) || null,
    activityLevel: document.getElementById("goalActivity").value,
    goalType: document.getElementById("goalType").value,
    targetWeight: parseFloat(document.getElementById("goalTargetWeight").value) || null,
    targetDate: document.getElementById("goalTargetDate").value || null,
    proteinPerKg: parseFloat(document.getElementById("goalProteinOverride").value) || null,
  };
  saveData();
  document.getElementById("goalForm").classList.add("hidden");
  renderFitness();
});

document.getElementById("chartRangeToggle").addEventListener("click", e => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  chartRange = btn.dataset.range;
  renderFitness();
});

document.getElementById("sessionTabs").addEventListener("click", e => {
  const btn = e.target.closest(".session-tab");
  if (!btn) return;
  selectedSession = parseInt(btn.dataset.session, 10);
  renderExerciseList();
});

document.getElementById("sessionDateInput").addEventListener("change", e => {
  const entry = getOrCreateWeekSessionEntry(selectedSession);
  entry.date = e.target.value || todayStr();
  saveData();
  renderExerciseList();
  renderExerciseHistory();
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

function getSyncToken() { return currentAccountId ? localStorage.getItem(accountTokenKey(currentAccountId)) : null; }
function getGistId() { return currentAccountId ? localStorage.getItem(accountGistKey(currentAccountId)) : null; }
function setGistId(id) { if (currentAccountId) localStorage.setItem(accountGistKey(currentAccountId), id); }

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

async function githubRequest(url, options = {}, tokenOverride) {
  const token = tokenOverride || getSyncToken();
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

async function findExistingGist(token) {
  let page = 1;
  while (page <= 5) {
    const gists = await githubRequest(`https://api.github.com/gists?per_page=100&page=${page}`, {}, token);
    if (!gists.length) break;
    const match = gists.find(g => g.files && g.files[GIST_FILENAME]);
    if (match) return match.id;
    if (gists.length < 100) break;
    page++;
  }
  return null;
}

async function createGist(token, initialData) {
  const gist = await githubRequest("https://api.github.com/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(initialData !== undefined ? initialData : data, null, 2) } },
    }),
  }, token);
  return gist.id;
}

async function pullFromGist(gistId, token) {
  const gist = await githubRequest(`https://api.github.com/gists/${gistId}`, {}, token);
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
      gistId = await findExistingGist(token);
      if (!gistId) gistId = await createGist(token);
      setGistId(gistId);
    }
    await githubRequest(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } }),
    }, token);
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
      gistId = await findExistingGist(token);
      if (gistId) setGistId(gistId);
    }
    if (gistId) {
      const remote = await pullFromGist(gistId, token);
      if (remote) data = { ...defaultData(), ...remote };
    } else {
      const newId = await createGist(token);
      setGistId(newId);
    }
    setSyncStatus("verbunden · zuletzt " + new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }), "connected");
  } catch (e) {
    console.error("Sync pull error", e);
    setSyncStatus("Fehler beim Verbinden — Token prüfen", "error");
  }
}

function connectSync(token) {
  if (!currentAccountId) return Promise.resolve();
  localStorage.setItem(accountTokenKey(currentAccountId), token.trim());
  localStorage.removeItem(accountGistKey(currentAccountId));
  return initialSyncPull().then(renderAll);
}

function disconnectSync() {
  if (!currentAccountId) return;
  localStorage.removeItem(accountTokenKey(currentAccountId));
  localStorage.removeItem(accountGistKey(currentAccountId));
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

/* ================= ACCOUNTS (multi-user login) =================
   No backend: password only gates the login screen on this device.
   Real cross-device continuity comes from each account's own GitHub
   token pointing at its own private gist (same as Cloud Sync above).
   ================================================================= */

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("loadAccounts error", e);
    return [];
  }
}
function saveAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}
function findAccountByEmail(email) {
  return loadAccounts().find(a => a.email.toLowerCase() === email.toLowerCase());
}
function getCurrentAccountId() { return localStorage.getItem(CURRENT_ACCOUNT_KEY); }
function setCurrentAccountId(id) {
  currentAccountId = id;
  if (id) localStorage.setItem(CURRENT_ACCOUNT_KEY, id);
  else localStorage.removeItem(CURRENT_ACCOUNT_KEY);
}
function legacyDataExists() {
  return !!(localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(LEGACY_SYNC_TOKEN_KEY));
}

function randomSaltB64() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...arr));
}
async function derivePasswordHash(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function createAccountRecord(email, password) {
  const id = "acc_" + Math.random().toString(36).slice(2, 10);
  const salt = randomSaltB64();
  const hash = await derivePasswordHash(password, salt);
  const accounts = loadAccounts();
  accounts.push({ id, email, salt, hash });
  saveAccounts(accounts);
  return id;
}
async function verifyPassword(account, password) {
  const hash = await derivePasswordHash(password, account.salt);
  return hash === account.hash;
}

async function migrateLegacyData(email, password) {
  const id = await createAccountRecord(email, password);
  const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyData) localStorage.setItem(accountDataKey(id), legacyData);
  const legacyToken = localStorage.getItem(LEGACY_SYNC_TOKEN_KEY);
  if (legacyToken) localStorage.setItem(accountTokenKey(id), legacyToken);
  const legacyGist = localStorage.getItem(LEGACY_SYNC_GIST_KEY);
  if (legacyGist) localStorage.setItem(accountGistKey(id), legacyGist);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SYNC_TOKEN_KEY);
  localStorage.removeItem(LEGACY_SYNC_GIST_KEY);
  await enterAccount(id);
}

async function connectNewAccount(email, password, token) {
  if (findAccountByEmail(email)) {
    throw new Error("Diese E-Mail ist auf diesem Gerät schon verbunden — bitte anmelden statt neu verbinden.");
  }
  let gistId = await findExistingGist(token);
  let remoteData;
  if (gistId) {
    remoteData = await pullFromGist(gistId, token);
  } else {
    remoteData = defaultData();
    gistId = await createGist(token, remoteData);
  }
  const id = await createAccountRecord(email, password);
  localStorage.setItem(accountTokenKey(id), token);
  localStorage.setItem(accountGistKey(id), gistId);
  localStorage.setItem(accountDataKey(id), JSON.stringify({ ...defaultData(), ...remoteData }));
  await enterAccount(id);
}

async function enterAccount(id) {
  setCurrentAccountId(id);
  data = loadData();
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  const account = loadAccounts().find(a => a.id === id);
  document.getElementById("currentUserLabel").textContent = account ? account.email.split("@")[0].toUpperCase() : "SILVAN";
  if (getSyncToken()) {
    document.getElementById("syncDisconnectBtn").classList.remove("hidden");
    await initialSyncPull();
  } else {
    document.getElementById("syncDisconnectBtn").classList.add("hidden");
    setSyncStatus("nicht verbunden", null);
  }
  renderAll();
}

function logout() {
  setCurrentAccountId(null);
  data = defaultData();
  document.getElementById("app").classList.add("hidden");
  showAuthScreen();
}

let authPendingAccount = null;

function renderAuthAccountList() {
  const listEl = document.getElementById("authAccountList");
  listEl.innerHTML = "";
  loadAccounts().forEach(acc => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "auth-account-btn";
    btn.textContent = acc.email;
    btn.addEventListener("click", () => showAuthPasswordStep(acc));
    listEl.appendChild(btn);
  });
}

function showAuthPasswordStep(account) {
  authPendingAccount = account;
  setAuthError(null);
  document.getElementById("authPasswordEmail").textContent = account.email;
  document.getElementById("authPasswordForm").classList.remove("hidden");
  document.getElementById("authAccountList").classList.add("hidden");
  document.getElementById("authConnectToggleBtn").classList.add("hidden");
  document.getElementById("authConnectForm").classList.add("hidden");
  document.getElementById("authPasswordInput").focus();
}
function hideAuthPasswordStep() {
  authPendingAccount = null;
  document.getElementById("authPasswordInput").value = "";
  document.getElementById("authPasswordForm").classList.add("hidden");
  document.getElementById("authAccountList").classList.remove("hidden");
  document.getElementById("authConnectToggleBtn").classList.remove("hidden");
}

function setAuthError(msg) {
  const el = document.getElementById("authError");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}
function setAuthBusy(msg) {
  const el = document.getElementById("authBusy");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function showAuthScreen() {
  setAuthError(null);
  setAuthBusy(null);
  hideAuthPasswordStep();
  document.getElementById("authConnectForm").classList.add("hidden");
  renderAuthAccountList();
  const migrate = legacyDataExists() && loadAccounts().length === 0;
  document.getElementById("authMigrateForm").classList.toggle("hidden", !migrate);
  document.getElementById("authMain").classList.toggle("hidden", migrate);
  document.getElementById("authScreen").classList.remove("hidden");
}

document.getElementById("authMigrateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("migrateEmailInput").value.trim();
  const password = document.getElementById("migratePasswordInput").value;
  if (!email || !password) return;
  setAuthError(null);
  setAuthBusy("Konto wird angelegt…");
  try {
    await migrateLegacyData(email, password);
  } catch (e) {
    console.error("Migration error", e);
    setAuthError("Fehler beim Anlegen des Kontos.");
  } finally {
    setAuthBusy(null);
  }
});

document.getElementById("authPasswordForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!authPendingAccount) return;
  const password = document.getElementById("authPasswordInput").value;
  const ok = await verifyPassword(authPendingAccount, password);
  if (!ok) { setAuthError("Falsches Passwort."); return; }
  const id = authPendingAccount.id;
  hideAuthPasswordStep();
  setAuthBusy("Anmelden…");
  try {
    await enterAccount(id);
  } finally {
    setAuthBusy(null);
  }
});
document.getElementById("authPasswordBackBtn").addEventListener("click", () => hideAuthPasswordStep());

document.getElementById("authConnectToggleBtn").addEventListener("click", () => {
  document.getElementById("authConnectForm").classList.toggle("hidden");
});
document.getElementById("authConnectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const emailInput = document.getElementById("authEmailInput");
  const passwordInput = document.getElementById("authNewPasswordInput");
  const tokenInput = document.getElementById("authTokenInput");
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const token = tokenInput.value.trim();
  if (!email || !password || !token) return;
  setAuthError(null);
  setAuthBusy("Verbinde mit GitHub…");
  try {
    await connectNewAccount(email, password, token);
    emailInput.value = "";
    passwordInput.value = "";
    tokenInput.value = "";
  } catch (err) {
    console.error("Connect account error", err);
    setAuthError(err.message || "Verbindung fehlgeschlagen — Token prüfen.");
  } finally {
    setAuthBusy(null);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => logout());

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
  setTimeout(async () => {
    document.getElementById("boot").classList.add("hidden");
    const savedId = getCurrentAccountId();
    const account = savedId && loadAccounts().find(a => a.id === savedId);
    if (account) {
      await enterAccount(account.id);
    } else {
      showAuthScreen();
    }
  }, 600);
}

boot();
