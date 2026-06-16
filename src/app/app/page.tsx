import { redirect } from 'next/navigation'

// Login lands on the legacy product (/dashboard); the V1 app is opt-in. Typing "/app" sends you
// into the app home so the bare path works.
export default function AppIndex() {
  redirect('/app/home')
}
