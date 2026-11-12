import {
  PHASE_INFO,
  SYMPTOMS,
  addDays,
  dateKey,
  daysBetween,
  formatDate,
  getCyclePhase,
  getFertilityStatus,
  getPeriodEpisodes,
  getPrediction,
  isValidDateKey,
} from "./cycle.js";
import { getMoonSign, getZodiacSign } from "./moon.js";
import { registerSW } from "virtual:pwa-register";
import {
  MEAL_CATEGORIES,
  MOODS,
  isMealCategory,
  isMood,
  normalizeWellnessLog,
} from "./wellness.js";

const STORAGE_KEY = "petal-cycle-tracker-v1";
const ASSISTANT_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const ASSISTANT_SYSTEM_PROMPT = `You provide brief, kind, general menstrual-health education. You are an AI, not a doctor or period specialist. Be inclusive and do not assume a person's gender.

Use these verified basics: cycle day 1 is the first day of menstrual bleeding. Cycle length is counted from the first day of one period through the day before the next period starts. Period bleeding duration is different from cycle length. Cycles vary; ovulation and fertile-window estimates can shift, so they cannot identify safe days or prevent pregnancy.

Do not diagnose, determine whether someone is pregnant, recommend a personal treatment or medication dose, or make up clinical facts. Do not infer health facts from astrology. If you are unsure, say so plainly instead of guessing. If the person reports cycles shorter than 21 or longer than 35 days, bleeding longer than 7 days, very heavy bleeding, severe pain, or a missed period, suggest speaking with a healthcare professional. Encourage urgent local medical care for severe or rapidly worsening symptoms.`;
const pageContent = document.querySelector("#page-content");
const storageNotice = document.querySelector("#storage-notice");
const dayDialog = document.querySelector("#day-dialog");
const periodDialog = document.querySelector("#period-dialog");
const dayForm = document.querySelector("#day-form");
const periodForm = document.querySelector("#period-form");
const today = dateKeyFromLocal(new Date());
const state = readState();
document.querySelector("#day-date").max = today;
document.querySelector("#period-start").max = today;
document.querySelector("#period-end").max = today;

let activePage = "today";
let selectedDate = today;
let wellnessDate = today;
let editingMealId = null;
let visibleMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
let editingDate = null;
let messageTimer;
let assistantBusy = false;
let assistantEngine = null;
let assistantWorker = null;
let assistantLoadPromise = null;
let assistantStatus = "The model is not downloaded yet. Its first load needs internet and about 280 MB of storage; after caching, chat can work offline.";
const assistantMessages = [];

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error("Could not register the offline app cache.", error);
    showNotice("Offline page caching is unavailable in this browser. The app can still run while online.");
  },
});

render();

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  activePage = button.dataset.page;
  if (activePage === "wellness") wellnessDate = selectedDate;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) handleAction(action.dataset.action, action);

  const pageButton = event.target.closest("[data-page]");
  if (pageButton && !pageButton.closest(".bottom-nav")) {
    activePage = pageButton.dataset.page;
    if (activePage === "wellness") wellnessDate = selectedDate;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const day = event.target.closest("[data-date]");
  if (day?.dataset.date && isValidDateKey(day.dataset.date)) {
    selectedDate = day.dataset.date;
    if (day.dataset.selectDay === "true") activePage = "calendar";
    render();
  }

  const wellnessDay = event.target.closest("[data-wellness-date]");
  if (wellnessDay?.dataset.wellnessDate && isValidDateKey(wellnessDay.dataset.wellnessDate)) {
    wellnessDate = wellnessDay.dataset.wellnessDate;
    editingMealId = null;
    render();
  }
});

dayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(dayForm);
  const date = formData.get("date");
  if (!isValidDateKey(date) || date > today) return showNotice("Choose a real date today or earlier.");
  const flow = formData.get("flow");
  if (flow && !["light", "medium", "heavy"].includes(flow)) return showNotice("Choose a flow level from the list.");
  const symptoms = [...dayForm.querySelectorAll('input[name="symptoms"]:checked')].map((input) => input.value);
  if (symptoms.some((symptom) => !SYMPTOMS.includes(symptom))) return showNotice("One of the selected symptoms is not recognized.");

  const existing = state.entries[editingDate ?? date] ?? {};
  const targetEntry = state.entries[date] ?? {};
  if (editingDate && editingDate !== date) delete state.entries[editingDate];
  const entry = { ...existing, symptoms: [...new Set(symptoms)] };
  if (flow) entry.flow = flow;
  else delete entry.flow;
  if (targetEntry !== existing) {
    entry.symptoms = [...new Set([...targetEntry.symptoms ?? [], ...entry.symptoms])];
    if (!flow && targetEntry.flow) entry.flow = targetEntry.flow;
  }
  if (entry.flow || entry.symptoms.length) state.entries[date] = entry;
  else delete state.entries[date];
  selectedDate = date;
  editingDate = null;
  visibleMonth = monthForDate(date);
  persistAndRender();
  dayDialog.close();
});

periodForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(periodForm);
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate");
  const flow = formData.get("flow");
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > today || endDate > today) return showNotice("Choose real start and end dates today or earlier.");
  if (endDate < startDate) return showNotice("The last day must be on or after the first day.");
  if (daysBetween(startDate, endDate) >= 366) return showNotice("Please enter a period shorter than one year.");
  if (!["light", "medium", "heavy"].includes(flow)) return showNotice("Choose a flow level from the list.");

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    state.entries[date] = { ...state.entries[date], flow };
  }
  selectedDate = startDate;
  visibleMonth = monthForDate(startDate);
  persistAndRender();
  periodDialog.close();
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "assistant-form") {
    event.preventDefault();
    void sendAssistantMessage(event.target);
  } else if (event.target.id === "mood-form") {
    event.preventDefault();
    saveMood(event.target);
  } else if (event.target.id === "meal-form") {
    event.preventDefault();
    saveMeal(event.target);
  } else if (event.target.id === "journal-form") {
    event.preventDefault();
    saveJournal(event.target);
  }
});

function handleAction(action, button) {
  switch (action) {
    case "log-day":
      openDayDialog(button.dataset.date || selectedDate);
      break;
    case "log-period":
      openPeriodDialog(button.dataset.date || selectedDate);
      break;
    case "close-day":
      dayDialog.close();
      break;
    case "close-period":
      periodDialog.close();
      break;
    case "delete-day":
      deleteSelectedDay();
      break;
    case "load-assistant-model":
      void loadAssistantModel();
      break;
    case "delete-assistant-model":
      void deleteAssistantModel();
      break;
    case "delete-mood":
      deleteMood();
      break;
    case "edit-meal":
      editingMealId = button.dataset.mealId;
      render();
      document.querySelector("#meal-note")?.focus();
      break;
    case "edit-meal-cancel":
      editingMealId = null;
      render();
      break;
    case "delete-meal":
      deleteMeal(button.dataset.mealId);
      break;
    case "clear-journal":
      clearJournal();
      break;
    case "previous-month":
      changeMonth(-1);
      break;
    case "next-month":
      changeMonth(1);
      break;
    case "this-month":
      visibleMonth = monthForDate(today);
      selectedDate = today;
      render();
      break;
    case "export-data":
      exportData();
      break;
    case "delete-all":
      deleteAllData();
      break;
  }
}

function render() {
  const episodes = getPeriodEpisodes(state.entries);
  const prediction = getPrediction(episodes);
  const common = { episodes, prediction, entries: state.entries };

  document.querySelectorAll(".nav-item").forEach((item) => {
    if (item.dataset.page === activePage) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.documentElement.dataset.theme = state.theme === "system" ? "" : state.theme;
  const page = {
    today: () => renderToday(common),
    calendar: () => renderCalendar(common),
    insights: () => renderInsights(common),
    astro: () => renderAstro(common),
    wellness: renderWellness,
    settings: renderSettings,
  }[activePage];
  pageContent.innerHTML = page();
}

function renderToday({ episodes, prediction, entries }) {
  const phase = getCyclePhase(today, entries, prediction);
  const phaseInfo = PHASE_INFO[phase];
  const cycleDay = prediction.lastEpisode && prediction.averageCycleLength
    ? daysBetween(prediction.lastEpisode.startDate, today) + 1
    : null;
  const recentEntry = entries[today];
  const fertility = getFertilityStatus(today, prediction);
  const phaseSummary = getPhaseSummary(phase, entries, episodes, today);
  const predictionSummary = predictionMarkup(prediction);

  return `
    <section class="page-heading">
      <div><p class="eyebrow">${escapeHTML(formatDate(today, { weekday: "long", month: "long", day: "numeric" }))}</p><h1>Your day,<br><em>at your pace.</em></h1></div>
      <span class="heading-flower" aria-hidden="true">✿</span>
    </section>
    <section class="today-grid">
      <article class="card cycle-card">
        <div class="card-topline"><span class="eyebrow">YOUR CYCLE</span><span class="mini-status"><span class="status-dot"></span>${phaseInfo.label}</span></div>
        <div class="cycle-number">${cycleDay && cycleDay > 0 ? `Day ${cycleDay}` : "A fresh page"}</div>
        <p class="muted">${cycleDay && cycleDay > 0 ? "A gentle check-in, not a rulebook." : "Your cycle becomes clearer as you log."}</p>
        <div class="cycle-progress" aria-hidden="true"><span style="width:${cycleProgress(cycleDay, prediction.averageCycleLength)}%"></span></div>
        <div class="cycle-footnote"><span>Last period ${prediction.lastEpisode ? escapeHTML(formatDate(prediction.lastEpisode.startDate)) : "not logged"}</span><button class="text-button" data-action="log-period">Log period ↗</button></div>
      </article>
      <article class="card forecast-card">
        <span class="eyebrow">AHEAD, GENTLY</span>
        <h2>${prediction.nextPeriodRange ? escapeHTML(rangeLabel(prediction.nextPeriodRange)) : "Your estimate is taking shape"}</h2>
        <p class="muted">${prediction.nextPeriodRange ? "Estimated next period" : "Log two period starts to begin a personal estimate."}</p>
        ${predictionSummary}
      </article>
    </section>
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">TODAY'S WINDOW</p><h2>Know your estimate</h2></div><span class="moon-small">${getMoonSign(today)} moon</span></div>
      ${fertilityCard(fertility, prediction)}
    </section>
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">HOW YOU FEEL</p><h2>Today's check-in</h2></div><button class="button button-secondary button-small" data-action="log-day" data-date="${today}">${recentEntry ? "Edit today" : "Add a note"}</button></div>
      <div class="card checkin-card">${entrySummary(recentEntry)}</div>
    </section>
    <section class="section-block phase-layout">
      <article class="card phase-card">
        <p class="eyebrow">CYCLE PHASE</p><h2>${phaseInfo.label}</h2>
        <p class="muted">${phase === "unknown" ? phaseInfo.care : "A broad estimate based on your logged cycle starts."}</p>
        ${phaseInfo.typical.length ? `<h3>Commonly reported</h3><div class="tag-list">${phaseInfo.typical.map((name) => `<span class="tag ${recentEntry?.symptoms?.includes(name) ? "tag-match" : ""}">${escapeHTML(name)}</span>`).join("")}</div><p class="field-hint">${recentEntry?.symptoms?.length ? phaseComparison(phaseInfo.typical, recentEntry.symptoms) : "Log a symptom to compare your notes with common experiences."}</p>` : ""}
        <div class="care-note"><span aria-hidden="true">✳</span> ${escapeHTML(phaseInfo.care)}</div>
      </article>
      <article class="card safety-card">
        <span class="eyebrow">A KIND REMINDER</span><h2>When to check in with a doctor</h2>
        <p>Ask a healthcare professional about cycles shorter than 21 or longer than 35 days, bleeding over 7 days, very heavy bleeding, severe pain, or a missed period.</p>
        <p class="field-hint">This tracker cannot diagnose a health concern.</p>
      </article>
    </section>
    <details class="phase-library">
      <summary>Explore all four phases and common experiences</summary>
      ${renderPhaseGuides(entries, episodes, prediction)}
    </details>
    ${renderAssistant()}
    <section class="quick-actions"><button class="button button-primary" data-action="log-day" data-date="${today}">＋ Log today</button><button class="button button-secondary" data-page="calendar">Open calendar</button></section>
  `;
}

function renderCalendar({ entries, prediction }) {
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const cells = Array.from({ length: Math.ceil((offset + totalDays) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > totalDays) return '<span class="calendar-blank" aria-hidden="true"></span>';
    const date = dateKey(new Date(Date.UTC(year, month, day)));
    const entry = entries[date];
    const wellness = state.wellness[date];
    const hasWellness = Boolean(wellness?.mood || wellness?.meals?.length || wellness?.journal);
    const classes = ["calendar-day"];
    if (["light", "medium", "heavy"].includes(entry?.flow)) classes.push("is-period");
    if (date >= (prediction.nextPeriodRange?.startDate ?? "9999") && date <= (prediction.nextPeriodRange?.endDate ?? "0000")) classes.push("is-predicted");
    if (date >= (prediction.fertileWindow?.startDate ?? "9999") && date <= (prediction.fertileWindow?.endDate ?? "0000")) classes.push("is-fertile");
    if (date >= (prediction.ovulationRange?.startDate ?? "9999") && date <= (prediction.ovulationRange?.endDate ?? "0000")) classes.push("is-ovulation");
    if (entry?.symptoms?.length) classes.push("has-symptoms");
    if (hasWellness) classes.push("has-wellness");
    if (date === selectedDate) classes.push("is-selected");
    if (date === today) classes.push("is-today");
    return `<button type="button" class="${classes.join(" ")}" data-date="${date}" data-select-day="true" aria-label="${escapeHTML(formatDate(date))}${entry?.symptoms?.length ? `, ${entry.symptoms.length} symptoms logged` : ""}${wellness?.mood ? `, mood ${escapeHTML(moodLabel(wellness.mood))}` : ""}${wellness?.meals?.length ? `, ${wellness.meals.length} food notes` : ""}${wellness?.journal ? ", journal note" : ""}"><span>${day}</span><i aria-hidden="true"></i><b aria-hidden="true"></b></button>`;
  }).join("");
  const selectedEntry = entries[selectedDate];
  const phase = getCyclePhase(selectedDate, entries, prediction);
  const selectedMoon = getMoonSign(selectedDate);

  return `
    <section class="page-heading compact-heading"><div><p class="eyebrow">YOUR MONTH, IN YOUR COLORS</p><h1>Cycle calendar</h1></div><button class="button button-primary" data-action="log-period" data-date="${selectedDate}">＋ Log period</button></section>
    <section class="card calendar-card">
      <div class="month-controls"><button class="icon-button" data-action="previous-month" aria-label="Previous month">‹</button><h2>${escapeHTML(monthTitle)}</h2><button class="icon-button" data-action="next-month" aria-label="Next month">›</button><button class="text-button month-today" data-action="this-month">Today</button></div>
      <div class="calendar-grid calendar-weekdays" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
      <div class="calendar-legend">
        <span><i class="legend-period"></i>Period</span><span><i class="legend-predicted"></i>Predicted period</span><span><i class="legend-fertile"></i>Higher estimated chance</span><span><i class="legend-ovulation"></i>Estimated ovulation</span><span><i class="legend-symptoms"></i>Symptoms logged</span><span><i class="legend-wellness"></i>Mood / food / journal note</span>
      </div>
    </section>
    <section class="card selected-day-card">
      <div class="selected-day-header"><div><p class="eyebrow">YOUR NOTE</p><h2>${escapeHTML(formatDate(selectedDate))}</h2></div><span class="moon-small">${selectedMoon} moon</span></div>
      ${entrySummary(selectedEntry)}
      ${wellnessSummary(state.wellness[selectedDate])}
      ${fertilityCard(getFertilityStatus(selectedDate, prediction), prediction)}
      <div class="selected-day-footer"><span class="muted">${PHASE_INFO[phase].label}${state.birthDate ? ` · ${getZodiacSign(state.birthDate)} sun` : ""}</span><span class="footer-actions"><button class="button button-secondary button-small" data-action="log-day" data-date="${selectedDate}">${selectedEntry ? "Edit cycle note" : "Add cycle note"}</button><button class="button button-secondary button-small" data-page="wellness">Mood & food</button></span></div>
    </section>
    <p class="field-hint safety-inline">Calendar estimates are not contraception. Pregnancy is possible on days marked as lower chance too.</p>
  `;
}

function renderInsights({ episodes, prediction, entries }) {
  const cycleRows = prediction.cycleLengths.map((length, index) => ({
    label: `Cycle ${index + 1}`,
    value: length,
    date: episodes[index + 1].startDate,
  }));
  const periodRows = episodes.map((episode, index) => ({
    label: `Period ${index + 1}`,
    value: episode.length,
    date: episode.startDate,
  }));
  const symptomCounts = SYMPTOMS.map((symptom) => ({
    label: symptom,
    value: Object.values(entries).filter((entry) => entry?.symptoms?.includes(symptom)).length,
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  return `
    <section class="page-heading"><div><p class="eyebrow">SMALL NOTES, OVER TIME</p><h1>Your patterns,<br><em>at a glance.</em></h1></div><span class="heading-flower" aria-hidden="true">✳</span></section>
    <section class="stats-grid">
      <article class="card stat-card"><span class="eyebrow">AVERAGE CYCLE</span><strong>${prediction.averageCycleLength ? `${prediction.averageCycleLength}<small>days</small>` : "—"}</strong><p>${prediction.cycleLengths.length} completed cycle${prediction.cycleLengths.length === 1 ? "" : "s"} logged</p></article>
      <article class="card stat-card"><span class="eyebrow">AVERAGE PERIOD</span><strong>${prediction.averagePeriodLength !== null ? `${round1(prediction.averagePeriodLength)}<small>days</small>` : "—"}</strong><p>${episodes.length} period${episodes.length === 1 ? "" : "s"} logged</p></article>
      <article class="card stat-card"><span class="eyebrow">PREDICTION NOTE</span><strong>${prediction.irregular ? "A range" : prediction.roughEstimate ? "Early days" : "Steadier"}</strong><p>${prediction.roughEstimate ? "Fewer than 3 period starts; treat estimates as rough." : prediction.irregular ? "Your recorded cycles vary, so dates are shown as a range." : "Based on the period starts you have logged."}</p></article>
    </section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">OVER TIME</p><h2>Cycle length</h2></div><span class="chart-unit">days</span></div><article class="card chart-card">${renderChart(cycleRows, "Cycle length in days")}</article></section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">OVER TIME</p><h2>Period length</h2></div><span class="chart-unit">days</span></div><article class="card chart-card">${renderChart(periodRows, "Period length in days")}</article></section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">YOUR NOTES</p><h2>Most logged symptoms</h2></div><span class="chart-unit">entries</span></div><article class="card chart-card">${renderSymptomBars(symptomCounts)}</article></section>
    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">LEARN ABOUT YOUR CYCLE</p><h2>Four phases, four experiences</h2></div></div>${renderPhaseGuides(entries, episodes, prediction)}</section>
    ${getPhaseSummary(getCyclePhase(today, entries, prediction), entries, episodes, today)}
    <p class="field-hint safety-inline">These charts describe your notes, not a diagnosis. With fewer than 3 logged periods, cycle predictions are rough estimates.</p>
  `;
}

function renderAstro({ entries, prediction }) {
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const cells = Array.from({ length: Math.ceil((offset + totalDays) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > totalDays) return '<span class="calendar-blank"></span>';
    const date = dateKey(new Date(Date.UTC(year, month, day)));
    return `<button class="astro-day ${date === selectedDate ? "is-selected" : ""} ${date === today ? "is-today" : ""}" type="button" data-date="${date}" data-select-day="true"><span>${day}</span><small>${escapeHTML(getMoonSign(date))}</small></button>`;
  }).join("");
  const selectedMoon = getMoonSign(selectedDate);
  const natalSign = state.birthDate ? getZodiacSign(state.birthDate) : null;
  const phase = getCyclePhase(selectedDate, entries, prediction);
  const selectedSymptoms = entries[selectedDate]?.symptoms ?? [];
  const astroMood = selectedSymptoms.length ? selectedSymptoms.join(", ").toLowerCase() : "a quiet check-in";
  const insight = `${natalSign ? `Your ${natalSign} sun` : "Your day"} meets a Moon in ${selectedMoon} during your ${PHASE_INFO[phase].label.toLowerCase()} phase, with ${astroMood} in your notes. Consider making room for what feels kind today.`;

  return `
    <section class="page-heading"><div><p class="eyebrow">A LITTLE COSMIC CURIOSITY</p><h1>Moon notes,<br><em>just for fun.</em></h1></div><span class="heading-flower" aria-hidden="true">☾</span></section>
    <div class="entertainment-note"><strong>Entertainment only</strong><span>Astrology is not medical advice and cannot explain or predict your health, cycle, or fertility.</span></div>
    <section class="astro-layout">
      <article class="card astro-calendar-card"><div class="month-controls"><button class="icon-button" data-action="previous-month" aria-label="Previous month">‹</button><h2>${escapeHTML(monthTitle)}</h2><button class="icon-button" data-action="next-month" aria-label="Next month">›</button></div><div class="calendar-grid calendar-weekdays" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-grid">${cells}</div></article>
      <div class="astro-side">
        <article class="card moon-card"><span class="eyebrow">MOON SIGN · ${escapeHTML(formatDate(selectedDate, { month: "short", day: "numeric" }))}</span><h2>${selectedMoon}</h2><p class="muted">An approximate tropical zodiac sign for this calendar date.</p><span class="moon-glyph" aria-hidden="true">☾</span></article>
        <article class="card astro-insight"><span class="eyebrow">SELECTED DAY'S FOR-FUN NOTE</span><p>${escapeHTML(insight)}</p><span class="field-hint">A playful prompt, not a fact about your body.</span></article>
        <article class="card birth-card"><span class="eyebrow">YOUR SUN SIGN</span><h2>${natalSign ? escapeHTML(natalSign) : "Add a birthday"}</h2><p class="muted">${natalSign ? "Calculated from the birth date saved on this device." : "Your birthday is optional and used only for this for-fun section."}</p><button class="button button-secondary button-small" data-page="settings">${natalSign ? "Change birthday" : "Add birthday"}</button></article>
      </div>
    </section>
  `;
}

function renderWellness() {
  const record = state.wellness[wellnessDate] ?? {};
  const editingMeal = record.meals?.find((meal) => meal.id === editingMealId);
  if (editingMealId && !editingMeal) editingMealId = null;
  const latestMood = Object.entries(state.wellness)
    .filter(([, entry]) => entry.mood)
    .sort(([first], [second]) => second.localeCompare(first))[0];
  const recentMeals = Object.entries(state.wellness)
    .filter(([, entry]) => entry.meals?.length)
    .sort(([first], [second]) => second.localeCompare(first))
    .slice(0, 3);

  return `
    <section class="page-heading"><div><p class="eyebrow">GENTLE CARE FOR EVERY DAY</p><h1>Your wellness,<br><em>your way.</em></h1></div><span class="heading-flower" aria-hidden="true">♡</span></section>
    <div class="wellness-privacy"><strong>Your wellness notes stay on this device.</strong> Mood, food, and journal entries are private in this browser and included in your data export. This page is for reflection, not diagnosis or treatment.</div>
    <section class="wellness-date-bar"><div><p class="eyebrow">DAILY CHECK-IN</p><label class="field-label" for="wellness-date">Choose a day</label><input id="wellness-date" type="date" max="${today}" value="${escapeHTML(wellnessDate)}"></div><span class="wellness-date-context">${escapeHTML(formatDate(wellnessDate, { weekday: "long", month: "long", day: "numeric" }))}</span></section>

    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">MOOD TRACKER</p><h2>How are you feeling?</h2></div><span class="chart-unit">${latestMood ? `Last note · ${escapeHTML(formatDate(latestMood[0], { month: "short", day: "numeric" }))}` : "No pressure to log"}</span></div>
      <article class="card wellness-card">
        <p class="muted">A mood is a moment, not a diagnosis. Choose the word that fits—or skip it.</p>
        <form id="mood-form">
          <label class="field-label" for="mood-select">Mood on this day</label>
          <select id="mood-select" name="mood"><option value="">Prefer not to say</option>${MOODS.map(({ value, label }) => `<option value="${value}" ${record.mood === value ? "selected" : ""}>${escapeHTML(label)}</option>`).join("")}</select>
          <label class="field-label" for="mood-note">Anything you'd like to remember? <span class="muted">(optional)</span></label>
          <textarea id="mood-note" name="moodNote" maxlength="300" rows="2" placeholder="A few private words for yourself">${escapeHTML(record.moodNote ?? "")}</textarea>
          <div class="form-actions"><button type="submit" class="button button-primary">Save mood</button>${record.mood || record.moodNote ? '<button type="button" class="button button-danger" data-action="delete-mood">Delete mood note</button>' : ""}</div>
        </form>
      </article>
    </section>

    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">FOOD NOTES · NO CALORIE COUNTING</p><h2>What did you eat?</h2></div><span class="chart-unit">${record.meals?.length ?? 0} notes today</span></div>
      <article class="card wellness-card">
        <p class="muted">Note meals or snacks if it helps you notice patterns. Foods are not “good” or “bad,” and logging is always optional.</p>
        <form id="meal-form">
          <label class="field-label" for="meal-category">Meal or snack</label>
          <select id="meal-category" name="category" required>${MEAL_CATEGORIES.map((category) => `<option value="${category}" ${editingMeal?.category === category ? "selected" : ""}>${category}</option>`).join("")}</select>
          <label class="field-label" for="meal-note">Food or drink</label>
          <textarea id="meal-note" name="note" maxlength="240" rows="2" required placeholder="A simple note; portions and calories aren't needed">${escapeHTML(editingMeal?.note ?? "")}</textarea>
          <div class="form-actions"><button type="submit" class="button button-primary">${editingMeal ? "Update meal note" : "Save meal note"}</button>${editingMeal ? '<button type="button" class="button button-secondary" data-action="edit-meal-cancel">Cancel edit</button>' : ""}</div>
        </form>
        ${renderMealList(record)}
      </article>
      ${renderRecentMealDays(recentMeals)}
    </section>

    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">GENTLE SELF-HELP</p><h2>Therapy-inspired tools</h2></div></div>
      <p class="field-hint">These are optional self-reflection exercises, not therapy, diagnosis, or a replacement for a mental-health professional. Stop if an exercise feels uncomfortable.</p>
      <div class="wellness-tool-grid">
        <details class="card wellness-tool"><summary><span class="tool-symbol" aria-hidden="true">✳</span><strong>Ground yourself with your senses</strong><span class="muted">A gentle 5–4–3–2–1 check-in</span></summary><ol><li>Name 5 things you can see.</li><li>Notice 4 things you can feel, like your feet on the floor.</li><li>Listen for 3 sounds.</li><li>Notice 2 scents, or name 2 scents you enjoy.</li><li>Name 1 taste, or take one comfortable breath.</li></ol><p class="field-hint">You can skip, pause, or open your eyes at any time.</p></details>
        <details class="card wellness-tool"><summary><span class="tool-symbol" aria-hidden="true">♡</span><strong>Make space for a feeling</strong><span class="muted">Name it without judging yourself</span></summary><p>Try finishing these sentences in your journal: “Right now I notice…”, “It makes sense that I feel this because…”, and “One kind, small thing I can do next is…”</p><p class="field-hint">You do not have to solve everything in one sitting.</p></details>
        <details class="card wellness-tool"><summary><span class="tool-symbol" aria-hidden="true">◷</span><strong>A slower breathing pause</strong><span class="muted">Only if comfortable for you</span></summary><p>Let your breathing stay natural. If it feels comfortable, let the out-breath be a little longer than the in-breath for a few rounds. Do not hold your breath or force a count. Stop if you feel dizzy or uneasy.</p></details>
      </div>
      <article class="card journal-card"><p class="eyebrow">PRIVATE JOURNAL · ${escapeHTML(formatDate(wellnessDate, { month: "short", day: "numeric" }))}</p><h3>One thought at a time</h3><p class="muted">What feels important today? What might you say to a friend feeling this way?</p><form id="journal-form"><label class="field-label" for="wellness-journal">Your private reflection</label><textarea id="wellness-journal" name="journal" maxlength="1200" rows="4" placeholder="Write only what feels comfortable. This stays in this browser.">${escapeHTML(record.journal ?? "")}</textarea><div class="form-actions"><button type="submit" class="button button-primary">Save reflection</button>${record.journal ? '<button type="button" class="button button-danger" data-action="clear-journal">Clear reflection</button>' : ""}</div></form></article>
      <p class="field-hint safety-inline">If difficult feelings are lasting, affecting daily life, or feel unsafe, consider talking with a trusted person or qualified mental-health professional. If there is immediate danger, contact your local emergency service.</p>
    </section>

    <section class="section-block bible-section"><div class="section-heading"><div><p class="eyebrow">OPTIONAL CHRISTIAN REFLECTION</p><h2>A moment with the Bible</h2></div><span class="heading-flower" aria-hidden="true">✧</span></div>
      <p class="muted">These gentle reading prompts are optional. Faith is personal; scripture is not medical treatment, and prayer does not replace healthcare.</p>
      <div class="bible-grid">
        <article class="card bible-card"><span class="eyebrow">A READING FOR HARD MOMENTS</span><h3>Psalm 46:1</h3><p>Read the verse slowly. Reflect on the idea of seeking comfort and support when life feels unsettled.</p><span class="field-hint">Prompt: What helps you feel supported today?</span></article>
        <article class="card bible-card"><span class="eyebrow">A READING ABOUT REST</span><h3>Matthew 11:28–30</h3><p>Consider the invitation to bring your tiredness honestly and make room for rest.</p><span class="field-hint">Prompt: What expectation could you set down for today?</span></article>
        <article class="card bible-card"><span class="eyebrow">A READING FOR WISDOM</span><h3>James 1:5</h3><p>Read and reflect on asking for wisdom when you need help deciding what to do next.</p><span class="field-hint">Prompt: Who is a safe, wise person you can ask for support?</span></article>
      </div>
    </section>

    <section class="section-block"><div class="section-heading"><div><p class="eyebrow">BODY BASICS</p><h2>How the systems work</h2></div></div>
      <div class="education-grid">
        <details class="card education-card"><summary>Brain, hormones, and the cycle</summary><p>The brain and ovaries communicate using hormones. These signals help an egg mature and can lead to ovulation. After ovulation, hormone levels shift. If pregnancy does not occur, the uterine lining sheds as menstrual bleeding. The timing varies between people and from cycle to cycle.</p></details>
        <details class="card education-card"><summary>Uterus, ovaries, and the uterine lining</summary><p>The ovaries contain eggs and make hormones. The uterus is a muscular organ whose lining usually builds up and then sheds during a period. The vagina connects the uterus to the outside of the body. The vulva is the external genital area. These are different body parts with different functions.</p></details>
        <details class="card education-card"><summary>PCOS and the whole body</summary><p>Polycystic ovary syndrome (PCOS) is a hormone-related condition that can affect ovulation and may be associated with skin or hair changes and how the body manages blood sugar. Experiences differ. An ultrasound or one symptom alone cannot diagnose PCOS; a healthcare professional assesses the full picture.</p></details>
        <details class="card education-card"><summary>Hygiene without shame</summary><p>Wash the vulva externally with water or a gentle, unscented cleanser if you prefer. The vagina cleans itself; douching and scented internal products can irritate it. Wash your hands before and after changing a period product. Follow that product’s instructions, change it regularly, and choose what feels comfortable.</p></details>
      </div>
      <article class="card pcos-tips"><p class="eyebrow">DAY-TO-DAY TIPS FOR LIVING WITH PCOS</p><h3>Small, realistic steps</h3><ul><li>Consider tracking periods or symptoms if it helps you prepare for a clinician visit; you do not need perfect records.</li><li>Choose regular, satisfying meals and snacks that work for your life, preferences, culture, and budget. No single “PCOS diet” is right for everyone.</li><li>Move in ways that feel enjoyable or accessible. Rest also matters.</li><li>Protect sleep where you can and ask your clinician about symptoms that are changing or worrying you.</li><li>Ask a healthcare professional about treatment options tailored to your goals. Supplements and restrictive diets are not a substitute for medical advice.</li></ul><p class="field-hint">These are general ideas, not a PCOS treatment plan. Wura's Petal cannot diagnose PCOS.</p></article>
    </section>
  `;
}

function renderMealList(record) {
  if (!record.meals?.length) return '<div class="empty-state"><span class="empty-flower" aria-hidden="true">♡</span><p>No food notes for this day.</p><span class="muted">Add a meal or snack note if useful.</span></div>';
  return `<div class="meal-list">${record.meals.map((meal) => `<div class="meal-row"><div><span class="eyebrow">${escapeHTML(meal.category)}</span><p>${escapeHTML(meal.note)}</p></div><div class="meal-actions"><button type="button" class="text-button" data-action="edit-meal" data-meal-id="${escapeHTML(meal.id)}">Edit</button><button type="button" class="text-button meal-delete" data-action="delete-meal" data-meal-id="${escapeHTML(meal.id)}" aria-label="Delete ${escapeHTML(meal.category)} note">Delete</button></div></div>`).join("")}</div>`;
}

function renderRecentMealDays(records) {
  if (!records.length) return "";
  return `<div class="recent-wellness-days"><p class="eyebrow">RECENT FOOD NOTES</p>${records.map(([date, record]) => `<button type="button" class="recent-day-button" data-wellness-date="${date}"><span>${escapeHTML(formatDate(date, { month: "short", day: "numeric" }))}</span><span>${record.meals.length} note${record.meals.length === 1 ? "" : "s"}</span></button>`).join("")}</div>`;
}

function wellnessSummary(record) {
  if (!record) return "";
  const pieces = [];
  if (record.mood) pieces.push(`<span class="tag wellness-tag">Mood · ${escapeHTML(moodLabel(record.mood))}</span>`);
  if (record.meals?.length) pieces.push(`<span class="tag wellness-tag">Food · ${record.meals.length} note${record.meals.length === 1 ? "" : "s"}</span>`);
  if (record.journal) pieces.push('<span class="tag wellness-tag">Private journal note</span>');
  return pieces.length ? `<div class="tag-list calendar-wellness-summary">${pieces.join("")}</div>` : "";
}

function saveMood(form) {
  const formData = new FormData(form);
  const mood = formData.get("mood");
  const note = String(formData.get("moodNote") ?? "").trim();
  if (mood && !isMood(mood)) return showNotice("Choose a mood from the list.");
  if (note.length > 300) return showNotice("Keep your mood note under 300 characters.");
  const record = state.wellness[wellnessDate] ?? {};
  if (mood) record.mood = mood;
  else delete record.mood;
  if (note) record.moodNote = note;
  else delete record.moodNote;
  updateWellnessDate(wellnessDate, record);
  persistAndRender();
  showNotice("Your mood note was saved on this device.");
}

function saveMeal(form) {
  const formData = new FormData(form);
  const category = formData.get("category");
  const note = String(formData.get("note") ?? "").trim();
  if (!isMealCategory(category)) return showNotice("Choose a meal or snack from the list.");
  if (note.length > 240) return showNotice("Keep a food note under 240 characters.");
  if (!note) return showNotice("Add a short food or drink note before saving.");
  const record = state.wellness[wellnessDate] ?? {};
  const meals = [...(record.meals ?? [])];
  if (editingMealId) {
    const index = meals.findIndex((meal) => meal.id === editingMealId);
    if (index < 0) return showNotice("That food note could not be found. Please choose it again.");
    meals[index] = { ...meals[index], category, note };
  } else {
    if (meals.length >= 50) return showNotice("You can save up to 50 food notes per day.");
    meals.push({ id: crypto.randomUUID(), category, note });
  }
  record.meals = meals.slice(-50);
  updateWellnessDate(wellnessDate, record);
  editingMealId = null;
  persistAndRender();
  showNotice("Your food note was saved on this device.");
}

function saveJournal(form) {
  const note = String(new FormData(form).get("journal") ?? "").trim();
  if (note.length > 1200) return showNotice("Keep your reflection under 1,200 characters.");
  const record = state.wellness[wellnessDate] ?? {};
  if (note) record.journal = note;
  else delete record.journal;
  updateWellnessDate(wellnessDate, record);
  persistAndRender();
  showNotice(note ? "Your reflection was saved on this device." : "Your empty reflection was cleared.");
}

function updateWellnessDate(date, record) {
  if (Object.keys(record).length) state.wellness[date] = record;
  else delete state.wellness[date];
}

function deleteMood() {
  const record = state.wellness[wellnessDate];
  if (!record) return;
  delete record.mood;
  delete record.moodNote;
  updateWellnessDate(wellnessDate, record);
  persistAndRender();
}

function deleteMeal(mealId) {
  const record = state.wellness[wellnessDate];
  if (!record?.meals?.some((meal) => meal.id === mealId)) return;
  if (!window.confirm("Delete this food note?")) return;
  record.meals = record.meals.filter((meal) => meal.id !== mealId);
  updateWellnessDate(wellnessDate, record);
  editingMealId = null;
  persistAndRender();
}

function clearJournal() {
  const record = state.wellness[wellnessDate];
  if (!record?.journal) return;
  if (!window.confirm("Clear this private journal reflection?")) return;
  delete record.journal;
  updateWellnessDate(wellnessDate, record);
  persistAndRender();
}

function moodLabel(value) {
  return MOODS.find((mood) => mood.value === value)?.label ?? "Mood note";
}

function renderSettings() {
  return `
    <section class="page-heading"><div><p class="eyebrow">YOUR DEVICE, YOUR CHOICE</p><h1>Settings &<br><em>your privacy.</em></h1></div><span class="heading-flower" aria-hidden="true">✿</span></section>
    <section class="settings-grid">
      <article class="card settings-card"><p class="eyebrow">APPEARANCE</p><h2>Choose your colors</h2><label class="field-label" for="theme-select">Theme</label><select id="theme-select"><option value="system" ${state.theme === "system" ? "selected" : ""}>Match my device</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option></select></article>
      <article class="card settings-card"><p class="eyebrow">JUST FOR FUN</p><h2>Birthday</h2><p class="muted">Optional. Used only to show your sun sign in the entertainment section.</p><label class="field-label" for="birth-date">Birth date</label><input id="birth-date" type="date" max="${today}" value="${escapeHTML(state.birthDate ?? "")}"><p class="field-hint">This is not used for health calculations.</p></article>
      <article class="card settings-card privacy-card"><p class="eyebrow">YOUR DATA</p><h2>Private, right here</h2><p>Period, symptom, mood, food, and journal entries stay in this browser. Wura's Petal does not send your notes or chat over the internet. Model files download from Hugging Face and GitHub; chat runs in your browser and is not saved by Wura's Petal.</p><div class="settings-actions"><button class="button button-secondary" data-action="export-data">Export a JSON copy</button><button class="button button-secondary" data-action="delete-assistant-model">Remove downloaded AI model</button><button class="button button-danger" data-action="delete-all">Delete all tracker data</button></div><p class="field-hint">Removing the AI model frees its downloaded storage; tracker data is kept. Delete all tracker data does not delete the model.</p></article>
      <article class="card settings-card"><p class="eyebrow">HEALTH NOTE</p><h2>When to see a doctor</h2><p>Contact a healthcare professional about cycles shorter than 21 or longer than 35 days, periods longer than 7 days, very heavy bleeding, severe pain, or a missed period.</p><p class="field-hint">This app is not contraception or a medical device. Estimates can be wrong. If you are worried about your health, contact a clinician.</p></article>
    </section>
  `;
}

function renderPhaseSummary(phase, entries, episodes, referenceDate) {
  const info = PHASE_INFO[phase];
  const loggedInPhase = new Set();
  const prediction = predictionForEntries(entries);
  if (prediction.lastEpisode) {
    for (const [date, entry] of Object.entries(entries)) {
      if (entry.symptoms?.length && getCyclePhase(date, entries, prediction) === phase) {
        entry.symptoms.forEach((symptom) => loggedInPhase.add(symptom));
      }
    }
  }
  const pattern = findCommonPattern(entries, episodes);
  const typical = info.typical.length ? `<div class="pattern-row"><span class="eyebrow">COMMONLY REPORTED</span><p>${info.typical.map(escapeHTML).join(" · ")}</p></div>` : `<p class="muted">${escapeHTML(info.care)}</p>`;
  return `<section class="card pattern-card"><div class="section-heading"><div><p class="eyebrow">YOUR PHASE, COMPARED</p><h2>${escapeHTML(info.label)}</h2></div><span class="mini-status">Estimate</span></div>${typical}<div class="pattern-row"><span class="eyebrow">YOU'VE LOGGED IN THIS PHASE</span><p>${loggedInPhase.size ? [...loggedInPhase].map(escapeHTML).join(" · ") : "No symptom notes in this phase yet."}</p></div><p class="field-hint">${escapeHTML(pattern || `Patterns use your period starts and daily symptom notes, not a diagnosis. ${formatDate(referenceDate, { month: "short", day: "numeric" })}.`)}</p></section>`;
}

function renderPhaseGuides(entries, episodes, prediction) {
  const phases = Object.entries(PHASE_INFO).filter(([phase]) => phase !== "unknown");
  return `<div class="phase-guide-grid">${phases.map(([phase, info]) => {
    const logged = new Set();
    for (const [date, entry] of Object.entries(entries)) {
      if (entry.symptoms?.length && getCyclePhase(date, entries, prediction) === phase) {
        entry.symptoms.forEach((symptom) => logged.add(symptom));
      }
    }
    const matches = info.typical.filter((symptom) => logged.has(symptom));
    const comparison = logged.size
      ? `You logged ${[...logged].map(escapeHTML).join(", ")}.${matches.length ? ` This overlaps with ${matches.map(escapeHTML).join(", ")} from the common list.` : " These are different from the common list, and every cycle is different."}`
      : "No symptoms logged for this phase yet.";
    return `<article class="card phase-guide"><span class="eyebrow">${escapeHTML(info.label)} PHASE</span><div class="tag-list">${info.typical.map((symptom) => `<span class="tag ${matches.includes(symptom) ? "tag-match" : ""}">${escapeHTML(symptom)}</span>`).join("")}</div><p class="phase-comparison">${comparison}</p><p class="care-note"><span aria-hidden="true">✳</span> ${escapeHTML(info.care)}</p></article>`;
  }).join("")}</div>`;
}

function getPhaseSummary(phase, entries, episodes, referenceDate) {
  return renderPhaseSummary(phase, entries, episodes, referenceDate);
}

function predictionForEntries(entries) {
  return getPrediction(getPeriodEpisodes(entries));
}

function predictionMarkup(prediction) {
  if (!prediction.nextPeriodRange) return "";
  const cycleText = prediction.averageCycleLength ? `About ${prediction.averageCycleLength} days between periods on average.` : "";
  const confidence = prediction.roughEstimate
    ? "Fewer than 3 period starts logged; this is a rough estimate."
    : prediction.irregular
      ? "Your logged cycle lengths vary, so a date range is more useful than one day."
      : "An estimate from your own logged period starts.";
  return `<p class="forecast-cycle">${escapeHTML(cycleText)}</p><p class="field-hint">${escapeHTML(confidence)}</p>`;
}

function fertilityCard(status, prediction) {
  if (status === "unknown") return `<div class="card fertility-card"><span class="eyebrow">A PERSONAL ESTIMATE</span><h3>More dates make a better estimate</h3><p class="muted">${prediction.averageCycleLength ? "Your window is not estimated for today." : "Log at least two period starts first."} There is no reliably safe day based on this tracker.</p></div>`;
  if (status === "higher") {
    return `<div class="card fertility-card fertility-high"><span class="eyebrow">HIGHER ESTIMATED CHANCE</span><h3>Extra care, if it matters to you</h3><p>Today falls in your predicted fertile window (${escapeHTML(rangeLabel(prediction.fertileWindow))}). Ovulation may shift. Condoms can help protect against pregnancy and STIs; a clinician can talk through contraception options.</p></div>`;
  }
  return `<div class="card fertility-card fertility-low"><span class="eyebrow">LOWER ESTIMATED CHANCE</span><h3>Still not a safe-day guarantee</h3><p>This day is outside your estimated fertile window. The estimate can be wrong and pregnancy is still possible. Use reliable protection if you want to avoid pregnancy.</p></div>`;
}

function entrySummary(entry) {
  if (!entry || (!entry.flow && !entry.symptoms?.length)) return '<div class="empty-state"><span class="empty-flower" aria-hidden="true">✿</span><p>No notes for this day yet.</p><span class="muted">Add a flow level or symptoms whenever you like.</span></div>';
  const flow = entry.flow ? `<span class="tag flow-tag">Flow · ${escapeHTML(entry.flow)}</span>` : "";
  const symptoms = (entry.symptoms ?? []).map((symptom) => `<span class="tag">${escapeHTML(symptom)}</span>`).join("");
  return `<div class="tag-list">${flow}${symptoms || (!flow ? '<span class="muted">No symptoms logged.</span>' : "")}</div>`;
}

function renderChart(rows, title) {
  if (!rows.length) return '<div class="empty-state chart-empty"><span class="empty-flower" aria-hidden="true">⌁</span><p>Nothing to chart yet.</p><span class="muted">Add period dates to start a personal history.</span></div>';
  const width = 620;
  const height = 220;
  const pad = { top: 24, right: 24, bottom: 42, left: 36 };
  const values = rows.map((row) => row.value);
  const min = Math.max(0, Math.min(...values) - 2);
  const max = Math.max(...values) + 2;
  const range = Math.max(1, max - min);
  const x = (index) => rows.length === 1 ? width / 2 : pad.left + index * (width - pad.left - pad.right) / (rows.length - 1);
  const y = (value) => pad.top + (max - value) * (height - pad.top - pad.bottom) / range;
  const points = rows.map((row, index) => `${x(index)},${y(row.value)}`).join(" ");
  const grid = [0, 1, 2, 3].map((index) => {
    const lineY = pad.top + index * (height - pad.top - pad.bottom) / 3;
    return `<line x1="${pad.left}" y1="${lineY}" x2="${width - pad.right}" y2="${lineY}" class="chart-gridline"/>`;
  }).join("");
  const marks = rows.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.value)}" r="5" class="chart-point"><title>${escapeHTML(row.label)}: ${row.value} days · ${escapeHTML(formatDate(row.date))}</title></circle>`).join("");
  const labels = rows.map((row, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="chart-label">${escapeHTML(formatDate(row.date, { month: "short", day: "numeric" }))}</text>`).join("");
  return `<div class="chart-scroll"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(title)}">${grid}<polyline points="${points}" class="chart-line"/>${marks}${labels}</svg></div><div class="chart-values">${rows.map((row) => `<span>${escapeHTML(formatDate(row.date, { month: "short", day: "numeric" }))} · <strong>${row.value} d</strong></span>`).join("")}</div>`;
}

function renderSymptomBars(items) {
  if (!items.length) return '<div class="empty-state chart-empty"><span class="empty-flower" aria-hidden="true">✿</span><p>No symptom notes yet.</p><span class="muted">Your most logged symptoms will appear here.</span></div>';
  const maximum = Math.max(...items.map((item) => item.value));
  return `<div class="symptom-bars">${items.map((item) => `<div class="symptom-bar-row"><span>${escapeHTML(item.label)}</span><div class="bar-track" role="img" aria-label="${escapeHTML(item.label)}: ${item.value} logged"><span style="width:${Math.max(8, item.value / maximum * 100)}%"></span></div><strong>${item.value}</strong></div>`).join("")}</div>`;
}

function renderAssistant() {
  return `
    <details class="assistant-panel">
      <summary>
        <div class="assistant-heading"><p class="eyebrow">OPTIONAL · LOCAL AI</p><h2>Ask your cycle guide</h2><p class="field-hint">General period information, powered by a model on your device.</p></div>
        <span class="local-badge">On this device</span>
      </summary>
      <div class="assistant-content">
        <p class="assistant-privacy"><strong>Not a medical specialist.</strong> Replies are general information, not medical advice or a diagnosis. Questions and optional cycle data run only in this browser. Model files download from Hugging Face and GitHub once per device; they do not contain or receive your health data. Do not share identifying details.</p>
          <form id="assistant-form">
          <div class="assistant-model-row">
            <div><span class="field-label">On-device model</span><p class="assistant-model-help">Qwen 2.5 0.5B · browser WebGPU · no account or API key</p></div>
            <button type="button" class="button button-secondary button-small" data-action="load-assistant-model" id="assistant-load"${assistantBusy ? " disabled" : ""}>${assistantEngine ? "Model ready" : "Load offline model"}</button>
          </div>
          <label class="assistant-context-choice" for="include-cycle-context">
            <input id="include-cycle-context" name="includeCycleContext" type="checkbox">
            <span><strong>Include my saved cycle data with this question</strong><small>Uses your logged period dates, daily flow, symptoms, and cycle estimates for this local reply only. Uncheck any time. Your notes never leave the device.</small></span>
          </label>
          <div id="assistant-messages" class="assistant-messages" role="log" aria-live="polite" aria-relevant="additions text">${renderAssistantMessages()}</div>
          <label class="field-label" for="assistant-input">Ask a general period question</label>
          <div class="assistant-input-row">
            <textarea id="assistant-input" name="message" rows="3" maxlength="1200" placeholder="For example: What is the follicular phase?" required></textarea>
            <button id="assistant-submit" type="submit" class="button button-primary"${assistantBusy ? " disabled" : ""}>${assistantBusy ? "Thinking…" : "Send"}</button>
          </div>
          <p id="assistant-status" class="assistant-status" role="status">${escapeHTML(assistantStatus)}</p>
        </form>
      </div>
    </details>
  `;
}

function renderAssistantMessages() {
  if (!assistantMessages.length) return '<p class="assistant-empty">Your conversation will appear here. Saved cycle data is never included unless you explicitly check the box above.</p>';
  return assistantMessages.map(({ role, content }) => `
    <article class="chat-message chat-message-${role === "user" ? "user" : "assistant"}">
      <p class="eyebrow">${role === "user" ? "YOU" : "LOCAL CYCLE GUIDE"}</p>
      <p>${escapeHTML(content)}</p>
    </article>
  `).join("");
}

async function sendAssistantMessage(form) {
  const input = form.querySelector("#assistant-input");
  const message = input.value.trim();
  const includeCycleContext = form.querySelector("#include-cycle-context").checked;
  if (!message) return input.focus();
  if (message.length > 1200) return showNotice("Keep your question under 1,200 characters.");
  if (assistantBusy) return;

  const cycleContext = includeCycleContext ? buildCycleContext() : null;
  assistantMessages.push({ role: "user", content: message });
  if (assistantMessages.length > 20) assistantMessages.splice(0, assistantMessages.length - 20);
  assistantBusy = true;
  assistantStatus = "Preparing the local model…";
  input.value = "";
  updateAssistantPanel();

  try {
    const engine = await getAssistantEngine();
    assistantStatus = "Writing a private reply on this device…";
    updateAssistantPanel();
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
        ...(cycleContext ? [{ role: "system", content: cycleContext }] : []),
        ...assistantMessages.slice(-12),
      ],
      max_tokens: 260,
      temperature: 0.4,
    });
    const answer = response.choices[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("The local model returned an empty reply.");
    assistantMessages.push({ role: "assistant", content: answer.trim() });
    if (assistantMessages.length > 20) assistantMessages.splice(0, assistantMessages.length - 20);
    assistantStatus = "Reply generated on this device. AI health information can be wrong; ask a clinician about personal concerns.";
  } catch (error) {
    console.error("Could not complete the on-device model request.", error);
    assistantMessages.push({ role: "assistant", content: assistantErrorMessage(error) });
    assistantStatus = assistantErrorMessage(error);
  } finally {
    assistantBusy = false;
    updateAssistantPanel();
  }
}

async function loadAssistantModel() {
  if (assistantBusy) return;
  assistantBusy = true;
  updateAssistantPanel();
  try {
    await getAssistantEngine();
    assistantStatus = "Model ready. Its downloaded files are cached on this device for offline use.";
  } catch (error) {
    console.error("Could not load the on-device assistant model.", error);
    assistantStatus = assistantErrorMessage(error);
  } finally {
    assistantBusy = false;
    updateAssistantPanel();
  }
}

async function deleteAssistantModel() {
  if (!window.confirm("Remove the downloaded AI model from this browser? Your period and symptom data will stay saved.")) return;
  try {
    if (assistantEngine) {
      await assistantEngine.unload();
      assistantEngine = null;
    }
    assistantWorker?.terminate();
    assistantWorker = null;
    const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
    await deleteModelAllInfoInCache(ASSISTANT_MODEL);
    assistantStatus = "Downloaded AI model removed. Load it again while online to use offline chat.";
    showNotice("The downloaded AI model was removed. Your cycle data is unchanged.");
  } catch (error) {
    console.error("Could not remove the downloaded AI model.", error);
    assistantStatus = `Could not remove the downloaded model: ${error.message}`;
    showNotice(assistantStatus);
  }
  render();
}

function getAssistantEngine() {
  if (assistantEngine) return Promise.resolve(assistantEngine);
  if (assistantLoadPromise) return assistantLoadPromise;

  if (!window.isSecureContext) return Promise.reject(new Error("secure_context"));
  if (!navigator.gpu) return Promise.reject(new Error("webgpu_unavailable"));

  assistantLoadPromise = (async () => {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    assistantWorker = new Worker(new URL("./assistant-worker.js", import.meta.url), {
      type: "module",
      name: "petal-private-cycle-guide",
    });
    try {
      assistantEngine = await CreateWebWorkerMLCEngine(
        assistantWorker,
        ASSISTANT_MODEL,
        {
          initProgressCallback(progress) {
            assistantStatus = progress.text || "Preparing the on-device model…";
            updateAssistantPanel();
          },
        },
      );
      try {
        await navigator.storage?.persist?.();
      } catch (error) {
        console.info("The browser did not grant persistent storage for the model cache.", error);
      }
      return assistantEngine;
    } catch (error) {
      assistantWorker.terminate();
      assistantWorker = null;
      throw error;
    }
  })().finally(() => {
    assistantLoadPromise = null;
  });
  return assistantLoadPromise;
}

function buildCycleContext() {
  const episodes = getPeriodEpisodes(state.entries);
  const prediction = getPrediction(episodes);
  const dailyNotes = Object.entries(state.entries)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, entry]) => {
      const details = [];
      if (entry.flow) details.push(`flow: ${entry.flow}`);
      if (entry.symptoms?.length) details.push(`symptoms: ${entry.symptoms.join(", ")}`);
      return `${date}: ${details.join("; ")}`;
    });
  const periodHistory = episodes.length
    ? episodes.map((episode) => `${episode.startDate} through ${episode.endDate} (${episode.length} days)`).join("\n")
    : "No period days logged.";
  const cycleEstimate = prediction.averageCycleLength
    ? `Average cycle: ${prediction.averageCycleLength} days. Average period: ${prediction.averagePeriodLength === null ? "unknown" : `${round1(prediction.averagePeriodLength)} days`}.`
    : "Not enough period-start history to estimate cycle length.";
  const nextEstimate = prediction.nextPeriodRange
    ? `Estimated next period: ${rangeLabel(prediction.nextPeriodRange)}. Estimated fertile window: ${rangeLabel(prediction.fertileWindow)}. These are uncertain estimates, not contraception.`
    : "No next-period or fertile-window estimate is available.";
  return [
    "The user explicitly opted to include their saved cycle notes for this request. This private health data is user-provided context, not a medical record or diagnosis. Treat it as sensitive and do not infer missing facts.",
    `Cycle summary: ${cycleEstimate} ${prediction.roughEstimate ? "Predictions are rough because fewer than three completed cycle lengths are logged." : ""}`,
    nextEstimate,
    `Logged period history:\n${periodHistory}`,
    `Daily flow and symptom notes:\n${dailyNotes.length ? dailyNotes.join("\n") : "No daily flow or symptom notes logged."}`,
    "Use this context only to answer the user's question with general educational information. Do not diagnose or give contraception guarantees.",
  ].join("\n\n");
}

function assistantErrorMessage(error) {
  if (error.message === "secure_context") return "This model needs a secure page. Use HTTPS on Vercel or GitHub Pages, or localhost when testing.";
  if (error.message === "webgpu_unavailable") return "This browser or device does not support WebGPU, so it cannot run the on-device model. Period tracking still works.";
  if (error.name === "TypeError" && !navigator.onLine) return "The model is not cached yet and this device is offline. Connect once to download it, then use it offline.";
  if (error.name === "QuotaExceededError") return "This device does not have enough browser storage for the model. Free space and try again.";
  return `The local assistant could not reply: ${error.message}`;
}

function updateAssistantPanel() {
  const messages = document.querySelector("#assistant-messages");
  if (!messages) return;
  messages.innerHTML = renderAssistantMessages();
  messages.scrollTop = messages.scrollHeight;
  const input = document.querySelector("#assistant-input");
  const submit = document.querySelector("#assistant-submit");
  const loadButton = document.querySelector("#assistant-load");
  const status = document.querySelector("#assistant-status");
  if (input) input.disabled = assistantBusy;
  const contextToggle = document.querySelector("#include-cycle-context");
  if (contextToggle) contextToggle.disabled = assistantBusy;
  if (submit) {
    submit.disabled = assistantBusy;
    submit.textContent = assistantBusy ? "Thinking…" : "Send";
  }
  if (loadButton) {
    loadButton.disabled = assistantBusy || Boolean(assistantEngine);
    loadButton.textContent = assistantEngine ? "Model ready" : assistantBusy ? "Loading…" : "Load offline model";
  }
  if (status) status.textContent = assistantStatus;
}

function findCommonPattern(entries, episodes) {
  if (episodes.length < 2) return "Log another period or symptom to start noticing simple patterns.";
  const counts = new Map();
  for (const [date, entry] of Object.entries(entries)) {
    if (!entry.symptoms?.length) continue;
    const episode = [...episodes].reverse().find((item) => item.startDate <= date);
    if (!episode) continue;
    const day = daysBetween(episode.startDate, date) + 1;
    if (day < 1 || day > 14) continue;
    for (const symptom of entry.symptoms) {
      const key = `${symptom}|${day}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const [key, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!key || count < 2) return "No repeated early-cycle symptom pattern yet. Keep logging only if it feels useful.";
  const [symptom, day] = key.split("|");
  return `You've logged ${symptom.toLowerCase()} on cycle day ${day} in ${count} notes. This is a simple observation, not a health rule.`;
}

function phaseComparison(typical, logged) {
  const match = logged.filter((symptom) => typical.includes(symptom));
  return match.length
    ? `Your notes overlap with common reports: ${match.join(", ")}. Everyone's experience is different.`
    : "Your logged symptoms do not match this phase's common list; both are completely okay.";
}

function openDayDialog(date) {
  if (!isValidDateKey(date)) return showNotice("Choose a real calendar date.");
  selectedDate = date;
  const entry = state.entries[date];
  editingDate = entry ? date : null;
  dayForm.reset();
  dayForm.querySelector("#day-date").value = date;
  dayForm.querySelector("#day-flow").value = entry?.flow ?? "";
  dayForm.querySelector("#day-form-title").textContent = entry ? "Edit this day" : "Log a day";
  dayForm.querySelector("#delete-day-button").hidden = !entry;
  dayForm.querySelector("#symptom-options").innerHTML = SYMPTOMS.map((symptom, index) => {
    const id = `symptom-${index}`;
    return `<label class="symptom-choice" for="${id}"><input id="${id}" type="checkbox" name="symptoms" value="${escapeHTML(symptom)}" ${entry?.symptoms?.includes(symptom) ? "checked" : ""}><span>${escapeHTML(symptom)}</span></label>`;
  }).join("");
  dayDialog.showModal();
}

function openPeriodDialog(date) {
  periodForm.reset();
  periodForm.querySelector("#period-start").value = date;
  periodForm.querySelector("#period-end").value = date;
  periodDialog.showModal();
}

function deleteSelectedDay() {
  const date = editingDate ?? dayForm.querySelector("#day-date").value;
  if (!state.entries[date]) return dayDialog.close();
  if (!window.confirm(`Delete your entry for ${formatDate(date)}?`)) return;
  delete state.entries[date];
  editingDate = null;
  selectedDate = date;
  persistAndRender();
  dayDialog.close();
}

function changeMonth(offset) {
  visibleMonth = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + offset, 1));
  selectedDate = dateKey(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1)));
  render();
}

function persistAndRender() {
  saveState();
  render();
}

function readState() {
  const base = { version: 1, entries: {}, wellness: {}, birthDate: "", theme: "system" };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return base;
    const parsed = JSON.parse(saved);
    if (parsed?.version !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) {
      throw new Error("The saved data format is not recognized.");
    }
    const entries = {};
    for (const [date, entry] of Object.entries(parsed.entries)) {
      if (!isValidDateKey(date) || !entry || typeof entry !== "object") continue;
      const flow = ["light", "medium", "heavy"].includes(entry.flow) ? entry.flow : "";
      const symptoms = Array.isArray(entry.symptoms) ? [...new Set(entry.symptoms.filter((symptom) => SYMPTOMS.includes(symptom)))] : [];
      if (flow || symptoms.length) entries[date] = { ...(flow ? { flow } : {}), symptoms };
    }
    return {
      version: 1,
      entries,
      wellness: normalizeWellnessLog(parsed.wellness, isValidDateKey),
      birthDate: isValidDateKey(parsed.birthDate) && parsed.birthDate <= today ? parsed.birthDate : "",
      theme: ["system", "light", "dark"].includes(parsed.theme) ? parsed.theme : "system",
    };
  } catch (error) {
    console.error("Could not read Wura's Petal data from this browser.", error);
    queueMicrotask(() => showNotice("Saved data could not be read. It has not been overwritten; export or inspect this browser's storage before saving new changes."));
    return base;
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageNotice.hidden = true;
  } catch (error) {
    console.error("Could not save Wura's Petal data in this browser.", error);
    showNotice("Your change could not be saved in this browser. Check device storage before closing this page.");
  }
}

function exportData() {
  const payload = {
    app: "Wura's Petal cycle tracker",
    formatVersion: state.version,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wuras-petal-data-${today}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showNotice("A copy of your data was downloaded to this device.");
}

function deleteAllData() {
  if (!window.confirm("Delete all period, symptom, mood, food, journal, and birthday data stored by Wura's Petal on this device? This cannot be undone.")) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Could not delete Wura's Petal data from this browser.", error);
    return showNotice("The browser could not remove your saved data. You may need to clear this site's storage in browser settings.");
  }
  state.entries = {};
  state.wellness = {};
  state.birthDate = "";
  state.theme = "system";
  selectedDate = today;
  wellnessDate = today;
  editingMealId = null;
  visibleMonth = monthForDate(today);
  render();
  showNotice("All Wura's Petal data was deleted from this device.");
}

document.addEventListener("change", (event) => {
  if (event.target.id === "wellness-date") {
    const value = event.target.value;
    if (!isValidDateKey(value) || value > today) {
      event.target.value = wellnessDate;
      return showNotice("Choose a real date today or earlier.");
    }
    wellnessDate = value;
    editingMealId = null;
    render();
  } else if (event.target.id === "theme-select") {
    state.theme = event.target.value;
    persistAndRender();
  } else if (event.target.id === "birth-date") {
    const value = event.target.value;
    if (value && (!isValidDateKey(value) || value > today)) {
      event.target.value = state.birthDate;
      return showNotice("Enter a real birth date that is not in the future.");
    }
    state.birthDate = value;
    persistAndRender();
  }
});

function showNotice(message) {
  storageNotice.textContent = message;
  storageNotice.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { storageNotice.hidden = true; }, 7000);
}

function cycleProgress(day, length) {
  return day && day > 0 && length ? Math.min(100, Math.max(3, day / length * 100)) : 3;
}

function rangeLabel(range) {
  if (!range) return "";
  return range.startDate === range.endDate
    ? formatDate(range.startDate, { month: "short", day: "numeric" })
    : `${formatDate(range.startDate, { month: "short", day: "numeric" })} – ${formatDate(range.endDate, { month: "short", day: "numeric" })}`;
}

function monthForDate(date) {
  return new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
}

function dateKeyFromLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
