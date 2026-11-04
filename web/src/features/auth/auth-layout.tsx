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
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='lulu-auth-layout'>
      <header className='lulu-auth-header'>
        <Link
          to='/'
          className='flex items-center gap-2.5 font-semibold transition-opacity hover:opacity-80'
        >
          {loading ? (
            <Skeleton className='size-9 rounded-xl' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='size-9 rounded-xl object-cover'
            />
          )}
          {loading ? (
            <Skeleton className='h-6 w-24' />
          ) : (
            <span className='text-lg'>{systemName}</span>
          )}
        </Link>
        <Button
          variant='ghost'
          size='sm'
          className='gap-2'
          render={<Link to='/' />}
        >
          <ArrowLeft className='size-4' aria-hidden='true' />
          {t('Back to home')}
        </Button>
      </header>

      <main className='lulu-auth-main'>
        <div className='lulu-auth-frame'>
          <aside className='lulu-auth-scene'>
            <img
              src='/branding/lulu/lounge.png'
              alt=''
              className='lulu-auth-art'
            />
            <div className='lulu-auth-scene-copy'>
              <span className='lulu-auth-eyebrow'>
                {t('Welcome to Lulu API')}
              </span>
              <p className='lulu-auth-headline'>
                {t('A little calm, a lot of possibility')}
              </p>
              <p className='lulu-auth-scene-detail'>
                {t('One API for your ideas. Lulu is ready to create with you.')}
              </p>
            </div>
          </aside>
          <div className='lulu-auth-panel'>
            <div className='lulu-auth-form'>{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
