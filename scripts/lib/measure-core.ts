// Pure helpers for scoring a transcript against the gold. No I/O.

/** Strip everything that is not transcript *words*: speaker headers, [timestamps],
 *  the divider line, markdown headings, punctuation, ניקוד; collapse whitespace. */
export function normalize(text: string): string {
  return text
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
