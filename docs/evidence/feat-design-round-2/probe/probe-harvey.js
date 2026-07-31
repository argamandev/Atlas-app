// Harvey token probe — run in the browser (Chrome MCP javascript_tool) on
//   http://127.0.0.1:4321/  (the rendered design; verify rail reads "Theme · Harvey")
//   http://localhost:3001   (the app, Task 8 parity diff)
// Run on BOTH the Home view and the call view (Multi + Ask Atlas open); merge key-wise.
// Keys are shared between origins — anchors resolve per-DOM.
(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const pick = (el, props) => {
    const c = cs(el);
    if (!c) return null;
    return Object.fromEntries(props.map((p) => [p, c[p]]));
  };
  const leaf = (txt) =>
    [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && e.textContent.trim().startsWith(txt))
      .pop();
  const shadowAncestor = (el) => {
    while (el && cs(el).boxShadow === 'none' && cs(el).border.startsWith('0px')) el = el.parentElement;
    return el;
  };
  const rail = [...document.querySelectorAll('*')].find((e) => {
    const r = e.getBoundingClientRect();
    return (
      r.left <= 2 && r.width > 120 && r.width < 320 && r.height > innerHeight * 0.9 &&
      cs(e).backgroundColor !== 'rgba(0, 0, 0, 0)'
    );
  });
  const composer = [...document.querySelectorAll('textarea, input')].find((e) =>
    (e.placeholder || '').startsWith('Ask Atlas')
  );
  const out = {
    pageBg: cs(document.body).backgroundColor,
    rail: pick(rail, ['backgroundColor', 'width', 'borderRight']),
    railItemActive: pick(leaf('Home')?.closest('[class]'), ['backgroundColor', 'color', 'borderRadius', 'fontSize', 'fontFamily']),
    headline: pick(leaf('Good morning'), ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color']),
    bodyText: pick(leaf('Write a company name'), ['fontFamily', 'fontSize', 'color']),
    sectionLabel: pick(leaf('UPCOMING INVESTOR CALLS'), ['fontFamily', 'fontSize', 'letterSpacing', 'color', 'fontWeight']),
    searchBox: pick(
      shadowAncestor([...document.querySelectorAll('input')].find((i) => (i.placeholder || '').includes('Search'))),
      ['backgroundColor', 'border', 'borderRadius', 'boxShadow', 'height']
    ),
    listCard: pick(shadowAncestor(leaf('Tigbur Group')), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    paneCard: pick(shadowAncestor(leaf('TRANSCRIPT')), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    viewPill: pick(leaf('Transcript')?.closest('button') || leaf('Transcript'), ['backgroundColor', 'border', 'borderRadius', 'fontSize', 'fontFamily', 'color']),
    askPanel: composer
      ? {
          width: composer.closest('[class]').getBoundingClientRect().width,
          panelWidthVsViewport: (composer.closest('[class]').getBoundingClientRect().width / innerWidth).toFixed(3),
        }
      : null,
    composerBox: pick(composer && shadowAncestor(composer), ['backgroundColor', 'border', 'borderRadius', 'boxShadow']),
    player: pick(
      [...document.querySelectorAll('*')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const bg = cs(e).backgroundColor.match(/\d+/g);
          return r.top > innerHeight * 0.75 && r.width > 400 && r.height > 30 && r.height < 90 && bg && +bg[0] < 45;
        })
        .pop(),
      ['backgroundColor', 'borderRadius', 'height']
    ),
    liveAccent: pick(leaf('LIVE'), ['color']),
  };
  return JSON.stringify(out, null, 2);
})();
