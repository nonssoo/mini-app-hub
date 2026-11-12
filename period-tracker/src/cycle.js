export const SYMPTOMS = [
  "Cramps",
  "Headache",
  "Bloating",
  "Mood changes",
  "Fatigue",
  "Acne",
  "Back pain",
  "Cravings",
  "Sleep problems",
];

export const PHASE_INFO = {
  menstrual: {
    label: "Menstrual",
    typical: ["Cramps", "Fatigue", "Back pain", "Headache"],
    care: "A warm compress, rest, and water may feel comforting.",
  },
  follicular: {
    label: "Follicular",
    typical: ["Mood changes", "Fatigue", "Acne"],
    care: "Try a gentle walk or a meal that keeps your energy steady.",
  },
  ovulation: {
    label: "Ovulation",
    typical: ["Bloating", "Headache", "Mood changes"],
    care: "Take breaks when you need them and keep up your usual hydration.",
  },
  luteal: {
    label: "Luteal",
    typical: ["Bloating", "Mood changes", "Cravings", "Fatigue", "Acne", "Sleep problems"],
    care: "A regular bedtime and an easy, nourishing snack can help you feel settled.",
  },
  unknown: {
    label: "Not enough data yet",
    typical: [],
    care: "Log period dates to see a personal cycle estimate. Your notes stay on this device.",
  },
};

const DAY_MS = 86_400_000;

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateFromKey(value) {
  if (!isValidDateKey(value)) throw new RangeError("Expected a valid YYYY-MM-DD date.");
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(value, amount) {
  if (!Number.isInteger(amount)) throw new RangeError("The number of days must be a whole number.");
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
}

export function daysBetween(first, second) {
  return Math.round((dateFromKey(second).getTime() - dateFromKey(first).getTime()) / DAY_MS);
}

export function getPeriodEpisodes(entries) {
  const periodDates = Object.keys(entries)
    .filter((key) => isValidDateKey(key) && ["light", "medium", "heavy"].includes(entries[key]?.flow))
    .sort();
  const episodes = [];

  for (const date of periodDates) {
    const last = episodes.at(-1);
    if (!last || daysBetween(last.endDate, date) !== 1) {
      episodes.push({ startDate: date, endDate: date, length: 1 });
    } else {
      last.endDate = date;
      last.length += 1;
    }
  }
  return episodes;
}

export function getCycleStatistics(episodes) {
  const lengths = episodes.slice(1).map((episode, index) => daysBetween(episodes[index].startDate, episode.startDate));
  if (lengths.length === 0) {
    return {
      cycleLengths: [],
      averageCycleLength: null,
      medianCycleLength: null,
      minCycleLength: null,
      maxCycleLength: null,
      irregular: false,
      averagePeriodLength: average(episodes.map((episode) => episode.length)),
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  return {
    cycleLengths: lengths,
    averageCycleLength: Math.round(average(lengths)),
    medianCycleLength: Math.round(median(sorted)),
    minCycleLength: sorted[0],
    maxCycleLength: sorted.at(-1),
    irregular: sorted.at(-1) - sorted[0] > 7 || sorted.some((length) => length < 21 || length > 35),
    averagePeriodLength: average(episodes.map((episode) => episode.length)),
  };
}

export function getPrediction(episodes) {
  const statistics = getCycleStatistics(episodes);
  const lastEpisode = episodes.at(-1) ?? null;
  if (!lastEpisode || statistics.averageCycleLength === null) {
    return { ...statistics, lastEpisode, nextPeriodStart: null, nextPeriodRange: null, ovulationRange: null, fertileWindow: null, loggedCycleCount: episodes.length, roughEstimate: true };
  }

  const predictedStart = addDays(lastEpisode.startDate, statistics.medianCycleLength);
  const nextPeriodRange = statistics.irregular
    ? {
        startDate: addDays(lastEpisode.startDate, statistics.minCycleLength),
        endDate: addDays(lastEpisode.startDate, statistics.maxCycleLength),
      }
    : { startDate: predictedStart, endDate: predictedStart };
  const ovulationRange = {
    startDate: addDays(nextPeriodRange.startDate, -14),
    endDate: addDays(nextPeriodRange.endDate, -14),
  };
  return {
    ...statistics,
    lastEpisode,
    nextPeriodStart: predictedStart,
    nextPeriodRange,
    ovulationRange,
    fertileWindow: {
      startDate: addDays(ovulationRange.startDate, -5),
      endDate: addDays(ovulationRange.endDate, 1),
    },
    loggedCycleCount: statistics.cycleLengths.length,
    roughEstimate: statistics.cycleLengths.length < 3,
  };
}

export function getCyclePhase(date, entries, prediction) {
  if (!isValidDateKey(date) || !prediction.lastEpisode) return "unknown";
  if (["light", "medium", "heavy"].includes(entries[date]?.flow)) return "menstrual";
  if (!prediction.averageCycleLength) return "unknown";

  const episodes = getPeriodEpisodes(entries);
  const episodeIndex = episodes.findLastIndex((episode) => episode.startDate <= date);
  if (episodeIndex < 0) return "unknown";
  const episode = episodes[episodeIndex];
  const nextEpisode = episodes[episodeIndex + 1];
  const cycleLength = nextEpisode
    ? daysBetween(episode.startDate, nextEpisode.startDate)
    : prediction.averageCycleLength;
  const cycleDay = daysBetween(episode.startDate, date) + 1;
  if (cycleDay < 1 || cycleDay >= cycleLength) return "unknown";

  const estimatedPeriodLength = Math.round(prediction.averagePeriodLength ?? 5);
  if (cycleDay <= estimatedPeriodLength) return "menstrual";
  const nextPeriodStart = nextEpisode?.startDate ?? addDays(episode.startDate, cycleLength);
  const ovulationStart = addDays(nextPeriodStart, -15);
  const ovulationEnd = addDays(nextPeriodStart, -13);
  if (date >= ovulationStart && date <= ovulationEnd) return "ovulation";
  return date < ovulationStart ? "follicular" : "luteal";
}

export function getFertilityStatus(date, prediction) {
  if (
    !isValidDateKey(date)
    || !prediction.lastEpisode
    || !prediction.nextPeriodRange
    || !prediction.fertileWindow
    || date < prediction.lastEpisode.startDate
    || date > prediction.nextPeriodRange.endDate
  ) return "unknown";
  return date >= prediction.fertileWindow.startDate && date <= prediction.fertileWindow.endDate
    ? "higher"
    : "lower-estimated";
}

export function formatDate(date, options = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(dateFromKey(date));
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}
