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
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Clapperboard,
  History,
  ImagePlus,
  KeyRound,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/stores/auth-store'

import {
  CreationError,
  isCreationOwner,
  listCreationModels,
  listCreationTokens,
  submitCreation,
  type CreationKind,
  type CreationOwner,
  type GeneratedImage,
} from './api'
import { ImageResult } from './image-results'
import { creationFormSchema, type CreationFormValues } from './lib/form'
import { VideoTaskResult } from './video-task'

interface CreationPageProps {
  kind: CreationKind
  taskId?: string
  onTaskChange?: (taskId: string) => void
}

export function CreationPage(props: CreationPageProps) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  if (!userId || !sessionId) {
    return <p className='p-6'>{t('Sign in to start creating.')}</p>
  }
  return (
    <CreationWorkspace
      key={`${userId}:${sessionId}:${props.kind}`}
      {...props}
      owner={{ userId, sessionId }}
    />
  )
}

function CreationWorkspace(
  props: CreationPageProps & { owner: CreationOwner }
) {
  const { t } = useTranslation()
  const { owner, kind } = props
  const request = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [images, setImages] = useState<
    Array<{ id: string; image: GeneratedImage }>
  >([])
  const [submittedTaskId, setSubmittedTaskId] = useState<string>()
  const form = useForm<CreationFormValues>({
    resolver: zodResolver(creationFormSchema),
    defaultValues: {
      tokenId: '',
      model: '',
      prompt: '',
      size: '',
      seconds: '',
    },
  })
  const tokenId = form.watch('tokenId')
  const tokensQuery = useQuery({
    queryKey: ['creation', owner.userId, owner.sessionId, 'tokens'],
    queryFn: ({ signal }) => listCreationTokens(owner, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
  })
  const modelsQuery = useQuery({
    queryKey: [
      'creation',
      owner.userId,
      owner.sessionId,
      kind,
      'models',
      tokenId,
    ],
    queryFn: ({ signal }) =>
      listCreationModels({ owner, tokenId: Number(tokenId), kind, signal }),
    enabled:
      Boolean(tokenId) &&
      tokensQuery.data?.some((token) => String(token.id) === tokenId),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
  })
  const models = modelsQuery.data
  const taskId = props.onTaskChange ? props.taskId : submittedTaskId
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (models?.length === 1) form.setValue('model', models[0].id)
  }, [models, form])

  async function onSubmit(values: CreationFormValues) {
    if (request.current || !isCreationOwner(owner)) return
    if (
      !tokensQuery.data?.some((token) => String(token.id) === values.tokenId)
    ) {
      form.setError('tokenId', { message: 'Choose an API key.' })
      return
    }
    if (!models?.some((model) => model.id === values.model)) {
      form.setError('model', { message: 'Choose an available model.' })
      return
    }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(undefined)
    setImages([])
    try {
      const result = await submitCreation({
        owner,
        tokenId: Number(values.tokenId),
        kind,
        draft: values,
        signal: controller.signal,
      })
      if (controller.signal.aborted || !isCreationOwner(owner)) return
      if (result.kind === 'images') {
        setImages(
          result.images.map((image) => ({ id: crypto.randomUUID(), image }))
        )
      } else {
        setSubmittedTaskId(result.taskId)
        props.onTaskChange?.(result.taskId)
      }
    } catch (caught) {
      if (controller.signal.aborted || !isCreationOwner(owner)) return
      setError(
        caught instanceof CreationError
          ? caught.message
          : 'Unable to complete this request. Please try again.'
      )
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted && isCreationOwner(owner)) setBusy(false)
    }
  }

  let submitLabel = kind === 'image' ? t('Generate image') : t('Generate video')
  if (busy) submitLabel = t('Submitting...')

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {kind === 'image' ? t('Image generation') : t('Video generation')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          type='button'
          variant='outline'
          nativeButton={false}
          render={
            <Link to='/usage-logs/$section' params={{ section: 'task' }} />
          }
        >
          <History data-icon='inline-start' />
          {t('Task records')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-7xl space-y-5'>
          <div className='from-primary/10 to-accent/30 border-primary/10 flex items-center gap-4 rounded-2xl border bg-gradient-to-r px-5 py-4'>
            <img
              src='/branding/lulu/lounge.png'
              alt=''
              className='size-14 shrink-0 rounded-2xl object-cover object-[50%_60%]'
            />
            <div className='min-w-0'>
              <p className='text-base font-semibold'>
                {kind === 'image'
                  ? t('Give your imagination a picture.')
                  : t('Let your ideas move.')}
              </p>
              <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                {kind === 'image'
                  ? t('Describe a scene, choose a model, and create with Lulu.')
                  : t(
                      'Describe the scene and motion. Lulu will keep an eye on your video task.'
                    )}
              </p>
            </div>
          </div>
          <div className='grid items-start gap-5 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]'>
            <section
              className='bg-card min-w-0 rounded-2xl border p-5 shadow-xs sm:p-6'
              aria-label={t('Generation settings')}
            >
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-5'
                >
                  <FormField
                    control={form.control}
                    name='tokenId'
                    render={({ field }) => (
                      <FormItem>
                        <div className='flex items-center justify-between gap-2'>
                          <FormLabel>{t('API key')}</FormLabel>
                          <Link
                            to='/keys'
                            className='text-primary inline-flex items-center gap-1 text-xs hover:underline'
                          >
                            {t('Manage keys')}
                            <ArrowUpRight className='size-3' />
                          </Link>
                        </div>
                        <Select
                          value={field.value || null}
                          onValueChange={(value) => {
                            field.onChange(value ?? '')
                            form.setValue('model', '')
                            form.clearErrors('model')
                          }}
                          disabled={busy || tokensQuery.isPending}
                        >
                          <FormControl>
                            <SelectTrigger className='h-10 w-full'>
                              <SelectValue
                                placeholder={t('Choose an API key.')}
                              >
                                {(value) => {
                                  if (!value) return t('Choose an API key.')
                                  return (
                                    tokensQuery.data?.find(
                                      (token) => String(token.id) === value
                                    )?.name || t('Unnamed API key')
                                  )
                                }}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tokensQuery.data?.map((token) => (
                              <SelectItem
                                key={token.id}
                                value={String(token.id)}
                              >
                                {token.name || t('Unnamed API key')}{' '}
                                <span className='text-muted-foreground'>
                                  #{token.id}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t(
                            'Uses the balance, model permissions and limits of this key.'
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {tokensQuery.isPending && (
                    <p className='text-muted-foreground flex items-center gap-2 text-sm'>
                      <Spinner />
                      {t('Loading API keys...')}
                    </p>
                  )}
                  {tokensQuery.isError && (
                    <Alert variant='destructive'>
                      <AlertTitle>{t('Unable to load API keys.')}</AlertTitle>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={tokensQuery.isFetching}
                        onClick={() => void tokensQuery.refetch()}
                      >
                        {t('Retry')}
                      </Button>
                    </Alert>
                  )}
                  {tokensQuery.data?.length === 0 && (
                    <Alert>
                      <KeyRound aria-hidden='true' />
                      <AlertTitle>{t('No usable API keys')}</AlertTitle>
                      <AlertDescription>
                        {t(
                          'Add or enable a key with available balance in API key management, then refresh this page.'
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormField
                    control={form.control}
                    name='model'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Model')}</FormLabel>
                        <Select
                          value={field.value || null}
                          onValueChange={(value) => field.onChange(value ?? '')}
                          disabled={busy || !models?.length}
                        >
                          <FormControl>
                            <SelectTrigger className='h-10 w-full'>
                              <SelectValue placeholder={t('Choose a model.')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {models?.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!tokenId && (
                    <p className='text-muted-foreground text-sm'>
                      {t('Choose a key to see the models available to it.')}
                    </p>
                  )}
                  {tokenId && modelsQuery.isFetching && (
                    <p className='text-muted-foreground flex items-center gap-2 text-sm'>
                      <Spinner />
                      {t('Loading available models...')}
                    </p>
                  )}
                  {modelsQuery.isError && (
                    <Alert variant='destructive'>
                      <AlertTitle>
                        {t('Unable to load models. Please try again.')}
                      </AlertTitle>
                      <AlertDescription>
                        {t(
                          modelsQuery.error instanceof CreationError
                            ? modelsQuery.error.message
                            : 'Unable to complete this request. Please try again.'
                        )}
                      </AlertDescription>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={modelsQuery.isFetching}
                        onClick={() => void modelsQuery.refetch()}
                      >
                        {t('Retry')}
                      </Button>
                    </Alert>
                  )}
                  {models?.length === 0 && (
                    <Alert>
                      <AlertTitle>
                        {kind === 'image'
                          ? t('No image models available')
                          : t('No video models available')}
                      </AlertTitle>
                      <AlertDescription>
                        {t(
                          'This key has no models with the required generation capability. Choose another key or ask an administrator to configure a compatible model.'
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormField
                    control={form.control}
                    name='prompt'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Prompt')}</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            disabled={busy}
                            maxLength={32_000}
                            className='min-h-36 resize-y leading-relaxed'
                            placeholder={
                              kind === 'image'
                                ? t(
                                    'Describe the subject, setting, light and style...'
                                  )
                                : t(
                                    'Describe the scene, movement, camera and atmosphere...'
                                  )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Collapsible>
                    <CollapsibleTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='text-muted-foreground px-0'
                        />
                      }
                    >
                      <SlidersHorizontal data-icon='inline-start' />
                      {t('Optional settings')}
                    </CollapsibleTrigger>
                    <CollapsibleContent className='space-y-4 pt-3'>
                      <p className='text-muted-foreground text-xs leading-relaxed'>
                        {t(
                          'Leave these empty to use the model defaults. Supported values depend on the model.'
                        )}
                      </p>
                      <FormField
                        control={form.control}
                        name='size'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Size')}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                disabled={busy}
                                placeholder={t('Model default')}
                                className='h-10'
                              />
                            </FormControl>
                            <FormDescription>
                              {t('Width x height, such as 1024x1024.')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {kind === 'video' && (
                        <FormField
                          control={form.control}
                          name='seconds'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('Duration (seconds)')}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  disabled={busy}
                                  inputMode='numeric'
                                  placeholder={t('Model default')}
                                  className='h-10'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                  {error && (
                    <Alert variant='destructive'>
                      <AlertTitle>
                        {t('Generation could not be completed')}
                      </AlertTitle>
                      <AlertDescription>{t(error)}</AlertDescription>
                    </Alert>
                  )}
                  <div className='space-y-3 border-t pt-5'>
                    <Button
                      type='submit'
                      className='h-11 w-full rounded-xl'
                      disabled={
                        busy ||
                        !models?.length ||
                        tokensQuery.isError ||
                        modelsQuery.isError
                      }
                    >
                      {busy ? (
                        <Spinner data-icon='inline-start' />
                      ) : (
                        <Sparkles data-icon='inline-start' />
                      )}
                      {submitLabel}
                    </Button>
                    <p className='text-muted-foreground text-center text-xs leading-relaxed'>
                      {t(
                        'Generation uses your account balance at the selected model rate.'
                      )}
                    </p>
                  </div>
                </form>
              </Form>
            </section>
            <section
              className='bg-card min-w-0 rounded-2xl border p-5 shadow-xs sm:p-6'
              aria-label={t('Generation result')}
            >
              <h3 className='mb-5 text-base font-semibold'>
                {t('Generation result')}
              </h3>
              {busy && (
                <div
                  className='bg-primary/5 flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl px-5 text-center'
                  role='status'
                >
                  <Spinner className='text-primary size-6' />
                  <p className='font-medium'>
                    {kind === 'image'
                      ? t('Creating your image...')
                      : t('Submitting your video task...')}
                  </p>
                  <p className='text-muted-foreground max-w-sm text-sm'>
                    {t('Please keep this page open until the request returns.')}
                  </p>
                </div>
              )}
              {!busy && images.length > 0 && (
                <div className='space-y-5'>
                  <Alert>
                    <AlertDescription>
                      {t(
                        'Download images before leaving this page. Image previews are not saved as a gallery.'
                      )}
                    </AlertDescription>
                  </Alert>
                  {images.map((result, index) => (
                    <ImageResult
                      key={result.id}
                      image={result.image}
                      position={index + 1}
                    />
                  ))}
                </div>
              )}
              {!busy && kind === 'video' && taskId && (
                <VideoTaskResult key={taskId} owner={owner} taskId={taskId} />
              )}
              {!busy &&
                images.length === 0 &&
                !(kind === 'video' && taskId) && (
                  <Empty className='bg-muted/20 min-h-96 border'>
                    <EmptyHeader>
                      <EmptyMedia
                        variant='icon'
                        className='bg-primary/10 text-primary size-14 rounded-2xl'
                      >
                        {kind === 'image' ? (
                          <ImagePlus className='size-6' />
                        ) : (
                          <Clapperboard className='size-6' />
                        )}
                      </EmptyMedia>
                      <EmptyTitle>
                        {kind === 'image'
                          ? t('Your next image starts here')
                          : t('Your next video starts here')}
                      </EmptyTitle>
                      <EmptyDescription>
                        {kind === 'image'
                          ? t(
                              'Your generated image will appear here, ready to preview and download.'
                            )
                          : t(
                              'After submitting, track the task here and preview the finished video.'
                            )}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
            </section>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
