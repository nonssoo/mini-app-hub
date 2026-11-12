export const MOODS = [
  { value: "great", label: "Bright" },
  { value: "good", label: "Good" },
  { value: "okay", label: "Okay" },
  { value: "low", label: "Low" },
  { value: "anxious", label: "Anxious" },
  { value: "irritable", label: "Irritable" },
  { value: "overwhelmed", label: "Overwhelmed" },
];

export const MEAL_CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snack"];

export function isMood(value) {
  return MOODS.some((mood) => mood.value === value);
}

export function isMealCategory(value) {
  return MEAL_CATEGORIES.includes(value);
}

export function normalizeWellnessLog(value, isValidDateKey) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([date, entry]) => isValidDateKey(date) && entry && typeof entry === "object" && !Array.isArray(entry))
      .map(([date, entry]) => {
        const mood = isMood(entry.mood) ? entry.mood : "";
        const moodNote = cleanText(entry.moodNote, 300);
        const journal = cleanText(entry.journal, 1200);
        const meals = Array.isArray(entry.meals)
          ? entry.meals
            .filter((meal) => meal && typeof meal === "object" && isMealCategory(meal.category))
            .slice(-50)
            .map((meal, index) => ({
              id: validId(meal.id) ? meal.id : `${date}-${index}`,
              category: meal.category,
              note: cleanText(meal.note, 240),
            }))
            .filter((meal) => meal.note)
          : [];
        const normalized = {
          ...(mood ? { mood } : {}),
          ...(moodNote ? { moodNote } : {}),
          ...(journal ? { journal } : {}),
          ...(meals.length ? { meals } : {}),
        };
        return [date, normalized];
      })
      .filter(([, entry]) => Object.keys(entry).length > 0),
  );
}

function cleanText(value, maximumLength) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function validId(value) {
  return typeof value === "string" && /^[\w-]{1,100}$/.test(value);
}
