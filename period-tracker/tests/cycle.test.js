import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  daysBetween,
  getCyclePhase,
  getCycleStatistics,
  getFertilityStatus,
  getPeriodEpisodes,
  getPrediction,
  isValidDateKey,
} from "../src/cycle.js";
import { getMoonSign, getZodiacSign } from "../src/moon.js";
import { normalizeWellnessLog } from "../src/wellness.js";

function entriesForStarts(starts, length = 5) {
  const entries = {};
  for (const start of starts) {
    for (let day = 0; day < length; day += 1) {
      entries[addDays(start, day)] = { flow: day < 2 ? "heavy" : "medium", symptoms: [] };
    }
  }
  return entries;
}

test("validates calendar dates, including leap days", () => {
  assert.equal(isValidDateKey("2024-02-29"), true);
  assert.equal(isValidDateKey("2023-02-29"), false);
  assert.equal(isValidDateKey("2025-13-01"), false);
  assert.equal(isValidDateKey("2025-1-01"), false);
});

test("date helpers cross month and year boundaries", () => {
  assert.equal(addDays("2024-12-31", 1), "2025-01-01");
  assert.equal(daysBetween("2024-12-31", "2025-01-01"), 1);
});

test("groups adjacent period days and leaves gaps between episodes", () => {
  const episodes = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-28"]));
  assert.deepEqual(episodes.map(({ startDate, endDate, length }) => ({ startDate, endDate, length })), [
    { startDate: "2025-01-01", endDate: "2025-01-05", length: 5 },
    { startDate: "2025-01-28", endDate: "2025-02-01", length: 5 },
  ]);
});

test("averages cycle and period lengths and estimates the next cycle", () => {
  const episodes = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-29", "2025-02-26"]));
  const prediction = getPrediction(episodes);
  assert.equal(prediction.averageCycleLength, 28);
  assert.equal(prediction.averagePeriodLength, 5);
  assert.deepEqual(prediction.nextPeriodRange, { startDate: "2025-03-26", endDate: "2025-03-26" });
  assert.equal(prediction.roughEstimate, true);
  assert.equal(prediction.fertileWindow.startDate, "2025-03-07");
});

test("uses a rough confidence note until three cycle lengths are recorded", () => {
  const threeStarts = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-29", "2025-02-26"]));
  const fourStarts = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-29", "2025-02-26", "2025-03-26"]));
  assert.equal(getPrediction(threeStarts).roughEstimate, true);
  assert.equal(getPrediction(fourStarts).roughEstimate, false);
});

test("uses a date range for irregular cycle lengths", () => {
  const episodes = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-25", "2025-03-05", "2025-04-02"]));
  const prediction = getPrediction(episodes);
  assert.equal(prediction.irregular, true);
  assert.deepEqual(prediction.nextPeriodRange, { startDate: "2025-04-26", endDate: "2025-05-11" });
  assert.equal(prediction.nextPeriodStart, "2025-04-30");
});

test("warns that predictions from fewer than three logged periods are rough", () => {
  const episodes = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-29"]));
  assert.equal(getPrediction(episodes).roughEstimate, true);
  assert.equal(getPrediction(getPeriodEpisodes({})).nextPeriodRange, null);
});

test("marks fertile estimates and cycle phases without promising safe days", () => {
  const episodes = getPeriodEpisodes(entriesForStarts(["2025-01-01", "2025-01-29"]));
  const entries = entriesForStarts(["2025-01-01", "2025-01-29"]);
  const prediction = getPrediction(episodes);
  assert.equal(getFertilityStatus("2025-02-08", prediction), "higher");
  assert.equal(getFertilityStatus("2025-02-01", prediction), "lower-estimated");
  assert.equal(getFertilityStatus("2025-03-30", prediction), "unknown");
  assert.equal(getCyclePhase("2025-01-29", entries, prediction), "menstrual");
  assert.equal(getCyclePhase("2025-02-05", entries, prediction), "follicular");
  assert.equal(getCyclePhase("2025-01-15", entries, prediction), "ovulation");
  assert.equal(getCyclePhase("2025-01-20", entries, prediction), "luteal");
});

test("recognizes birth zodiac boundaries and returns valid approximate Moon signs", () => {
  assert.equal(getZodiacSign("2000-03-20"), "Pisces");
  assert.equal(getZodiacSign("2000-03-21"), "Aries");
  assert.equal(getZodiacSign("not-a-date"), null);
  assert.equal(getMoonSign("not-a-date"), null);
  assert.ok([
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ].includes(getMoonSign("2025-01-01")));
});

test("normalizes private wellness notes and drops invalid data", () => {
  const cleaned = normalizeWellnessLog({
    "2025-01-01": {
      mood: "low",
      moodNote: ` ${"m".repeat(305)} `,
      journal: ` ${"j".repeat(1205)} `,
      meals: [
        { id: "meal-1", category: "Breakfast", note: ` ${"f".repeat(250)} ` },
        { id: "invalid id", category: "Lunch", note: "kept with a safe fallback ID" },
        { id: "meal-3", category: "Unknown", note: "invalid category" },
        { id: "meal-4", category: "Dinner", note: "   " },
        null,
      ],
    },
    "2025-02-30": { mood: "good" },
    "2025-01-02": { mood: "not-a-mood", meals: [] },
    "not-a-date": { journal: "invalid date" },
  }, isValidDateKey);

  assert.deepEqual(Object.keys(cleaned), ["2025-01-01"]);
  assert.equal(cleaned["2025-01-01"].mood, "low");
  assert.equal(cleaned["2025-01-01"].moodNote.length, 300);
  assert.equal(cleaned["2025-01-01"].journal.length, 1200);
  assert.deepEqual(cleaned["2025-01-01"].meals, [
    { id: "meal-1", category: "Breakfast", note: "f".repeat(240) },
    { id: "2025-01-01-1", category: "Lunch", note: "kept with a safe fallback ID" },
  ]);
  assert.deepEqual(normalizeWellnessLog([], isValidDateKey), {});
});
