// Two-user RLS proof with a REAL SIGNED JWT, not a forced database context.
//
// `set local request.jwt.claims` proves the POLICY logic but simulates the
// identity. This proves the whole path: a genuinely signed token, the anon key,
// and PostgREST — the same door the browser uses.
//
// User B's session is obtained WITHOUT a password, per the founder + supervisor
// decision 2026-08-02: admin.generateLink({type:'magiclink'}) -> verifyOtp.
// No password is read, printed or stored by this script, and tokens are never
// printed — only length and expiry, so the output is evidence, not a credential.
//
// Run: npx tsx scripts/verify-rls-two-user.ts
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

const USER_B_EMAIL = 'barelyknowingyou@gmail.com'
const USER_B_ID = '52641cad-f85b-4b8d-95ee-aad0ed16194c'
const USER_A_ID = '74ef4fbf-d0bc-4ab3-9371-a0c0ef75e690'

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false } })

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: USER_B_EMAIL,
  })
  if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`)
  const hashed = link.properties?.hashed_token
  if (!hashed) throw new Error('no hashed_token returned')

  const pub = createClient(url, anon, { auth: { persistSession: false } })
  const { data: sess, error: otpErr } = await pub.auth.verifyOtp({
    token_hash: hashed,
    type: 'email',
  })
  if (otpErr) throw new Error(`verifyOtp failed: ${otpErr.message}`)
  const token = sess.session?.access_token
  if (!token) throw new Error('no access_token in session')

  console.log('=== REAL SIGNED JWT FOR USER B (no password used anywhere) ===')
  console.log('user id      :', sess.user?.id)
  console.log('email match  :', sess.user?.email === USER_B_EMAIL)
  console.log('token length :', token.length, '(value deliberately not printed)')

  const asB = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: bRows, error: bErr } = await asB.from('projects').select('id, name, user_id')
  if (bErr) throw new Error(`B select failed: ${bErr.message}`)
  console.log('\n=== WHAT B SEES THROUGH A REAL TOKEN ===')
  console.log('rows visible :', bRows?.length)
  for (const r of bRows ?? []) {
    console.log(`  - ${r.name}  (owner ${r.user_id === USER_B_ID ? 'B ok' : 'NOT B !! ' + r.user_id})`)
  }
  const foreign = (bRows ?? []).filter((r) => r.user_id !== USER_B_ID)
  console.log('rows NOT owned by B:', foreign.length, foreign.length === 0 ? '(correct)' : '(LEAK)')

  const { error: writeErr } = await asB
    .from('projects')
    .insert({ user_id: USER_A_ID, name: 'ATTACK via real token' })
  console.log('\n=== B WRITING A ROW OWNED BY A, VIA A REAL TOKEN ===')
  console.log('refused      :', writeErr ? 'YES' : 'NO -- LEAK')
  console.log('reason       :', writeErr?.message ?? '(none - this is a failure)')

  const asAnon = createClient(url, anon, { auth: { persistSession: false } })
  const { data: anonRows, error: anonErr } = await asAnon.from('projects').select('id')
  console.log('\n=== ANON KEY (the one that ships in the browser bundle) ===')
  console.log('rows visible :', anonRows?.length ?? 0, anonErr ? `(error: ${anonErr.message})` : '')

  await pub.auth.signOut().catch(() => {})
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
