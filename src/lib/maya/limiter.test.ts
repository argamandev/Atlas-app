import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SlidingWindowLimiter, mayaLimiter } from './limiter'
import { mayaGet } from './client'

// ─────────────────────────────────────────────────────────────────────────────
// The standard's owed mechanism: a unit test on the client chokepoint. Small
// windows keep the test fast; the law under test is the SHAPE (one shared
// sliding window, FIFO), not the production numbers.
// ─────────────────────────────────────────────────────────────────────────────

test('at most `max` sends fit in one window; the overflow waits for the window to slide', async () => {
  const limiter = new SlidingWindowLimiter(2, 150)
  const t0 = Date.now()
  const times: number[] = []
  for (let i = 0; i < 5; i++) {
    await limiter.acquire()
    times.push(Date.now() - t0)
  }
  // 1st + 2nd immediate; 3rd+4th after ~one window; 5th after ~two.
  assert.ok(times[0] < 100 && times[1] < 100, `first two immediate, got ${times}`)
  assert.ok(times[2] >= 120, `3rd send must wait for the window, got ${times}`)
  assert.ok(times[4] >= 240, `5th send needs two window slides, got ${times}`)

  // No sliding window of 150ms ever contained more than 2 sends.
  for (const t of times) {
    const inWindow = times.filter((x) => x > t - 150 && x <= t).length
    assert.ok(inWindow <= 2, `window ending at ${t}ms held ${inWindow} sends (${times})`)
  }
})

test('concurrent acquires resolve FIFO — a burst cannot jump the queue', async () => {
  const limiter = new SlidingWindowLimiter(1, 40)
  const order: number[] = []
  await Promise.all([0, 1, 2].map((i) => limiter.acquire().then(() => order.push(i))))
  assert.deepEqual(order, [0, 1, 2])
})

test('mayaGet goes through the GLOBAL limiter — the chokepoint cannot be bypassed', async () => {
  const original = mayaLimiter.acquire.bind(mayaLimiter)
  let acquired = 0
  ;(mayaLimiter as { acquire: () => Promise<void> }).acquire = async () => {
    acquired++
    return original()
  }
  try {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      text: async () => '{"rows":[]}',
    })) as unknown as typeof fetch
    process.env.MAYA_API_KEY = 'test-key'
    const res = await mayaGet('/api/v2/test', {}, { fetchImpl })
    assert.ok(res.ok)
    assert.equal(acquired, 1, 'every mayaGet must acquire the global limiter')
  } finally {
    delete process.env.MAYA_API_KEY
    ;(mayaLimiter as { acquire: () => Promise<void> }).acquire = original
  }
})
