import { redirect } from 'next/navigation'

// Login lands users directly in Atlas (/app/home). Typing "/app" sends you
// into the app home so the bare path works.
export default function AppIndex() {
  redirect('/app/home')
}
