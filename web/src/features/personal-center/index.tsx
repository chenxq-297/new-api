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
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { ProfileContent } from '@/features/profile'
import { ProfileHeader } from '@/features/profile/components/profile-header'
import { SidebarModulesCard } from '@/features/profile/components/sidebar-modules-card'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { SecurityContent } from '@/features/security'
import { WalletContent } from '@/features/wallet'
import { BillingHistoryDialog } from '@/features/wallet/components/dialogs/billing-history-dialog'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useAuthStore } from '@/stores/auth-store'

interface PersonalCenterProps {
  initialShowHistory?: boolean
}

export function PersonalCenter(props: PersonalCenterProps) {
  const { t } = useTranslation()
  const account = useProfile()
  const walletVisible = useIsSidebarModuleVisible('/wallet')
  const profileVisible = useIsSidebarModuleVisible('/profile')
  const securityVisible = useIsSidebarModuleVisible('/security')
  const canConfigureSidebar = useAuthStore(
    (state) => state.auth.user?.permissions?.sidebar_settings !== false
  )
  const [billingOpen, setBillingOpen] = useState(false)
  const navigate = useNavigate()
  const hash = useLocation({ select: (location) => location.hash })

  useEffect(() => {
    if (!props.initialShowHistory) return
    setBillingOpen(true)
    void navigate({
      to: '/profile',
      search: {},
      hash: true,
      replace: true,
      resetScroll: false,
    })
  }, [props.initialShowHistory, navigate])

  useEffect(() => {
    if (!account.loading && hash) {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    }
  }, [account.loading, hash])

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Personal Center')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-8 pb-4'>
            <ProfileHeader
              profile={account.profile}
              loading={account.loading}
            />

            {walletVisible && (
              <section
                id='wallet'
                aria-labelledby='wallet-heading'
                className='scroll-mt-4 space-y-4'
              >
                <h3 id='wallet-heading' className='text-lg font-semibold'>
                  {t('Wallet')}
                </h3>
                <WalletContent
                  user={account.profile}
                  onUserUpdate={account.refreshProfile}
                  onOpenBilling={() => setBillingOpen(true)}
                />
              </section>
            )}

            {profileVisible && (
              <section
                id='personal-details'
                aria-labelledby='profile-heading'
                className='scroll-mt-4 space-y-4'
              >
                <h3 id='profile-heading' className='text-lg font-semibold'>
                  {t('Profile')}
                </h3>
                <ProfileContent
                  profile={account.profile}
                  loading={account.loading}
                  onProfileUpdate={account.refreshProfile}
                />
              </section>
            )}

            {securityVisible && (
              <section
                id='security'
                aria-labelledby='security-heading'
                className='scroll-mt-4 space-y-4'
              >
                <h3 id='security-heading' className='text-lg font-semibold'>
                  {t('Security & Access')}
                </h3>
                <SecurityContent
                  profile={account.profile}
                  loading={account.loading}
                  onProfileUpdate={account.refreshProfile}
                  onRetry={account.fetchProfile}
                />
              </section>
            )}
            {!profileVisible && canConfigureSidebar && <SidebarModulesCard />}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {billingOpen && (
        <BillingHistoryDialog
          open={billingOpen}
          onOpenChange={setBillingOpen}
        />
      )}
    </>
  )
}
