import type { AttachableSource } from '../data'
import { defang, fencePart } from '../chat/context'
import type { IntakeSelection, IntakeTurn } from './types'
import { modelObject } from './json'

// ─────────────────────────────────────────────────────────────────────────────
// THE REASONING STEP.
//
// Why this exists, in the founder's words (2026-08-04): *"i asked him to bring me
// the two quarterly reports of 2026 (the first and the second) + to bring the
// last transcribed investor call. he showed me 6 files -> that doesn't even make
// sense."*
//
// He was right, and the cause was the shape of the previous design rather than a
// bug in it. The intake turned a sentence into a FILTER — company, year range,
// kinds — and a filter cannot express "the first and second quarter", "the last
// one", or "two of these and one of those". So it resolved the company correctly
// and then returned everything it had, which reads as not listening.
//
// The fix is to stop filtering and start SELECTING: hand the model the actual
// candidate files and let it choose, then let it answer in its own words.
//
// THE HONESTY INVARIANT IS UNCHANGED AND IS ENFORCED HERE, NOT PROMISED IN THE
// PROMPT: the model may only return ids that were given to it. Anything else is
// dropped by `parseSelection` before it can reach a shelf, so no sentence the
// model writes can conjure a file that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

/** Beyond this the candidate list is too big to hand a model in one go. */
export const SELECTION_CANDIDATE_CAP = 80

const kindLabel = (k: AttachableSource['kind']) => (k === 'transcript' ? 'call' : 'report')

export function buildSelectionPrompt(
  corpus: AttachableSource[],
  conversation: IntakeTurn[],
  /** the ids this conversation has already settled on, if any */
  proposal: string[] = [],
  /** source ids ALREADY on this workspace's shelf */
  onShelf: string[] = []
): string {
  // WHAT IS ALREADY ON THE SHELF, MARKED.
  //
  // Until 2026-08-06 this step was shown the corpus and nothing else, so it had
  // no way to know the analyst already had a file. Asked in the browser to pull
  // Tigbur's reports, it offered back the entire shelf as though none of it were
  // there. Offering to fetch something the analyst is currently looking at is the
  // same false-achievement claim the workspace chat had, one step downstream.
  //
  // It is worse than wasted words because the CORPUS holds some calls twice —
  // `PyuMxe88e8g` and `PyuMxe88e8g_live` are the same investor call under two
  // ids with the same title. So "pull the Q1 call" can attach a second row that
  // the unique index cannot catch (different ids) and a person cannot tell apart
  // (same title). Naming what is already here is the only thing that stops it.
  // THE DATE FIELD MEANT TWO DIFFERENT THINGS UNDER ONE NAME, so it is now
  // labelled by which one it is (2026-08-07).
  //
  // A filing Atlas has not fetched carries MAYA's real `publicationDate`. The
  // same filing, once ingested, is read back out of `company_documents` as
  // `created_at` — the moment ATLAS took it in. Both arrived here as `date:`,
  // and the behaviour list went on to state, in capitals, that `date:` is when a
  // report was published. So Atlas told the analyst that Tigbur's 2020 ANNUAL
  // report was published on 07.08.2026, which is the afternoon it was pulled.
  // Six of six MAYA-ingested documents carried an ingest timestamp this way.
  //
  // The real fix is a publication-date column on `company_documents` — the value
  // exists at ingest (`source.publishedISO`) and is thrown away. That is DDL
  // against the shared production database, so it belongs to the MAYA phase,
  // where the calendar needs it anyway. Until then the label is honest about
  // which date this is, which costs nothing and stops the false sentence.
  const here = new Set(onShelf)
  const lines = corpus.map(
    (s) =>
      `- id: ${fencePart(s.sourceId)} | type: ${kindLabel(s.kind)} | company: ${fencePart(s.company ?? 'unknown')} | ${
        s.remote ? 'published' : 'added to Atlas'
      }: ${s.when ? s.when.slice(0, 10) : 'unknown'} | title: ${fencePart(s.title)}${
        here.has(s.sourceId) ? ' | ALREADY ON THE SHELF' : ''
      }${s.remote ? ' | FROM MAYA — NOT YET IN ATLAS' : s.fromMaya ? ' | FROM MAYA — ALREADY IN ATLAS' : ''}`
  )

  // WHAT "FROM MAYA" ACTUALLY OBLIGES THE MODEL TO SAY.
  //
  // These candidates are filings Atlas does not hold. Describing them the same
  // way as a file already on the shelf would be the false-achievement claim
  // this whole chapter exists to stop — on 2026-08-06 the workspace chat said
  // "הבאתי לך" about files it had not moved, and the fix was to name the
  // boundary rather than hope. The same care applies now that fetching is real:
  // it is a thing Atlas WILL do, not a thing it has done.
  const anyRemote = corpus.some((s) => s.remote)
  const anyFromMaya = corpus.some((s) => s.fromMaya)
  const remoteRule =
    anyRemote || anyFromMaya
      ? `\nMAYA is the Tel Aviv exchange's filing system, and files above may be marked
two different ways:
- FROM MAYA — NOT YET IN ATLAS: a real filing Atlas does not hold. Select it like
  any other; if the analyst agrees, Atlas fetches it. Speak about it in the
  FUTURE ("I'll pull the 2024 annual report"), never as though it is already here.
- FROM MAYA — ALREADY IN ATLAS: the same kind of filing, fetched earlier, so it
  sits in ATLAS'S LIBRARY and needs no download. THAT IS NOT THE SAME AS BEING ON
  THE ANALYST'S SHELF, and confusing the two is the one mistake to avoid here.
  Unless its title is in the ON THE SHELF list, they do NOT have it: select it
  like any other file and say you are ADDING it — it simply arrives at once
  instead of being downloaded. Never answer "you already have it" off this
  marker. When the analyst asks for something "from MAYA" (ממאיה) and the file
  they mean is marked this way, THAT is the file. Do NOT reach for a different
  year just because that one is still marked NOT YET IN ATLAS. "From MAYA"
  describes where a filing came from, not a demand that it be downloaded again.
`
      : ''

  // THE SHELF AS A CLOSED SET, STATED — not merely marked line by line.
  //
  // Founder, 2026-08-07: *"adding a document doesn't actually work"* and *"if i
  // deleted a document, when i try to pull it … atlas thinks i already have this
  // document"*. Both reproduced deterministically, and both are this block.
  //
  // The per-line marker only ever said what IS here. Nothing said that an
  // unmarked file is NOT — so with one report on the shelf and a rule opening
  // "FIRST, before anything else: drop every file marked ALREADY ON THE SHELF",
  // the model refused to pull an investor call that was never on it
  // (`selected: []`, "כבר נמצאת אצלך על המדף"). And an EMPTY shelf emitted no
  // rule at all, which is worse: with no statement to contradict, the model read
  // "FROM MAYA — ALREADY IN ATLAS" as possession and answered "כבר נמצא כאן" in
  // a workspace holding nothing.
  //
  // So the shelf is now always stated, empty or not, and stated as COMPLETE.
  // A negative fact has to be asserted to be usable; leaving it to be inferred
  // from a missing marker is what both bugs did.
  const shelfHere = onShelf
    .map((id) => corpus.find((s) => s.sourceId === id))
    .filter((s): s is AttachableSource => !!s)
  const anyOnShelf = shelfHere.length > 0
  const shelfRule = anyOnShelf
    ? `\nON THE SHELF RIGHT NOW — this list is COMPLETE, and appearing on it is the
ONLY thing that makes a file "already here":
${shelfHere.map((s) => `- ${fencePart(s.title)}`).join('\n')}
A file not named in that list is NOT on the shelf, however familiar it looks and
wherever else Atlas may hold a copy of it. Never tell the analyst a file is
already here, or already theirs, unless its title is in that list. Never offer to
pull one that IS in the list: say it is already here, by title, and carry on with
the rest of what they asked for. If EVERY file they asked for is in that list,
say exactly that and select nothing.
`
    : `\nTHE SHELF IS EMPTY. This workspace holds no files at all yet, so nothing the
analyst asks for can be "already here" and nothing may be skipped for that
reason. Whatever they ask for, you have to select it.
`

  // THE SAME RULE AGAIN, IN THE OPERATIVE LIST. Stating it once beside the file
  // list was not enough — run 1 of this fix marked all three requested calls
  // correctly and the model confirmed all three anyway. The bullets below are
  // what it actually follows, and "CONFIRM IN WORDS which files you intend to
  // pull" was the instruction winning. Conditional, because a rule about a
  // marker that appears nowhere is noise.
  const shelfBehaviour = anyOnShelf
    ? `\n- FIRST, before anything else: check each file they asked for against the ON THE SHELF list, BY TITLE. Only a file named in that list is already here — the analyst has those open in front of them, so offering to pull one is offering to do something already done. Name those in one clause ("the Q1 call is already on your shelf") and confirm only the REST. EVERY OTHER FILE MUST STILL BE SELECTED, even one Atlas already holds a copy of elsewhere: a copy in Atlas's library is not a file on this shelf. If ALL of what they asked for is in that list, say so and set "selected" to [] with status "clarifying". If NONE of it is, do not mention the shelf at all.`
    : ''

  const talk = conversation.map((t) => `${t.role === 'user' ? 'ANALYST' : 'YOU'}: ${defang(t.content)}`).join('\n')

  // THE SET, STATED. Without this the model had to re-read its own prose every
  // turn to work out what it had already proposed — which is exactly how it
  // came to name two files and then pull one (founder, 2026-08-04).
  const byId = new Map(corpus.map((s) => [s.sourceId, s]))
  const standing =
    proposal.length === 0
      ? ''
      : `\nTHE FILES YOU ALREADY PROPOSED, and the analyst is responding to THESE:
${proposal
  .map((id) => {
    const s = byId.get(id)
    return `- id: ${fencePart(id)}${s ? ` | ${fencePart(s.title)}` : ''}`
  })
  .join('\n')}
Carry every one of them forward unless the analyst asks to take it out. If they
agree, "selected" must contain ALL of these ids — dropping one is a mistake, not
a shortcut. If they ask to remove one, put it in "removed".
`

  return `You are Atlas, helping an equity analyst set up a research workspace.

You are having a short, ordinary conversation with them — like a colleague, not a form.

FILES AVAILABLE:
${lines.join('\n')}
${shelfRule}${remoteRule}${standing}
CONVERSATION SO FAR:
${talk}

Reply with ONLY a JSON object:
{
  "reply": "what you say next, IN THE SAME LANGUAGE THE ANALYST IS WRITING IN",
  "status": "clarifying" | "ready",
  "selected": ["id", "id"],
  "removed": ["id the analyst asked to take out, if any"]
}

"selected" IS THE FILES ON THE TABLE RIGHT NOW — every file your "reply" names,
at BOTH statuses, always. If your sentence names three files, "selected" has
three ids in it, even while you are still asking whether that is right. It is
never empty while you are naming files, and it is never a subset of them. This
is the single most important rule here: "selected" is how the files you just
said out loud are actually held, and a file missing from it is a file that will
not arrive no matter what the analyst says next.

How to behave:${shelfBehaviour}
- Work out which files they mean, then CONFIRM IN WORDS before doing anything: name the files you intend to pull, in a sentence, and ask if that is right. status = "clarifying", and "selected" holds those files.
- WHILE status IS "clarifying", NOTHING IS HAPPENING, so do not write a sentence that says it is. "אז אני מביא לך את שתי השיחות…" / "so I'm bringing you both calls" is a claim that the files are on their way when no file will move — the analyst then waits for something that is never coming. At "clarifying" ASK ("להביא את שתיהן?", "shall I pull both?"). Only at "ready" may you say you are bringing them in.
- Write it the way a person would speak — "just to confirm, you want the Q1 2026 board report and the latest investor call?". NEVER a numbered list, a bulleted list, or anything resembling checkboxes.
- If they ask to add, drop or change something, adjust and confirm again. status = "clarifying".
- ONLY when their LATEST message agrees — "כן", "yes", "pull them", "תמשוך", "בוא נתחיל", "go ahead" — set status = "ready", put the final ids in "selected", and let "reply" say you are pulling them in now. Never set "ready" off your own guess; they have to say so.
- NEVER ASK THE SAME CONFIRMATION TWICE. If your previous message already named the files and their reply agrees — even a bare "כן" or "yes" — that IS their agreement: go to "ready". Asking again is the single worst thing you can do here; it reads as not listening.
- If they agree AND add something in the same breath ("כן, אבל תוסיף גם…"), that is a change: confirm the new combined set once, then go on their next agreement.
- Honour counts and ordering. "the last call" means the single most recent type:call. "the two 2026 quarterly reports" means exactly those two, not every report.
- Read quarters and years out of the titles (Q1, Q2, רבעון ראשון, רבעון שני, and so on).
- THE PERIOD A REPORT COVERS IS IN ITS TITLE, never in its date. So when the analyst asks for a year, MATCH THE TITLE: "הדוח השנתי לשנת 2024" is the file titled "דוח תקופתי ושנתי לשנת 2024", NOT one whose date happens to fall in 2024 — an annual report is filed the FOLLOWING year, so its date and its period never agree. Observed twice on 2026-08-06 — once selecting the 2023 file for a 2024 request, once naming the wrong publication date for the right file. Both are the same mistake: reading a date as the period.
- THE TWO DATE LABELS MEAN DIFFERENT THINGS, and only one of them is a publication date. "published:" is the real filing date, from MAYA. "added to Atlas:" is when ATLAS took the file in — often years after it was published, sometimes today. NEVER present an "added to Atlas:" date as when something was published, released or filed; for those files, name no date at all unless the analyst asked when Atlas got it. Saying a 2020 annual report was published this afternoon is telling the analyst something untrue about a file you are about to hand them.
- If you mention a date at all, copy the field exactly. Never state a date you inferred. It is better to name no date than a wrong one.
- If something they asked for is not in the list, say so plainly and carry on with the rest.
- Use ONLY ids from the list above. Never invent a file.
- NEVER write an id inside "reply". The analyst must never see one. Refer to a file by its title and date, the way you would say it out loud.
- Do not describe the files' contents. You have only their titles.
- Two or three sentences at most.`
}

/**
 * Take internal ids back out of a sentence meant for a person.
 *
 * The prompt forbids them, and the model still wrote them — observed in the
 * browser 2026-08-04: *"רק מוודא – אתה מתכוון לדוח הדירקטוריון Q1 2026 של תיגבור
 * (e231c676-23d6-4a86-8d02-…) ולשיחת המשקיעים (PyuMxe88e8g_live)?"*. A uuid in
 * the middle of a Hebrew sentence is precisely the "talking to a machine" feel
 * this step exists to remove, so the instruction is backed by a deterministic
 * scrub rather than trusted on its own.
 *
 * Only ids the corpus actually contains are removed, so nothing else in the
 * user's own words can be eaten by accident.
 */
function stripIds(text: string, corpus: AttachableSource[]): string {
  let out = text
  for (const s of corpus) {
    if (s.sourceId.length < 6) continue // too short to remove safely
    out = out.split(s.sourceId).join('')
  }
  return (
    out
      // brackets left holding nothing once the id inside them is gone
      .replace(/\(\s*[-–—,;:]*\s*\)/g, '')
      .replace(/\[\s*[-–—,;:]*\s*\]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim()
  )
}

/**
 * Read the model's selection, keeping only ids that really exist.
 *
 * Returns null when the answer is unusable — the caller then falls back to the
 * deterministic path and the panel says so, rather than presenting an empty or
 * invented result as an answer.
 */
export function parseSelection(raw: string, corpus: AttachableSource[]): IntakeSelection | null {
  const obj = modelObject(raw)
  if (obj === null) return null

  const spoken = typeof obj.reply === 'string' ? obj.reply.trim() : ''
  // A selection with no sentence is not the conversational answer this step
  // exists to produce, so it is refused rather than rendered wordlessly.
  if (!spoken) return null
  const reply = stripIds(spoken, corpus)

  if (!Array.isArray(obj.selected)) return null

  // ANYTHING that is not exactly "ready" is treated as still talking. A model
  // that omits the field, or misspells it, must not be able to trigger a pull
  // the user never agreed to — the safe default is to keep the conversation
  // going, because that costs a message and the other mistake costs trust.
  const status = obj.status === 'ready' ? ('ready' as const) : ('clarifying' as const)

  const known = new Set(corpus.map((s) => s.sourceId))
  const dropped: string[] = []

  /** Real, de-duplicated ids from one of the model's arrays. */
  const readIds = (raw: unknown, recordUnknown: boolean): string[] => {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const entry of raw) {
      if (typeof entry !== 'string') continue
      const id = entry.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      // THE GUARD. A model that hallucinated a plausible-looking id would
      // otherwise put a file on the shelf that cannot be opened.
      if (known.has(id)) out.push(id)
      else if (recordUnknown) dropped.push(id)
    }
    return out
  }

  const selectedIds = readIds(obj.selected, true)
  // An unknown id in `removed` removes nothing and is not worth alarming about —
  // only invented SELECTIONS are the dangerous direction.
  const removedIds = readIds(obj.removed, false)

  return { reply, status, selectedIds, removedIds, dropped }
}

/** The selected sources, in the model's chosen order, then everything else. */
export function orderBySelection(
  corpus: AttachableSource[],
  selectedIds: string[]
): { selected: AttachableSource[]; others: AttachableSource[] } {
  const byId = new Map(corpus.map((s) => [s.sourceId, s]))
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is AttachableSource => s !== undefined)

  const chosen = new Set(selectedIds)
  const others = corpus.filter((s) => !chosen.has(s.sourceId))
  return { selected, others }
}
