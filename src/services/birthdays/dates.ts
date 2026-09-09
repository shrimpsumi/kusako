import { zonedParts } from '../timezone.js';

export interface MonthDay {
  month: number;
  day: number;
}

export interface BirthdayDate extends MonthDay {
  year: number | null;
}

export interface BirthdayEntry extends MonthDay {
  lastFiredYear: number | null;
}

const DATE_PATTERN = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const DAY_MS = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) return year !== null && !isLeapYear(year) ? 28 : 29;
  return MONTH_DAYS[month - 1] ?? 0;
}

export function parseBirthday(input: string): BirthdayDate | null {
  const match = DATE_PATTERN.exec(input.trim());
  if (!match) return null;

  const year = match[1] ? Number(match[1]) : null;
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;

  return { year, month, day };
}

export function candidateDates(now: number): MonthDay[] {
  const dates: MonthDay[] = [];

  for (let offset = -1; offset <= 1; offset += 1) {
    const at = new Date(now + offset * DAY_MS);
    const month = at.getUTCMonth() + 1;
    const day = at.getUTCDate();

    dates.push({ month, day });
    if (month === 2 && day === 28 && !isLeapYear(at.getUTCFullYear())) {
      dates.push({ month: 2, day: 29 });
    }
  }

  return dates;
}

export function birthdayFireYear(
  entry: BirthdayEntry,
  now: number,
  zone: string,
): number | null {
  const parts = zonedParts(now, zone);

  const sameDay = entry.month === parts.month && entry.day === parts.day;
  const leapFallback =
    entry.month === 2 &&
    entry.day === 29 &&
    parts.month === 2 &&
    parts.day === 28 &&
    !isLeapYear(parts.year);

  if (!sameDay && !leapFallback) return null;
  if (entry.lastFiredYear !== null && entry.lastFiredYear >= parts.year) {
    return null;
  }

  return parts.year;
}
