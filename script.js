const FOOD_DB = {
  "Arándanos": {kcal:57, protein:0.7, fat:0.3, carbs:14.5},
  "Manzana": {kcal:52, protein:0.3, fat:0.2, carbs:13.8},
  "Avena (copos)": {kcal:389, protein:16.9, fat:6.9, carbs:66.3},
  "Huevo entero": {kcal:155, protein:13, fat:11, carbs:1.1},
  "Clara de huevo": {kcal:52, protein:11, fat:0.2, carbs:0.7},
  "Pan blanco": {kcal:265, protein:9, fat:3.2, carbs:49},
  "Pechuga de pollo": {kcal:165, protein:31, fat:3.6, carbs:0},
  "Pechuga de pavo": {kcal:135, protein:29, fat:1, carbs:0},
  "Salmón": {kcal:208, protein:20, fat:13, carbs:0},
  "Atún al natural": {kcal:116, protein:26, fat:1, carbs:0},
  "Aguacate": {kcal:160, protein:2, fat:14.7, carbs:8.5},
  "Aceite de oliva": {kcal:884, protein:0, fat:100, carbs:0},
  "Queso fresco batido": {kcal:74, protein:8, fat:3, carbs:4},
  "Leche desnatada": {kcal:35, protein:3.4, fat:0.1, carbs:5},
  "Tomate": {kcal:18, protein:0.9, fat:0.2, carbs:3.9},
  "Brócoli": {kcal:34, protein:2.8, fat:0.4, carbs:6.6},
  "Chocolate negro 85%": {kcal:598, protein:7.9, fat:42.6, carbs:45.9},
  "Jamón serrano": {kcal:241, protein:31, fat:13, carbs:0},
};

const MEALS = [
  {key:"desayuno", label:"Desayuno", time:"mañana"},
  {key:"comida", label:"Comida", time:"mediodía"},
  {key:"merienda", label:"Merienda", time:"entre horas"},
  {key:"cena", label:"Cena", time:"noche"}
];
const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const storagePrefix = "cuadernoNutricional:";
const VALID_TABS = new Set(["diario", "objetivos", "alimentos"]);

let customFoods = {};
let deletedBaseFoods = new Set();
let loggedDays = new Set();
let calendarViewDate = new Date();
let selectedDate = new Date();
let dayData = emptyDay();
let chart = null;
let editingFoodOriginalName = null;
let dailyGoals = emptyGoals();
let deferredInstallPrompt = null;
let syncPaused = false;
let syncSaveTimer = null;

function storageKey(key){ return storagePrefix + key; }
function emptyDay(){ return {desayuno:[], comida:[], merienda:[], cena:[]}; }
function emptyGoals(){ return {kcal:null, protein:null, fat:null, carbs:null}; }
function dateKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function allFoods(){
  const base = {};
  Object.keys(FOOD_DB).forEach(name => {
    if(!deletedBaseFoods.has(name)) base[name] = FOOD_DB[name];
  });
  return {...base, ...customFoods};
}
function isBaseFood(name){ return Object.prototype.hasOwnProperty.call(FOOD_DB, name); }
function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function getStored(key){
  return localStorage.getItem(storageKey(key)) ?? localStorage.getItem(key);
}
function setStored(key, value){
  localStorage.setItem(storageKey(key), value);
  scheduleCloudSync();
}
function deleteStored(key){
  localStorage.removeItem(storageKey(key));
  localStorage.removeItem(key);
  scheduleCloudSync();
}
function listStored(prefix){
  const keys = new Set();
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key.startsWith(storageKey(prefix))) keys.add(key.slice(storagePrefix.length));
    if(key.startsWith(prefix)) keys.add(key);
  }
  return [...keys];
}

async function init(){
  try{ customFoods = JSON.parse(getStored("foods") || "{}"); }
  catch(e){ customFoods = {}; }
  try{ deletedBaseFoods = new Set(JSON.parse(getStored("deletedFoods") || "[]")); }
  catch(e){ deletedBaseFoods = new Set(); }
  try{ dailyGoals = {...emptyGoals(), ...JSON.parse(getStored("goals") || "{}")}; }
  catch(e){ dailyGoals = emptyGoals(); }
  loggedDays = new Set(listStored("day:").map(k => k.slice(4)));
  bindEvents();
  hydrateGoalsForm();
  populateDatalist();
  renderFoodTable();
  renderCalendar();
  await selectDate(parseStoredDate(getStored("selectedDate")) || new Date());
  setActiveTab(VALID_TABS.has(getStored("activeTab")) ? getStored("activeTab") : "diario", false);
  startCloudSync();
  registerServiceWorker();
}

function bindEvents(){
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
  document.getElementById("prev-month").addEventListener("click", () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth()-1, 1);
    renderCalendar();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth()+1, 1);
    renderCalendar();
  });
  document.getElementById("open-food-modal").addEventListener("click", () => openFoodModal());
  document.getElementById("install-app").addEventListener("click", installApp);
  document.getElementById("nf-cancel").addEventListener("click", closeFoodModal);
  document.getElementById("nf-save").addEventListener("click", saveFoodFromModal);
  document.getElementById("food-modal").addEventListener("click", (e) => {
    if(e.target.id === "food-modal") closeFoodModal();
  });
  document.getElementById("food-search").addEventListener("input", renderFoodTable);
  document.getElementById("ranking-macro").addEventListener("change", renderFoodRanking);
  document.getElementById("day-ranking-macro").addEventListener("change", renderDayRanking);
  document.getElementById("goals-form").addEventListener("submit", saveGoals);
  document.getElementById("goals-clear").addEventListener("click", clearGoals);
}

function setupInstallPrompt(){
  const installButton = document.getElementById("install-app");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    showToast("App instalada.");
  });
}

async function installApp(){
  if(!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("install-app").hidden = true;
}

function setActiveTab(tabName, persist = true){
  if(!VALID_TABS.has(tabName)) tabName = "diario";
  document.querySelectorAll(".tab-button").forEach(button => button.classList.toggle("active", button.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  if(tabName === "alimentos") renderFoodTable();
  if(persist) setStored("activeTab", tabName);
}

function populateDatalist(){
  const dl = document.getElementById("foods-datalist");
  dl.innerHTML = "";
  Object.keys(allFoods()).sort((a,b)=>a.localeCompare(b,"es")).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  });
}

function renderCalendar(){
  document.getElementById("calendar-title").textContent = `${MONTH_NAMES[calendarViewDate.getMonth()]} ${calendarViewDate.getFullYear()}`;
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1;
  if(startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date();

  for(let i=0;i<startOffset;i++){
    const cell = document.createElement("div");
    cell.className = "cal-cell empty";
    grid.appendChild(cell);
  }
  for(let d=1; d<=daysInMonth; d++){
    const cellDate = new Date(year, month, d);
    const key = dateKey(cellDate);
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if(isSameDay(cellDate, today)) cell.classList.add("today");
    if(isSameDay(cellDate, selectedDate)) cell.classList.add("selected");
    cell.innerHTML = `<span>${d}</span>`;
    if(loggedDays.has(key)){
      const dot = document.createElement("span");
      dot.className = "cal-dot";
      cell.appendChild(dot);
    }
    cell.addEventListener("click", () => selectDate(cellDate));
    grid.appendChild(cell);
  }
}

async function selectDate(d){
  selectedDate = d;
  calendarViewDate = new Date(d.getFullYear(), d.getMonth(), 1);
  setStored("selectedDate", dateKey(d));
  try{ dayData = normalizeDay(JSON.parse(getStored("day:"+dateKey(d)) || "null")); }
  catch(e){ dayData = emptyDay(); }
  const isToday = isSameDay(d, new Date());
  document.getElementById("selected-date-title").textContent = `${isToday ? "Hoy, " : ""}${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
  renderCalendar();
  renderMeals();
  renderSummary();
}

function parseStoredDate(key){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key || "")) return null;
  const [year, month, day] = key.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderMeals(){
  const grid = document.getElementById("meals-grid");
  grid.innerHTML = "";
  MEALS.forEach(meal => grid.appendChild(buildMealCard(meal)));
}

function computeItemMacros(item){
  const food = allFoods()[item.food];
  if(!food) return {kcal:0, protein:0, fat:0, carbs:0, missing:true};
  const factor = item.grams/100;
  return {
    kcal: food.kcal*factor,
    protein: food.protein*factor,
    fat: food.fat*factor,
    carbs: food.carbs*factor
  };
}
function mealTotals(mealKey){
  return (dayData[mealKey] || []).reduce((acc, item) => {
    const m = computeItemMacros(item);
    acc.kcal += m.kcal; acc.protein += m.protein; acc.fat += m.fat; acc.carbs += m.carbs;
    return acc;
  }, {kcal:0, protein:0, fat:0, carbs:0});
}
function dayTotals(){
  return MEALS.reduce((acc, meal) => {
    const t = mealTotals(meal.key);
    acc.kcal += t.kcal; acc.protein += t.protein; acc.fat += t.fat; acc.carbs += t.carbs;
    return acc;
  }, {kcal:0, protein:0, fat:0, carbs:0});
}

function buildMealCard(meal){
  const card = document.createElement("div");
  card.className = "meal-card";
  card.dataset.meal = meal.key;
  const totals = mealTotals(meal.key);
  card.innerHTML = `
    <div class="meal-head"><span class="meal-name">${meal.label}</span><span class="meal-kcal">${Math.round(totals.kcal)} kcal</span></div>
    <span class="meal-time">${meal.time}</span>
  `;
  const items = dayData[meal.key] || [];
  if(items.length === 0){
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "Todavía no has añadido nada.";
    card.appendChild(note);
  } else {
    const list = document.createElement("ul");
    list.className = "item-list";
    items.forEach((item, idx) => {
      const m = computeItemMacros(item);
      const row = document.createElement("li");
      row.className = "item-row";
      row.innerHTML = `
        <span class="item-name">${item.food}${m.missing ? " !" : ""}</span>
        <span class="item-grams">${item.grams} g</span>
        <span class="item-kcal">${Math.round(m.kcal)} kcal</span>
        <button class="item-remove" type="button" aria-label="Borrar">x</button>
      `;
      row.querySelector(".item-remove").addEventListener("click", () => removeItem(meal.key, idx));
      list.appendChild(row);
    });
    card.appendChild(list);
  }

  const form = document.createElement("form");
  form.className = "add-form";
  form.innerHTML = `
    <input type="text" list="foods-datalist" placeholder="Alimento" required>
    <input type="number" placeholder="g" min="1" step="1" required>
    <button type="submit">Añadir</button>
  `;
  const errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.style.display = "none";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = form.querySelector('input[type="text"]');
    const gramsInput = form.querySelector('input[type="number"]');
    const name = nameInput.value.trim();
    const grams = parseFloat(gramsInput.value);
    const match = Object.keys(allFoods()).find(f => f.toLowerCase() === name.toLowerCase());
    if(!match || !grams){
      errorEl.textContent = `"${name}" no está en la lista. Créalo con "+ Nuevo alimento".`;
      errorEl.style.display = "block";
      return;
    }
    errorEl.style.display = "none";
    addItem(meal.key, match, grams);
    nameInput.value = "";
    gramsInput.value = "";
    nameInput.focus();
  });
  card.appendChild(form);
  card.appendChild(errorEl);
  return card;
}

async function addItem(mealKey, foodName, grams){
  dayData[mealKey].push({food:foodName, grams});
  persistDay();
  renderMeals();
  renderSummary();
}
async function removeItem(mealKey, idx){
  dayData[mealKey].splice(idx,1);
  persistDay();
  renderMeals();
  renderSummary();
}
function persistDay(){
  const key = dateKey(selectedDate);
  const isEmpty = MEALS.every(m => (dayData[m.key]||[]).length === 0);
  if(isEmpty){
    deleteStored("day:"+key);
    loggedDays.delete(key);
  } else {
    setStored("day:"+key, JSON.stringify(dayData));
    loggedDays.add(key);
  }
  renderCalendar();
}

function renderSummary(){
  const t = dayTotals();
  const maxGrams = Math.max(t.protein, t.fat, t.carbs, 1);
  document.getElementById("nutrition-label").innerHTML = `
    <p class="label-title">Datos nutricionales</p>
    <p class="label-sub">${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]} - total del día</p>
    <div class="rule-thick"></div>
    <div class="cal-row"><span>Calorías</span><span class="cal-value">${Math.round(t.kcal)}</span></div>
    ${goalRow("Calorías", t.kcal, dailyGoals.kcal, "kcal")}
    <div class="rule-thick"></div>
    ${macroRow("Proteína", "protein", t.protein, maxGrams)}
    ${goalRow("Objetivo proteína", t.protein, dailyGoals.protein, "g")}
    ${macroRow("Grasas", "fat", t.fat, maxGrams)}
    ${goalRow("Objetivo grasas", t.fat, dailyGoals.fat, "g")}
    ${macroRow("Carbohidratos", "carbs", t.carbs, maxGrams)}
    ${goalRow("Objetivo carbohidratos", t.carbs, dailyGoals.carbs, "g")}
    <div class="rule-thin"></div>
    <div id="meal-analysis"></div>
    <div class="rule-thin"></div>
  `;
  renderChart(t);
  renderMealAnalysis();
  renderDayRanking();
}
function goalRow(label, value, goal, unit){
  if(!goal || goal <= 0) return "";
  const remaining = goal - value;
  const percent = Math.min(value / goal * 100, 100);
  const over = remaining < 0;
  const amount = Math.abs(remaining);
  return `
    <div class="goal-row">
      <div class="goal-row-top">
        <strong>${label}</strong>
        <span>${roundValue(value)} / ${roundValue(goal)} ${unit}</span>
      </div>
      <div class="goal-track"><div class="goal-fill ${over ? "over" : ""}" style="width:${percent.toFixed(0)}%"></div></div>
      <p class="goal-note ${over ? "over" : ""}">${over ? "Te has pasado" : "Te quedan"} ${roundValue(amount)} ${unit}</p>
    </div>
  `;
}
function macroRow(label, cls, value, max){
  return `
    <div class="macro-row">
      <div class="macro-row-top"><span class="mlabel">${label}</span><span class="mval">${value.toFixed(1)} g</span></div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${(value/max*100).toFixed(0)}%"></div></div>
    </div>
  `;
}
function renderChart(t){
  return;
}

function renderFoodTable(){
  const query = (document.getElementById("food-search")?.value || "").trim().toLowerCase();
  const tbody = document.getElementById("foods-table-body");
  const foods = allFoods();
  tbody.innerHTML = "";
  Object.keys(foods)
    .filter(name => name.toLowerCase().includes(query))
    .sort((a,b) => a.localeCompare(b,"es"))
    .forEach(name => tbody.appendChild(buildFoodRow(name, foods[name])));
    renderFoodRanking();
    renderDeletedFoodsList();
}

function hydrateGoalsForm(){
  document.getElementById("goal-kcal").value = dailyGoals.kcal ?? "";
  document.getElementById("goal-protein").value = dailyGoals.protein ?? "";
  document.getElementById("goal-fat").value = dailyGoals.fat ?? "";
  document.getElementById("goal-carbs").value = dailyGoals.carbs ?? "";
}
function readGoalInput(id){
  const raw = document.getElementById(id).value.trim();
  if(raw === "") return null;
  const value = parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function saveGoals(event){
  event.preventDefault();
  dailyGoals = {
    kcal: readGoalInput("goal-kcal"),
    protein: readGoalInput("goal-protein"),
    fat: readGoalInput("goal-fat"),
    carbs: readGoalInput("goal-carbs")
  };
  setStored("goals", JSON.stringify(dailyGoals));
  renderSummary();
  showToast("Objetivos guardados.");
}
function clearGoals(){
  dailyGoals = emptyGoals();
  deleteStored("goals");
  hydrateGoalsForm();
  renderSummary();
  showToast("Límites quitados.");
}
function buildFoodRow(name, food){
  const tr = document.createElement("tr");
  tr.className = isBaseFood(name) && !customFoods[name] ? "is-base" : "";
  tr.innerHTML = `
    <td>${name}</td>
    <td>${roundValue(food.kcal)}</td>
    <td>${roundValue(food.protein)} g</td>
    <td>${roundValue(food.fat)} g</td>
    <td>${roundValue(food.carbs)} g</td>
    <td><div class="food-actions"></div></td>
  `;
  const actions = tr.querySelector(".food-actions");
  const editButton = document.createElement("button");
  editButton.className = "food-action secondary";
  editButton.type = "button";
  editButton.textContent = "Editar";
  editButton.addEventListener("click", () => openFoodModal(name));
  actions.appendChild(editButton);

  if(customFoods[name]){
    const deleteButton = document.createElement("button");
    deleteButton.className = "food-action danger";
    deleteButton.type = "button";
    deleteButton.textContent = isBaseFood(name) ? "Restaurar" : "Borrar";
    deleteButton.addEventListener("click", () => deleteCustomFood(name));
    actions.appendChild(deleteButton);
  } else if(isBaseFood(name)){
    const deleteButton = document.createElement("button");
    deleteButton.className = "food-action danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Borrar";
    deleteButton.addEventListener("click", () => deleteBaseFood(name));
    actions.appendChild(deleteButton);
  }
  return tr;
}
function roundValue(value){ return Number(value).toFixed(value % 1 === 0 ? 0 : 1); }

const MACRO_META = {
  protein: {label:"Proteína", icon:"🍗", unit:"g"},
  fat: {label:"Grasas", icon:"🥑", unit:"g"},
  carbs: {label:"Carbohidratos", icon:"🍞", unit:"g"}
};

function renderMealAnalysis(){
  const box = document.getElementById("meal-analysis");
  if(!box) return;

  const perMeal = MEALS.map(meal => ({meal, totals: mealTotals(meal.key)}));
  const hasAnyItem = MEALS.some(meal => (dayData[meal.key] || []).length > 0);

  if(!hasAnyItem){
    box.innerHTML = `
      <div class="analysis-inner">
        <p class="analysis-title">Comidas con más:</p>
        <p class="empty-note">Añade alimentos a alguna comida para ver este análisis.</p>
      </div>
    `;
    return;
  }

  const rows = Object.keys(MACRO_META).map(key => {
    const meta = MACRO_META[key];
    const top = perMeal.reduce((best, current) => current.totals[key] > best.totals[key] ? current : best, perMeal[0]);
    if(top.totals[key] <= 0){
      return `
        <div class="analysis-row">
          <span class="analysis-icon">${meta.icon}</span>
          <div class="analysis-text">
            <span class="analysis-label">${meta.label}</span>
            <span class="analysis-value">Sin registros</span>
          </div>
        </div>
      `;
    }
    return `
      <div class="analysis-row">
        <span class="analysis-icon">${meta.icon}</span>
        <div class="analysis-text">
          <span class="analysis-label">${meta.label}</span>
          <span class="analysis-value">${top.meal.label} · ${roundValue(top.totals[key])} ${meta.unit}</span>
        </div>
      </div>
    `;
  }).join("");

  box.innerHTML = `
    <div class="analysis-inner">
      <p class="analysis-title">Comidas con más:</p>
      ${rows}
    </div>
  `;
}

function dayFoodTotals(){
  const totals = {};
  MEALS.forEach(meal => {
    (dayData[meal.key] || []).forEach(item => {
      const m = computeItemMacros(item);
      if(!totals[item.food]) totals[item.food] = {kcal:0, protein:0, fat:0, carbs:0};
      totals[item.food].kcal += m.kcal;
      totals[item.food].protein += m.protein;
      totals[item.food].fat += m.fat;
      totals[item.food].carbs += m.carbs;
    });
  });
  return totals;
}

function renderDayRanking(){
  const list = document.getElementById("day-ranking-list");
  if(!list) return;

  const select = document.getElementById("day-ranking-macro");
  const macroKey = select ? select.value : "fat";
  const meta = RANKING_META[macroKey];
  const totals = dayFoodTotals();

  const sorted = Object.keys(totals)
    .map(name => ({name, value: totals[name][macroKey]}))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  if(sorted.length === 0){
    list.innerHTML = `<li class="day-ranking-empty">Añade alimentos para ver este ranking.</li>`;
    return;
  }

  const max = sorted[0].value;
  list.innerHTML = sorted.map(item => `
    <li class="day-ranking-item">
      <div class="day-ranking-item-top">
        <span class="day-ranking-name">${item.name}</span>
        <span class="day-ranking-value">${roundValue(item.value)} ${meta.unit}</span>
      </div>
      <div class="day-ranking-bar-track"><div class="day-ranking-bar-fill" style="width:${(item.value / max * 100).toFixed(0)}%"></div></div>
    </li>
  `).join("");
}

const RANKING_META = {
  fat: {unit:"g", threshold:15, badge:"Alto en grasas"},
  protein: {unit:"g", threshold:20, badge:"Alto en proteína"},
  carbs: {unit:"g", threshold:50, badge:"Alto en carbohidratos"},
  kcal: {unit:"kcal", threshold:400, badge:"Alto en calorías"}
};

function renderFoodRanking(){
  const list = document.getElementById("ranking-list");
  if(!list) return;

  const select = document.getElementById("ranking-macro");
  const macroKey = select ? select.value : "fat";
  const meta = RANKING_META[macroKey];
  const foods = allFoods();

  const sorted = Object.keys(foods)
    .map(name => ({name, value: foods[name][macroKey]}))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const max = sorted.length ? sorted[0].value : 1;

  list.innerHTML = sorted.map(item => `
    <li class="ranking-item">
      <div class="ranking-item-top">
        <span class="ranking-name">${item.name}</span>
        <span class="ranking-value">
          ${roundValue(item.value)} ${meta.unit}/100g
          ${item.value >= meta.threshold ? `<span class="ranking-badge">${meta.badge}</span>` : ""}
        </span>
      </div>
      <div class="ranking-bar-track"><div class="ranking-bar-fill" style="width:${(item.value / max * 100).toFixed(0)}%"></div></div>
    </li>
  `).join("");
}

function openFoodModal(name = null){
  editingFoodOriginalName = name;
  const modal = document.getElementById("food-modal");
  const food = name ? allFoods()[name] : null;
  document.getElementById("food-modal-title").textContent = name ? "Editar alimento" : "Nuevo alimento";
  document.getElementById("nf-error").style.display = "none";
  document.getElementById("nf-name").value = name || "";
  document.getElementById("nf-kcal").value = food ? food.kcal : "";
  document.getElementById("nf-protein").value = food ? food.protein : "";
  document.getElementById("nf-fat").value = food ? food.fat : "";
  document.getElementById("nf-carbs").value = food ? food.carbs : "";
  modal.classList.remove("hidden");
  document.getElementById("nf-name").focus();
}
function closeFoodModal(){
  document.getElementById("food-modal").classList.add("hidden");
  editingFoodOriginalName = null;
}
function saveFoodFromModal(){
  const name = document.getElementById("nf-name").value.trim();
  const kcal = parseFloat(document.getElementById("nf-kcal").value);
  const protein = parseFloat(document.getElementById("nf-protein").value);
  const fat = parseFloat(document.getElementById("nf-fat").value);
  const carbs = parseFloat(document.getElementById("nf-carbs").value);
  if(!name || [kcal, protein, fat, carbs].some(Number.isNaN)){
    document.getElementById("nf-error").style.display = "block";
    return;
  }
  if(editingFoodOriginalName && editingFoodOriginalName !== name && customFoods[editingFoodOriginalName]){
    delete customFoods[editingFoodOriginalName];
    renameFoodInDays(editingFoodOriginalName, name);
    MEALS.forEach(meal => {
      (dayData[meal.key] || []).forEach(item => {
        if(item.food === editingFoodOriginalName) item.food = name;
      });
    });
  }
  customFoods[name] = {kcal, protein, fat, carbs};
  persistFoods();
  populateDatalist();
  renderFoodTable();
  renderMeals();
  renderSummary();
  closeFoodModal();
  showToast(`"${name}" guardado.`);
}
function persistFoods(){ setStored("foods", JSON.stringify(customFoods)); }
function deleteCustomFood(name){
  delete customFoods[name];
  persistFoods();
  populateDatalist();
  renderFoodTable();
  renderMeals();
  renderSummary();
  showToast(isBaseFood(name) ? `"${name}" restaurado.` : `"${name}" borrado.`);
}
function persistDeletedFoods(){ setStored("deletedFoods", JSON.stringify([...deletedBaseFoods])); }
function deleteBaseFood(name){
  deletedBaseFoods.add(name);
  persistDeletedFoods();
  populateDatalist();
  renderFoodTable();
  renderMeals();
  renderSummary();
  showToast(`"${name}" eliminado.`);
}
function restoreBaseFood(name){
  deletedBaseFoods.delete(name);
  persistDeletedFoods();
  populateDatalist();
  renderFoodTable();
  renderMeals();
  renderSummary();
  showToast(`"${name}" restaurado.`);
}
function renderDeletedFoodsList(){
  const box = document.getElementById("deleted-foods-box");
  const list = document.getElementById("deleted-foods-list");
  if(!box || !list) return;

  if(deletedBaseFoods.size === 0){
    box.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  box.classList.remove("hidden");
  list.innerHTML = "";
  [...deletedBaseFoods].sort((a,b) => a.localeCompare(b,"es")).forEach(name => {
    const li = document.createElement("li");
    li.className = "deleted-item";
    li.innerHTML = `<span class="deleted-name">${name}</span>`;
    const restoreButton = document.createElement("button");
    restoreButton.className = "food-action secondary";
    restoreButton.type = "button";
    restoreButton.textContent = "Restaurar";
    restoreButton.addEventListener("click", () => restoreBaseFood(name));
    li.appendChild(restoreButton);
    list.appendChild(li);
  });
}
function renameFoodInDays(oldName, newName){
  listStored("day:").forEach(key => {
    try{
      const data = normalizeDay(JSON.parse(getStored(key)));
      let changed = false;
      MEALS.forEach(meal => {
        (data[meal.key] || []).forEach(item => {
          if(item.food === oldName){ item.food = newName; changed = true; }
        });
      });
      if(changed) setStored(key, JSON.stringify(data));
    }catch(e){}
  });
}

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function registerServiceWorker(){
  if("serviceWorker" in navigator){
    let refreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("./service-worker.js?v=20260712-fix1")
      .then((registration) => {
        checkForAppUpdate(registration);

        document.addEventListener("visibilitychange", () => {
          if(document.visibilityState === "visible") checkForAppUpdate(registration);
        });

        window.addEventListener("focus", () => checkForAppUpdate(registration));
        setInterval(() => checkForAppUpdate(registration), 60 * 60 * 1000);
      })
      .catch(() => {});
  }
}

function checkForAppUpdate(registration){
  registration.update().catch(() => {});

  if(registration.waiting){
    showToast("Actualizando app...");
    registration.waiting.postMessage({type:"SKIP_WAITING"});
  }
}

function startCloudSync(){
  if(!window.CuadernoCloudSync) return;

  window.CuadernoCloudSync.start({
    getState: exportNotebookState,
    applyState: importNotebookState,
    onReady: () => showToast("Sincronizacion activa."),
    onRemoteChange: () => showToast("Datos actualizados."),
    onError: () => showToast("Sincronizacion no disponible.")
  });
}

function scheduleCloudSync(){
  if(syncPaused || !window.CuadernoCloudSync?.save) return;

  clearTimeout(syncSaveTimer);
  syncSaveTimer = setTimeout(() => {
    window.CuadernoCloudSync.save(exportNotebookState());
  }, 350);
}

function exportNotebookState(){
  const days = {};
  listStored("day:").forEach(key => {
    try{ days[key.slice(4)] = JSON.parse(getStored(key)); }
    catch(e){}
  });

  return {
    version: 1,
    foods: customFoods,
    deletedFoods: [...deletedBaseFoods],
    goals: dailyGoals,
    days,
    selectedDate: dateKey(selectedDate),
    activeTab: getStored("activeTab") || "diario"
  };
}

async function importNotebookState(state){
  if(!state || typeof state !== "object") return;

  syncPaused = true;
  try{
    clearNotebookStorage();

    customFoods = sanitizeObject(state.foods);
    deletedBaseFoods = new Set(sanitizeArray(state.deletedFoods).filter(name => isBaseFood(name)));
    dailyGoals = {...emptyGoals(), ...sanitizeObject(state.goals)};

    localStorage.setItem(storageKey("foods"), JSON.stringify(customFoods));
    localStorage.setItem(storageKey("deletedFoods"), JSON.stringify([...deletedBaseFoods]));
    localStorage.setItem(storageKey("goals"), JSON.stringify(dailyGoals));

    const days = sanitizeObject(state.days);
    Object.keys(days).forEach(key => {
      if(/^\d{4}-\d{2}-\d{2}$/.test(key)){
        localStorage.setItem(storageKey("day:"+key), JSON.stringify(normalizeDay(days[key])));
      }
    });

    const nextDate = parseStoredDate(state.selectedDate) || selectedDate || new Date();
    localStorage.setItem(storageKey("selectedDate"), dateKey(nextDate));

    const nextTab = VALID_TABS.has(state.activeTab) ? state.activeTab : "diario";
    localStorage.setItem(storageKey("activeTab"), nextTab);

    loggedDays = new Set(listStored("day:").map(k => k.slice(4)));
    hydrateGoalsForm();
    populateDatalist();
    renderFoodTable();
    await selectDate(nextDate);
    setActiveTab(nextTab, false);
  } finally {
    syncPaused = false;
  }
}

function clearNotebookStorage(){
  const keys = [];
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key === storageKey("deviceId")) continue;
    if(key?.startsWith(storagePrefix) || key?.startsWith("day:") || ["foods", "goals", "selectedDate", "activeTab"].includes(key)){
      keys.push(key);
    }
  }
  keys.forEach(key => localStorage.removeItem(key));
}

function sanitizeObject(value){
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function sanitizeArray(value){
  return Array.isArray(value) ? value : [];
}

function normalizeDay(value){
  const day = emptyDay();
  const source = sanitizeObject(value);
  MEALS.forEach(meal => {
    day[meal.key] = Array.isArray(source[meal.key]) ? source[meal.key] : [];
  });
  if(Array.isArray(source.Merienda)){
    day.merienda = [...day.merienda, ...source.Merienda];
  }
  return day;
}

document.addEventListener("DOMContentLoaded", init);
setupInstallPrompt();
