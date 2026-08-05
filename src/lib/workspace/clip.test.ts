import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipFigureHtml, escapeHtml } from './clip'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

test('a clipping becomes a figure carrying the image and its source', () => {
  const html = clipFigureHtml({ dataUrl: PNG, title: 'דוח דירקטוריון Q1 2026', pageLabel: 'עמוד 12' })
  assert.ok(html)
  assert.ok(html!.includes(`src="${PNG}"`))
  assert.ok(html!.includes('דוח דירקטוריון Q1 2026'))
  assert.ok(html!.includes('עמוד 12'))
  assert.ok(html!.startsWith('<figure'))
})

test('EVERY run of the caption is its own <bdi>', () => {
  // The five-times-filed bidi rule: a Hebrew title beside a Latin page run on
  // one line. One <bdi> around the pair would let the first strong character
  // decide the direction of both.
  const html = clipFigureHtml({ dataUrl: PNG, title: 'תגבור', pageLabel: 'page 12' })!
  assert.ok(html.includes('<bdi>תגבור</bdi>'))
  assert.ok(html.includes('<bdi>page 12</bdi>'))
})

test('a title with markup in it cannot become markup', () => {
  const html = clipFigureHtml({
    dataUrl: PNG,
    title: '<img src=x onerror="alert(1)"> & "co"',
    pageLabel: 'page 1',
  })!
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('&lt;img'))
  assert.ok(html.includes('&amp;'))
  // Exactly one real image — the one we put there.
  assert.equal(html.match(/<img /g)?.length, 1)
})

test('the alt text survives quotes without breaking the attribute', () => {
  const html = clipFigureHtml({ dataUrl: PNG, title: 'a "quoted" name', pageLabel: 'page 3' })!
  const alt = html.match(/alt="([^"]*)"/)
  assert.ok(alt, 'the alt attribute must still parse')
  assert.ok(!alt![1].includes('"'))
})

test('anything that is not our own PNG capture is refused', () => {
  assert.equal(clipFigureHtml({ dataUrl: 'javascript:alert(1)', title: 't', pageLabel: 'p' }), null)
  assert.equal(clipFigureHtml({ dataUrl: 'https://example.com/x.png', title: 't', pageLabel: 'p' }), null)
  assert.equal(
    clipFigureHtml({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', title: 't', pageLabel: 'p' }),
    null
  )
  assert.equal(clipFigureHtml({ dataUrl: '', title: 't', pageLabel: 'p' }), null)
})

test('an unnamed source still gets a caption, not an empty one', () => {
  const html = clipFigureHtml({ dataUrl: PNG, title: '   ', pageLabel: 'page 7' })!
  assert.ok(html.includes('<figcaption><bdi>page 7</bdi></figcaption>'))
})

test('escapeHtml covers the five characters that matter', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
})
