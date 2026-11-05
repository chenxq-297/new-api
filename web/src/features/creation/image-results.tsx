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
import { Download, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import type { GeneratedImage } from './api'

export function ImageResult(props: {
  image: GeneratedImage
  position: number
}) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const image = props.image
  useEffect(() => {
    setFailed(false)
    if (image.kind !== 'blob') return
    const url = URL.createObjectURL(image.blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])
  const url = image.kind === 'remote' ? image.url : blobUrl
  let extension = 'png'
  if (image.kind === 'blob' && image.blob.type === 'image/jpeg') {
    extension = 'jpg'
  }
  if (image.kind === 'blob' && image.blob.type === 'image/webp') {
    extension = 'webp'
  }

  let preview = <Skeleton className='aspect-square w-full rounded-2xl' />
  if (failed) {
    preview = (
      <Alert variant='destructive'>
        <ImageOff aria-hidden='true' />
        <AlertTitle>{t('Image preview unavailable')}</AlertTitle>
        <AlertDescription>
          {t('The image link may have expired. Try opening the download link.')}
        </AlertDescription>
      </Alert>
    )
  } else if (url) {
    preview = (
      <img
        src={url}
        alt={t('Generated image {{number}}', { number: props.position })}
        className='bg-muted/30 max-h-[70vh] w-full rounded-2xl object-contain'
        referrerPolicy='no-referrer'
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {preview}
      {url && (
        <Button
          type='button'
          variant='outline'
          nativeButton={false}
          render={
            <a
              href={url}
              download={`lulu-image-${props.position}.${extension}`}
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          <Download data-icon='inline-start' />
          {t('Download image')}
        </Button>
      )}
      {image.revisedPrompt && (
        <p className='text-muted-foreground text-sm leading-relaxed wrap-anywhere'>
          {image.revisedPrompt}
        </p>
      )}
    </div>
  )
}
