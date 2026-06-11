// live-player.mjs — the "Spotify player" live-broadcast simulation (Core 1 product glimpse).
//
// Plays the real call audio in sync with the Gemini-corrected transcript words:
// the word being said is full WHITE, upcoming words are subtle gray, past words dim.
// Framed as a live broadcast running 5 minutes behind the actual call.
//
// Reads:  scripts/out/replay-corrected.json  (from live-replay.mjs)
//         scripts/out/bakeoff-audio.mp3      (from live-bakeoff.mjs fetch)
// Usage:  node scripts/live-player.mjs   ->  http://localhost:8789

import { createServer } from 'node:http'
import { readFileSync, statSync, createReadStream, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const DATA = join(OUT_DIR, 'replay-corrected.json')
const AUDIO = join(OUT_DIR, 'bakeoff-audio.mp3')
const PORT = 8789
const DELAY_MIN = 5

const server = createServer((req, res) => {
  if (req.url === '/data') {
    if (!existsSync(DATA)) { res.writeHead(404).end('replay-corrected.json not ready'); return }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(readFileSync(DATA))
    return
  }
  if (req.url === '/audio') {
    if (!existsSync(AUDIO)) { res.writeHead(404).end('audio not found'); return }
    const { size } = statSync(AUDIO)
    const range = req.headers.range
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/)
      const start = Number(m[1])
      const end = m[2] ? Number(m[2]) : size - 1
      res.writeHead(206, {
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
        'content-type': 'audio/mpeg',
      })
      createReadStream(AUDIO, { start, end }).pipe(res)
    } else {
      res.writeHead(200, { 'content-length': size, 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes' })
      createReadStream(AUDIO).pipe(res)
    }
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGE)
})

const PAGE = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>תמלול. — שידור חי</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{background:#0a0a0a;color:#f5f5f4;font-family:'IBM Plex Sans Hebrew','Segoe UI',sans-serif;margin:0;padding-bottom:140px}
  header{position:sticky;top:0;z-index:5;background:#0a0a0aee;backdrop-filter:blur(8px);padding:16px 28px;border-bottom:1px solid #1f1f1f;display:flex;align-items:center;gap:16px}
  .live{display:inline-flex;align-items:center;gap:8px;color:#ef4444;font-weight:600;font-size:13px;border:1px solid #ef444433;padding:4px 12px;border-radius:99px}
  .dot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse 1.4s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
  h1{font-size:17px;margin:0;font-weight:600}h1 b{color:#C04A00}
  #behind{margin-inline-start:auto;color:#737373;font-size:13px;font-variant-numeric:tabular-nums;direction:ltr}
  main{max-width:760px;margin:0 auto;padding:48px 28px}
  #words{font-size:26px;line-height:2.1;font-weight:500;letter-spacing:.01em}
  .w{color:#3f3f46;transition:color .15s}
  .w.past{color:#d4d4d8}
  .w.now{color:#ffffff;text-shadow:0 0 18px #ffffff44}
  .w.fixed.now,.w.fixed.past{border-bottom:2px solid #C04A0066}
  #bar{position:fixed;bottom:0;left:0;right:0;background:#111111f2;border-top:1px solid #262626;backdrop-filter:blur(10px);padding:14px 28px;display:flex;align-items:center;gap:18px}
  #play{width:52px;height:52px;border-radius:50%;background:#f5f5f4;border:none;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;color:#0a0a0a;flex:none}
  #play:hover{transform:scale(1.05)}
  #seek{flex:1;appearance:none;height:4px;border-radius:2px;background:#27272a;cursor:pointer}
  #seek::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;background:#C04A00}
  .t{color:#737373;font-size:13px;font-variant-numeric:tabular-nums;direction:ltr;flex:none}
  #speaker{color:#a3a3a3;font-size:13px;flex:none;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #overlay{position:fixed;inset:0;background:#0a0a0af5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:10}
  #overlay h2{font-weight:600;font-size:22px;margin:0}
  #overlay p{color:#737373;margin:0;font-size:15px}
  #startBtn{background:#C04A00;color:#fff;border:none;border-radius:99px;padding:14px 44px;font-size:17px;font-family:inherit;cursor:pointer;font-weight:600}
  #startBtn:hover{filter:brightness(1.1)}
</style></head><body>
<div id="overlay">
  <span class="live"><span class="dot"></span>שידור חי</span>
  <h2>אור-ים אנרגיה — שיחת משקיעים Q1 2026</h2>
  <p>השידור מתנהל בהשהיה של ${DELAY_MIN} דקות מהשיחה החיה — תמלול מתוקן בזמן אמת</p>
  <button id="startBtn">▶ הצטרפו לשידור</button>
</div>
<header>
  <span class="live"><span class="dot"></span>LIVE</span>
  <h1>אור-ים אנרגיה — שיחת משקיעים · <b>תמלול.</b></h1>
  <span id="behind">‎-${String(DELAY_MIN).padStart(2,'0')}:00 מאחורי החי</span>
</header>
<main><div id="words"></div></main>
<div id="bar">
  <button id="play">▶</button>
  <span class="t" id="cur">0:00</span>
  <input id="seek" type="range" min="0" max="100" value="0" step="0.1">
  <span class="t" id="dur">0:00</span>
  <span id="speaker"></span>
</div>
<audio id="a" src="/audio" preload="auto"></audio>
<script>
const a=document.getElementById('a'),playBtn=document.getElementById('play'),seek=document.getElementById('seek');
let words=[],spans=[],cur=-1;
const fmt=s=>{s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
fetch('/data').then(r=>r.json()).then(d=>{
  const box=document.getElementById('words');
  for(const ch of d.chunks){for(const w of ch.words){
    const sp=document.createElement('span');sp.className='w'+(w.rawText&&w.rawText!==w.text?' fixed':'');
    sp.textContent=w.text;if(w.rawText&&w.rawText!==w.text)sp.title='מקור: '+w.rawText;
    box.appendChild(sp);box.appendChild(document.createTextNode(' '));
    words.push({start:w.start,end:w.end,speaker:ch.speaker});spans.push(sp);
  }}
});
document.getElementById('startBtn').onclick=()=>{document.getElementById('overlay').style.display='none';a.play()};
playBtn.onclick=()=>a.paused?a.play():a.pause();
a.addEventListener('play',()=>playBtn.textContent='⏸');
a.addEventListener('pause',()=>playBtn.textContent='▶');
a.addEventListener('loadedmetadata',()=>{document.getElementById('dur').textContent=fmt(a.duration);seek.max=a.duration});
seek.addEventListener('input',()=>{a.currentTime=Number(seek.value)});
function tick(){
  const t=a.currentTime;
  document.getElementById('cur').textContent=fmt(t);
  if(!seek.matches(':active'))seek.value=t;
  let lo=0,hi=words.length-1,idx=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(words[m].start<=t){idx=m;lo=m+1}else hi=m-1}
  if(idx!==cur){
    spans.forEach((sp,i)=>{sp.classList.toggle('past',i<idx);sp.classList.toggle('now',i===idx)});
    if(idx>=0){
      document.getElementById('speaker').textContent=words[idx].speaker||'';
      const r=spans[idx].getBoundingClientRect();
      if(r.top<120||r.bottom>innerHeight-180)spans[idx].scrollIntoView({block:'center',behavior:'smooth'});
    }
    cur=idx;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script></body></html>`

server.listen(PORT, () => console.log(`live-player on http://localhost:${PORT}`))
