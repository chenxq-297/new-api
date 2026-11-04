/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { CheckinCalendarCard } from './components/checkin-calendar-card'
import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileSettingsCard } from './components/profile-settings-card'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import type { UserProfile } from './types'

interface ProfileContentProps {
  profile: UserProfile | null
  loading: boolean
  onProfileUpdate: () => Promise<void>
}

export function ProfileContent(props: ProfileContentProps) {
  const { status } = useStatus()
  const permissions = useAuthStore((s) => s.auth.user?.permissions)

  const checkinEnabled = status?.checkin_enabled === true
  const turnstileEnabled = !!(
    status?.turnstile_check && status?.turnstile_site_key
  )
  const turnstileSiteKey = status?.turnstile_site_key || ''
  const canConfigureSidebar = permissions?.sidebar_settings !== false
  // Older cached status payloads lack these fields; the site default is on.
  const quotaRemindEnabled = status?.quota_remind_enabled !== false
  const quotaRemindThreshold = status?.quota_remind_threshold ?? 0

  return (
    <div className='grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.46fr)] xl:items-start'>
      <div className='space-y-4 sm:space-y-6'>
        <ProfileSettingsCard
          profile={props.profile}
          loading={props.loading}
          onProfileUpdate={props.onProfileUpdate}
          quotaRemindEnabled={quotaRemindEnabled}
          quotaRemindThreshold={quotaRemindThreshold}
        />
        <LanguagePreferencesCard
          profile={props.profile}
          onProfileUpdate={props.onProfileUpdate}
        />
      </div>

      <div className='space-y-4 sm:space-y-6 xl:sticky xl:top-6'>
        {checkinEnabled && (
          <CheckinCalendarCard
            checkinEnabled={checkinEnabled}
            turnstileEnabled={turnstileEnabled}
            turnstileSiteKey={turnstileSiteKey}
          />
        )}
        {canConfigureSidebar && <SidebarModulesCard />}
      </div>
    </div>
  )
}
