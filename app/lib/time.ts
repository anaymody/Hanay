import type { MealPeriodT } from './schemas';

const TZ = 'America/Los_Angeles';

/** YYYY-MM-DD in America/Los_Angeles. */
export function laDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** Whether the given date falls on Saturday or Sunday in LA timezone. */
export function isWeekend(date: Date = new Date()): boolean {
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(date);
  return dow === 'Sat' || dow === 'Sun';
}

/** Meal periods available for the given date (weekday vs weekend). */
export function mealPeriodsForDate(date: Date = new Date()): MealPeriodT[] {
  return isWeekend(date)
    ? ['brunch', 'dinner']
    : ['breakfast', 'lunch', 'dinner'];
}

/**
 * Active meal period in America/Los_Angeles based on wall-clock hour.
 *
 * Weekday:  breakfast (before 11 AM), lunch (11 AM–5 PM), dinner (5 PM+)
 * Weekend:  brunch (before 1 PM), dinner (1 PM+)
 * All halls close at 10 PM — after that we default to the last period (dinner).
 */
export function currentMealPeriod(date: Date = new Date()): MealPeriodT {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );

  if (isWeekend(date)) {
    if (hour < 13) return 'brunch';
    return 'dinner';
  }

  if (hour < 11) return 'breakfast';
  if (hour < 17) return 'lunch';
  return 'dinner';
}
