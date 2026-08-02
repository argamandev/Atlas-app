import { listCalls } from '@/lib/db/calls'
import { listFollowedCallIds } from '@/lib/db/quotes'
import { getCurrentUser } from '@/lib/auth'
import { AppPage } from '@/components/app/AppPage'
import { CalendarView } from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const [calls, user] = await Promise.all([listCalls({ scope: 'all' }), getCurrentUser()])
  // No `?? DEMO_USER_ID` — see the same note on the company page. An unresolved user must see
  // nothing followed, not the shared demo identity's followed calls presented as their own.
  const followed = user.userId ? await listFollowedCallIds(user.userId) : []

  return (
    <AppPage>
      <CalendarView calls={calls} followedIds={followed} />
    </AppPage>
  )
}
