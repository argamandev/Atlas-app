import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipFigureHtml, clipDerivedHtml, escapeHtml } from './clip'

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

test('what Atlas made of a clip keeps the source line under it', () => {
  const html = clipDerivedHtml({
    html: '<table><tr><td>1,204</td></tr></table>',
    title: 'דוח דירקטוריון Q1 2026',
    pageLabel: 'page 4',
  })!
  assert.ok(html.includes('<table><tr><td>1,204</td></tr></table>'))
  // Provenance, per run, so the Hebrew title cannot flip the Latin page label.
  assert.ok(html.includes('<bdi>דוח דירקטוריון Q1 2026</bdi> · <bdi>page 4</bdi>'))
  assert.ok(html.includes('class="atlas-clip-cite"'))
})

test('a derived clip with nothing in it is refused, not inserted empty', () => {
  assert.equal(clipDerivedHtml({ html: '   ', title: 't', pageLabel: 'p' }), null)
})

test('markup in a derived clip TITLE cannot become markup', () => {
  const html = clipDerivedHtml({
    html: '<p>ok</p>',
    title: '<img src=x onerror=alert(1)>',
    pageLabel: 'page 1',
  })!
  assert.equal(html.match(/<img /g), null)
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})
