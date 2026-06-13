import { listCalls } from '@/lib/db/calls'
import { listFollowedCallIds } from '@/lib/db/quotes'
import { getCurrentUser } from '@/lib/auth'
import { DEMO_USER_ID } from '@/lib/api/types'
import { AppPage } from '@/components/app/AppPage'
import { CalendarView } from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const [calls, user] = await Promise.all([listCalls({ scope: 'all' }), getCurrentUser()])
  const followed = await listFollowedCallIds(user.userId ?? DEMO_USER_ID)

  return (
    <AppPage>
      <CalendarView calls={calls} followedIds={followed} />
    </AppPage>
  )
}
