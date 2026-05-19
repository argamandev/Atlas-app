import { InsiderReport } from './maya'

export interface WatchlistRow {
  user_id: string
  ticker: string
  company_name: string
}

function normalizeHebrew(name: string): string {
  return name
    .trim()
    .replace(/\(בע"מ\)/g, '')
    .replace(/בע"מ/g, '')
    .replace(/בע''מ/g, '')
    .replace(/בעמ/g, '')
    .toLowerCase()
    .trim()
}

export function matchReportsToWatchlist(
  reports: InsiderReport[],
  watchlistRows: WatchlistRow[]
): Array<{ userId: string; report: InsiderReport }> {
  const results: Array<{ userId: string; report: InsiderReport }> = []
  const seen = new Set<string>()

  for (const report of reports) {
    const normalizedReportName = normalizeHebrew(report.companyName)

    for (const row of watchlistRows) {
      const normalizedWatchlistName = normalizeHebrew(row.company_name)

      const nameMatch =
        normalizedReportName.includes(normalizedWatchlistName) ||
        normalizedWatchlistName.includes(normalizedReportName)

      if (nameMatch) {
        const key = `${row.user_id}:${report.reportId}`
        if (!seen.has(key)) {
          seen.add(key)
          results.push({ userId: row.user_id, report })
        }
      }
    }
  }

  return results
}
