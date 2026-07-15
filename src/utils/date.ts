export const DAY_MS = 24 * 60 * 60 * 1000;

export function atLocalNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function todayLocal(): Date {
  return atLocalNoon(new Date());
}

export function formatDateKey(date: Date): string {
  const local = atLocalNoon(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date: Date, amount: number): Date {
  const result = atLocalNoon(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(atLocalNoon(date));
}

export type WeekStart = 'monday' | 'sunday';

export function weekIndex(date: Date, weekStartsOn: WeekStart): number {
  if (weekStartsOn === 'sunday') return date.getDay();
  return (date.getDay() + 6) % 7;
}

export function getRollingDateKeys(days = 365, endDate = todayLocal()): string[] {
  const start = addDays(endDate, -(days - 1));
  return Array.from({ length: days }, (_, index) => formatDateKey(addDays(start, index)));
}

export type HeatmapCell = {
  date: Date;
  key: string;
  inRange: boolean;
};

export function buildHeatmapWeeks(endDate = todayLocal(), days = 365, weekStartsOn: WeekStart = 'monday'): HeatmapCell[][] {
  const rangeStart = addDays(endDate, -(days - 1));
  const gridStart = addDays(rangeStart, -weekIndex(rangeStart, weekStartsOn));
  const gridEnd = addDays(endDate, 6 - weekIndex(endDate, weekStartsOn));
  const cells: HeatmapCell[] = [];

  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const key = formatDateKey(cursor);
    cells.push({
      date: cursor,
      key,
      inRange: cursor >= rangeStart && cursor <= endDate,
    });
  }

  const weeks: HeatmapCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}
