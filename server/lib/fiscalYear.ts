// Fiscal year is labelled by the calendar year in which it STARTS.
// e.g. with fiscalYearStartMonth=4 (April), a date of Feb 2026 falls in
// the fiscal year that started April 2025, so it's labelled FY2025.
export function computeFiscalYear(date: Date, startMonth: number): number {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  return month >= startMonth ? year : year - 1;
}
