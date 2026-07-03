// scripts/lib/runpod-live.ts — small-chunk RunPod client for the live pipeline.
// Unlike transcription.ts (whole files, 5s poll), this polls fast: jobs are 20-45s of audio.
export interface RunpodLiveOpts {
  apiKey: string
  endpointId: string
  model: string
  pollMs?: number
  timeoutMs?: number
}

async function runJob(opts: RunpodLiveOpts, transcribeArgs: Record<string, unknown>): Promise<unknown> {
  const { apiKey, endpointId, model, pollMs = 1000, timeoutMs = 180_000 } = opts
  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { model, streaming: false, transcribe_args: transcribeArgs } }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`RunPod submit ${res.status}: ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs))
    // One hung/aborted poll must never kill the job wait — a single bad tick just retries
    // on the next pollMs tick within the same timeoutMs budget.
    let st: Response
    try {
      st = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      })
    } catch (e) {
      console.warn('[runpod] poll failed (retrying):', (e as Error).message)
      continue
    }
    if (!st.ok) continue
    const s = (await st.json()) as { status: string; output?: unknown; error?: unknown }
    if (s.status === 'COMPLETED') return s.output
    if (s.status === 'FAILED') throw new Error(`RunPod job failed: ${JSON.stringify(s.error)}`)
  }
  throw new Error(`RunPod job timed out after ${timeoutMs / 1000}s`)
}

/** Transcribe a WAV buffer sent inline as base64 (S1 verifies the worker accepts `blob`). */
export function transcribeWav(wav: Buffer, opts: RunpodLiveOpts): Promise<unknown> {
  return runJob(opts, {
    blob: wav.toString('base64'),
    language: 'he',
    output_options: { word_timestamps: true, extra_data: true },
  })
}

/** URL fallback if S1 finds `blob` unsupported — same args, audio fetched by the worker. */
export function transcribeUrl(url: string, opts: RunpodLiveOpts): Promise<unknown> {
  return runJob(opts, {
    url,
    language: 'he',
    output_options: { word_timestamps: true, extra_data: true },
  })
}
