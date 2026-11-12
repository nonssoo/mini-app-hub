const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export function getZodiacSign(dateKey) {
  if (!isValidDateKey(dateKey)) return null;
  const [, month, day] = dateKey.split("-").map(Number);
  const boundaries = [
    [1, 20, "Aquarius"], [2, 19, "Pisces"], [3, 21, "Aries"], [4, 20, "Taurus"],
    [5, 21, "Gemini"], [6, 21, "Cancer"], [7, 23, "Leo"], [8, 23, "Virgo"],
    [9, 23, "Libra"], [10, 23, "Scorpio"], [11, 22, "Sagittarius"], [12, 22, "Capricorn"],
  ];
  const boundary = boundaries.find(([boundaryMonth]) => month === boundaryMonth);
  if (!boundary || day < boundary[1]) return ZODIAC_SIGNS[(month + 8) % 12];
  return boundary[2];
}

export function getMoonSign(dateKey) {
  if (!isValidDateKey(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const julianDays = (Date.UTC(year, month - 1, day, 12) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const meanLongitude = normalizeDegrees(218.316 + 13.176396 * julianDays);
  const elongation = normalizeDegrees(297.850 + 12.190749 * julianDays);
  const solarAnomaly = normalizeDegrees(357.529 + 0.98560028 * julianDays);
  const lunarAnomaly = normalizeDegrees(134.963 + 13.064993 * julianDays);
  const argumentOfLatitude = normalizeDegrees(93.272 + 13.229350 * julianDays);
  const radians = Math.PI / 180;
  const longitude = meanLongitude
    + 6.289 * Math.sin(lunarAnomaly * radians)
    + 1.274 * Math.sin((2 * elongation - lunarAnomaly) * radians)
    + 0.658 * Math.sin(2 * elongation * radians)
    + 0.214 * Math.sin(2 * lunarAnomaly * radians)
    - 0.186 * Math.sin(solarAnomaly * radians)
    - 0.114 * Math.sin(2 * argumentOfLatitude * radians);
  return ZODIAC_SIGNS[Math.floor(normalizeDegrees(longitude) / 30)];
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
