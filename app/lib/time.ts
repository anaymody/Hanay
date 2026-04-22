import type { MealPeriodT } from './schemas';
import type { Hall } from './types';

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
 * Weekday:  breakfast (before 11 AM), lunch (11 AM–4 PM), dinner (4 PM+)
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
  if (hour < 16) return 'lunch';
  return 'dinner';
}

/**
 * Parse a time string like "7:00 AM" into minutes since midnight.
 */
function parseTime(timeStr: string): number {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

/**
 * Check if the hall is currently open based on its hours.
 */
export function isHallOpen(hall: Hall, date: Date = new Date()): boolean {
  const now = new Date(date);
  const laTime = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const currentMinutes = laTime.getHours() * 60 + laTime.getMinutes();

  // Halls are closed after 10 PM and before 7:30 AM
  const closeTime = 22 * 60; // 10 PM
  const openTime = 7 * 60 + 30; // 7:30 AM

  if (currentMinutes >= closeTime || currentMinutes < openTime) {
    return false;
  }

  const dayType = isWeekend(date) ? 'weekend' : 'weekday';
  const hours = hall.hours[dayType];
  if (!hours) return false;

  for (const period of Object.values(hours) as string[]) {
    if (!period) continue;
    const parts = period.split('–');
    if (parts.length !== 2) continue;
    let [startStr, endStr] = parts;
    endStr = endStr.trim();
    startStr = startStr.trim();
    
    // If start doesn't have AM/PM, use the one from end
    if (!startStr.includes('AM') && !startStr.includes('PM')) {
      if (endStr.includes('AM')) startStr += ' AM';
      else if (endStr.includes('PM')) startStr += ' PM';
    }
    
    const startMinutes = parseTime(startStr);
    const endMinutes = parseTime(endStr);
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      return true;
    }
  }
  return false;
}
