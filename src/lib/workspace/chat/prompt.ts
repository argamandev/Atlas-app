import { modelObject } from '../intake/json'

// ─────────────────────────────────────────────────────────────────────────────
// THE WORKSPACE CHAT — talking about the shelf, and asking for more of it.
//
// Founder, 2026-08-04: *"the new workspace chat should just be workspace chat.
// this is where the user can communicate with an llm about the worksapce itself
// -> questions, data analysis, asking for more documents pulling (the same as
// add documents) etc etc."*
//
// "The same as add documents" is the load-bearing phrase, and it is why this
// model does NOT choose files. It has one escape hatch: when the analyst is
// asking for a document rather than about one, it says so and restates the
// request, and the UI hands that to the intake conversation — the code that
// already names files, confirms them in words, and waits for a yes. Letting a
// second model pick files would mean two answers to "which file did you mean"
// and only one of them tested.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export type ChatAnswer = {
  reply: string
  /** the request restated for the intake flow, or null when this was a question */
  wantsDocuments: string | null
}

export type PromptInput = {
  workspaceName: string
  /** every file on the shelf, whether or not its text fitted */
  shelf: { title: string; kind: string }[]
  /** the source text, already fitted to budget by buildContext */
  context: string
  /** titles whose text was cut short, so the model can say so too */
  truncated: string[]
  conversation: ChatTurn[]
  /** Ask Atlas: the passage the analyst marked, if any */
  selection?: { title: string; text: string } | null
}

export function buildChatPrompt(input: PromptInput): string {
  const shelf =
    input.shelf.length === 0
      ? '(nothing on the shelf yet)'
      : input.shelf.map((f) => `- ${f.title} (${f.kind})`).join('\n')

  const partial =
    input.truncated.length === 0
      ? ''
      : `\nYOU WERE GIVEN ONLY PART OF THESE, because they are long:
${input.truncated.map((t) => `- ${t}`).join('\n')}
If your answer depends on a part you cannot see, SAY SO plainly. Never imply you
read the whole of one of these.
`

  // The marked passage goes in as its own block rather than being glued onto the
  // user's question, so "what does this mean?" has an unambiguous "this".
  const marked = input.selection
    ? `\nTHE ANALYST HAS MARKED THIS PASSAGE, from "${input.selection.title}":
"""
${input.selection.text}
"""
Their message is about this passage unless they clearly change the subject.
`
    : ''

  const talk = input.conversation
    .map((t) => `${t.role === 'user' ? 'ANALYST' : 'YOU'}: ${t.content}`)
    .join('\n')

  return `You are Atlas, working alongside an equity analyst inside their research workspace "${input.workspaceName}".

FILES ON THE SHELF:
${shelf}
${partial}${marked}
THE TEXT OF THOSE FILES:
${input.context || '(no readable text is available for these files yet)'}

CONVERSATION SO FAR:
${talk}

Reply with ONLY a JSON object:
{
  "reply": "what you say next, IN THE SAME LANGUAGE THE ANALYST IS WRITING IN",
  "wantsDocuments": null
}

How to behave:
- Answer from the text above and NOTHING else. You are not recalling this company from memory; you are reading these files.
- Quote the analyst's own sources when it helps, in their words, and say which file it came from by title.
- If the answer is not in these files, say so in one sentence. Do not fill the gap from general knowledge, and do not guess at a number.
- Numbers matter more than prose here. If you are comparing or totalling figures, show which figures, from where.
- Write like a colleague who has read the files: direct, a few sentences, no headings and no bullet lists unless the analyst asked for a list.
- NEVER write an internal id (like an item id, or a marker such as [L0007] or [p.4]) into "reply". Refer to a file by its title.

THE ONE EXCEPTION — when they are asking you to BRING a file rather than asking about one
("pull the Q3 call too", "תביא לי גם את הדוח השנתי", "add Qualitau's last webinar"):
- set "wantsDocuments" to their request restated in one clear sentence, in their language
- and let "reply" say you are looking for it.
Do not name or promise specific files in that case — you are handing the request on, and the step that answers it will confirm the files with them first.`
}

/**
 * Read the model's answer, or null when it is unusable.
 *
 * A null here is NOT rendered as an empty message: the route turns it into an
 * honest "I could not answer that just now", because a chat bubble containing
 * nothing looks like Atlas ignoring the question.
 */
export function parseChatAnswer(raw: string): ChatAnswer | null {
  const obj = modelObject(raw)
  if (obj === null) return null

  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : ''
  if (!reply) return null

  const wants = typeof obj.wantsDocuments === 'string' ? obj.wantsDocuments.trim() : ''
  return { reply, wantsDocuments: wants || null }
}
