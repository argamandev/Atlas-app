import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsIngest } from './openFiling'

test('nothing stored for this period means fetch it', () => {
  assert.equal(needsIngest(null, 1726974), true)
})

test('the stored row IS the filing that was clicked — serve it', () => {
  assert.equal(needsIngest({ mayaReportId: 1726974 }, 1726974), false)
})

// THE ONE THAT MATTERS. (company_id, quarter, doc_type) is unique and cannot be
// widened on a database shared with production, so a Hebrew/English pair or a
// correction and its original share ONE row — the last one opened wins. Without
// this line the user clicks one document and is shown the other, with no tell.
test('a stored row pointing at a DIFFERENT filing is re-fetched, never served', () => {
  // אלוני חץ Q1 2026: Hebrew #1742389 and English #1744011, one row between them
  assert.equal(needsIngest({ mayaReportId: 1742389 }, 1744011), true)
  assert.equal(needsIngest({ mayaReportId: 1744011 }, 1742389), true)
})

// One live row is source='manual' with a null maya_report_id (תיגבור Q1 2026).
// Unknown identity is not matching identity.
test('a row that predates maya_report_id is re-fetched rather than assumed', () => {
  assert.equal(needsIngest({ mayaReportId: null }, 1744011), true)
})
