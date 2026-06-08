// Pure helpers for scoring a transcript against the gold. No I/O.

/** Strip everything that is not transcript *words*: speaker headers, [timestamps],
 *  the divider line, markdown headings, punctuation, ניקוד; collapse whitespace. */
export function normalize(text: string): string {
  return text
    // Drop the metadata header (title / quarter / date / "## דברי הנהלה") that precedes the
    // first [timestamp]. Raw IVRIT text has no timestamps, so it is left untouched.
    .replace(/^[\s\S]*?(?=\[\d{2}:\d{2}:\d{2}\])/, '')
    .replace(/\[\d{2}:\d{2}:\d{2}\]/g, ' ')        // [00:00:00]
    .replace(/^#{1,6}.*$/gm, ' ')                   // ## headings
    .replace(/^=+$/gm, ' ')                          // ====== divider
    .replace(/^[^\n:]{1,40}:\s*$/gm, ' ')           // a line that is just "Name:" (speaker header)
    .replace(/[֑-ׇ]/g, '')                // Hebrew ניקוד / cantillation
    .replace(/[.,!?;:"'״׳()\[\]{}<>\-–—…]/g, ' ')   // punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean)
}

/** For each gold token, true if the candidate reproduced it (in order), via LCS backtrace. */
export function lcsGoldMatched(cand: string[], gold: string[]): boolean[] {
  const n = cand.length, m = gold.length
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cand[i] === gold[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])

  const matched = new Array<boolean>(m).fill(false)
  let i = 0, j = 0
  while (i < n && j < m) {
    if (cand[i] === gold[j]) { matched[j] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return matched
}

export interface Score {
  fixed: number; introduced: number; remaining: number
  goldTokens: number; baselineErrors: number; candidateErrors: number
  errorRateBaseline: number; errorRateCandidate: number
}

/** Compare candidate to gold, using baseline (uncorrected) to attribute fixed vs introduced. */
export function score(baseline: string, candidate: string, gold: string): Score {
  const g = tokenize(gold)
  const gb = lcsGoldMatched(tokenize(baseline), g)
  const gc = lcsGoldMatched(tokenize(candidate), g)
  let fixed = 0, introduced = 0, remaining = 0, baselineErrors = 0, candidateErrors = 0
  for (let k = 0; k < g.length; k++) {
    if (!gb[k]) baselineErrors++
    if (!gc[k]) { candidateErrors++; remaining++ }
    if (!gb[k] && gc[k]) fixed++
    if (gb[k] && !gc[k]) introduced++
  }
  return {
    fixed, introduced, remaining,
    goldTokens: g.length, baselineErrors, candidateErrors,
    errorRateBaseline: baselineErrors / g.length,
    errorRateCandidate: candidateErrors / g.length,
  }
}
