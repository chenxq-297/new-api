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
import { Coins, KeyRound, Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function Features() {
  const { t } = useTranslation()
  const features = [
    {
      title: t('One place to connect'),
      description: t('Connect your favorite AI models through a unified API.'),
      icon: Network,
      tone: 'bg-primary/10 text-primary',
    },
    {
      title: t('Understand every expense'),
      description: t(
        'Track usage and costs for each request in your dashboard.'
      ),
      icon: Coins,
      tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    },
    {
      title: t('Start at your own pace'),
      description: t(
        'Create an API key, choose a model, and start your next project.'
      ),
      icon: KeyRound,
      tone: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    },
  ]

  return (
    <section className='px-4 pb-12 sm:px-8 sm:pb-20' aria-label={t('Features')}>
      <div className='mx-auto grid max-w-6xl gap-4 md:grid-cols-3'>
        {features.map((feature) => (
          <article
            key={feature.title}
            className='bg-card rounded-2xl border p-6 sm:p-7'
          >
            <span
              className={`inline-flex size-9 items-center justify-center rounded-xl ${feature.tone}`}
            >
              <feature.icon className='size-4' aria-hidden='true' />
            </span>
            <h2 className='mt-5 text-base font-semibold'>{feature.title}</h2>
            <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
              {feature.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
