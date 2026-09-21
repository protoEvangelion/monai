export function isSameMonth(dateValue: Date | string, viewDate: string) {
  const date = new Date(dateValue);
  const month = new Date(viewDate);
  return (
    date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth()
  );
}

export function getMonthKey(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToViewDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toISOString();
}

export function currentMonthKey() {
  const now = new Date();
  return getMonthKey(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function clampMonthKey(monthKey: string) {
  const current = currentMonthKey();
  return monthKey > current ? current : monthKey;
}

export function centsToDollars(cents: number) {
  return cents / 100;
}

export function shiftMonth(viewDate: string, delta: number) {
  const date = new Date(viewDate);
  return new Date(date.getFullYear(), date.getMonth() + delta, 1).toISOString();
}
