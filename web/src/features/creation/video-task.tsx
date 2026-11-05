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
import { useQuery } from '@tanstack/react-query'
import { CircleCheck, Clock3, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { TaskResultPreview } from '@/features/usage-logs/components/task-artifacts'

import {
  CreationError,
  readCreationArtifacts,
  readCreationTask,
  type CreationOwner,
} from './api'

export function VideoTaskResult(props: {
  owner: CreationOwner
  taskId: string
}) {
  const { t } = useTranslation()
  const { owner, taskId } = props
  const taskQuery = useQuery({
    queryKey: ['creation', owner.userId, owner.sessionId, 'task', taskId],
    queryFn: ({ signal }) => readCreationTask({ owner, taskId, signal }),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
    refetchInterval: (query) => {
      if (query.state.error) return false
      if (query.state.data === null) {
        return query.state.dataUpdateCount < 10 ? 3000 : false
      }
      return query.state.data?.phase === 'waiting' ||
        query.state.data?.phase === 'running'
        ? 3000
        : false
    },
  })
  const task = taskQuery.data
  const artifactsQuery = useQuery({
    queryKey: ['creation', owner.userId, owner.sessionId, 'artifacts', taskId],
    queryFn: ({ signal }) => readCreationArtifacts({ owner, taskId, signal }),
    enabled: task?.phase === 'complete' && task.retained,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
  })
  const missing = task === null

  return (
    <div className='space-y-5' aria-live='polite'>
      <div className='flex min-w-0 items-center gap-2 text-sm'>
        <Video className='text-primary size-4 shrink-0' aria-hidden='true' />
        <span className='text-muted-foreground'>{t('Task ID')}</span>
        <span className='min-w-0 truncate font-mono text-xs' title={taskId}>
          {taskId}
        </span>
      </div>
      {taskQuery.isPending && (
        <p className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Spinner />
          {t('Loading generation task...')}
        </p>
      )}
      {taskQuery.isError && (
        <Alert variant='destructive'>
          <AlertTitle>{t('Unable to load the generation task.')}</AlertTitle>
          <AlertDescription>
            {t(
              taskQuery.error instanceof CreationError
                ? taskQuery.error.message
                : 'This task is unavailable.'
            )}
          </AlertDescription>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void taskQuery.refetch()}
            disabled={taskQuery.isFetching}
          >
            {t('Retry')}
          </Button>
        </Alert>
      )}
      {missing && (
        <Alert>
          <Clock3 aria-hidden='true' />
          <AlertTitle>{t('Waiting for the task record')}</AlertTitle>
          <AlertDescription>
            {t(
              'New tasks can take a moment to appear. If this task does not appear, check your task records.'
            )}
          </AlertDescription>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={taskQuery.isFetching}
            onClick={() => void taskQuery.refetch()}
          >
            {t('Refresh')}
          </Button>
        </Alert>
      )}
      {(task?.phase === 'waiting' || task?.phase === 'running') && (
        <div className='bg-primary/5 border-primary/15 space-y-5 rounded-2xl border p-5'>
          <Badge variant='secondary'>
            <Spinner />
            {task.phase === 'waiting'
              ? t('Queued for generation')
              : t('Generating your video')}
          </Badge>
          <Progress value={task.progress}>
            <ProgressLabel>{t('Generation progress')}</ProgressLabel>
            <ProgressValue />
          </Progress>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t(
              'You can leave this page and return from task records. Keep this page link to reopen the current task.'
            )}
          </p>
        </div>
      )}
      {task?.phase === 'complete' && (
        <div className='space-y-4'>
          <p className='text-primary flex items-center gap-2 text-sm font-medium'>
            <CircleCheck className='size-4' />
            {t('Your video is ready')}
          </p>
          {!task.retained && (
            <Alert>
              <AlertTitle>{t('Result not retained')}</AlertTitle>
              <AlertDescription>
                {t(
                  'This task completed without a saved artifact. Check task records for details.'
                )}
              </AlertDescription>
            </Alert>
          )}
          {task.retained && artifactsQuery.isPending && (
            <p className='text-muted-foreground flex items-center gap-2 text-sm'>
              <Spinner />
              {t('Loading...')}
            </p>
          )}
          {task.retained && artifactsQuery.isError && (
            <Alert variant='destructive'>
              <AlertTitle>{t('Failed to load artifacts')}</AlertTitle>
              <AlertDescription>
                {t(
                  'The task is complete. You can retry loading the result without generating again.'
                )}
              </AlertDescription>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={artifactsQuery.isFetching}
                onClick={() => void artifactsQuery.refetch()}
              >
                {t('Retry')}
              </Button>
            </Alert>
          )}
          {task.retained && artifactsQuery.data && (
            <TaskResultPreview result={artifactsQuery.data} />
          )}
        </div>
      )}
      {task?.phase === 'failed' && (
        <Alert variant='destructive'>
          <AlertTitle>{t('Video generation failed')}</AlertTitle>
          <AlertDescription>
            {t(
              'Open task records for the failure details. No new generation has been submitted.'
            )}
          </AlertDescription>
        </Alert>
      )}
      {task?.phase === 'unknown' && (
        <Alert>
          <AlertTitle>{t('Task status unavailable')}</AlertTitle>
          <AlertDescription>
            {t('Check task records before submitting again.')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
