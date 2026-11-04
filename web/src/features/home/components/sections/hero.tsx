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
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    typeof status?.docs_link === 'string' && status.docs_link
      ? status.docs_link
      : 'https://docs.newapi.pro'

  return (
    <section
      className={cn('px-4 pt-24 pb-6 sm:px-8 sm:pt-28', props.className)}
    >
      <div className='relative mx-auto min-h-[34rem] max-w-6xl overflow-hidden rounded-3xl border border-sky-100 bg-[#dceff8] text-[#344b40] sm:min-h-[30rem] dark:border-slate-700 dark:bg-[#273d46] dark:text-[#edf2e5]'>
        <img
          src='/branding/lulu/pool.png'
          alt=''
          width={1024}
          height={1024}
          fetchPriority='high'
          className='pointer-events-none absolute right-0 bottom-0 h-3/5 w-full [mask-image:linear-gradient(to_bottom,transparent,black_65%)] object-cover object-center sm:top-0 sm:h-full sm:w-3/5 sm:[mask-image:linear-gradient(to_right,transparent,black_35%)] dark:opacity-60'
        />
        <div className='relative z-10 max-w-xl px-7 py-9 sm:w-3/5 sm:px-12 sm:py-14'>
          <span className='inline-flex rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-xs text-[#5b7650] dark:border-white/15 dark:bg-white/10 dark:text-[#d5e5bf]'>
            {t('Welcome to Lulu API')}
          </span>
          <h1 className='mt-5 text-3xl leading-snug font-semibold tracking-tight sm:text-4xl lg:text-5xl'>
            {t('Give your ideas room to grow.')}
          </h1>
          <p className='mt-5 max-w-sm text-sm leading-relaxed text-[#516c65] dark:text-[#c4d2c7]'>
            {t(
              'Familiar APIs, your favorite models. Let Lulu keep you company while you create.'
            )}
          </p>
          <div className='mt-7 flex flex-wrap items-center gap-3'>
            <Button
              size='lg'
              className='h-10 px-5'
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-in'} />
              }
            >
              {props.isAuthenticated ? t('Go to Dashboard') : t('Sign In')}
              <ArrowRight aria-hidden='true' />
            </Button>
            <Button
              variant='outline'
              size='lg'
              className='dark:bg-background/75 h-10 bg-white/75 px-4'
              render={
                <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
              }
            >
              <BookOpen aria-hidden='true' />
              {t('Docs')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
