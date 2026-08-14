import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyCitation } from './citations'

test('a verbatim quote inside the source verifies', () => {
  const v = verifyCitation({
    quote: 'ההכנסות גדלו ברבעון',
    sourceContent: 'להלן הדוח: ההכנסות גדלו ברבעון השני',
  })
  assert.equal(v.ok, true)
})

test('an invented quote is rejected with a fixable reason', () => {
  const v = verifyCitation({ quote: 'הרווח הוכפל פי שלושה', sourceContent: 'ההכנסות גדלו ברבעון השני' })
  assert.equal(v.ok, false)
  if (!v.ok) assert.match(v.reason, /not found verbatim/)
})

test('an empty quote is rejected', () => {
  const v = verifyCitation({ quote: '   ', sourceContent: 'anything' })
  assert.equal(v.ok, false)
})

test('quote-flavour and whitespace differences still verify', () => {
  const v = verifyCitation({ quote: 'the  company’s  revenue', sourceContent: "The company's revenue grew" })
  assert.equal(v.ok, true)
})
