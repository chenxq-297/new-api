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
import { z } from 'zod'

import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { apiKeySchema } from '@/features/keys/types'
import { getTaskArtifacts, getUserTaskLogs } from '@/features/usage-logs/api'
import { useAuthStore } from '@/stores/auth-store'

export type CreationKind = 'image' | 'video'
export type CreationOwner = { userId: number; sessionId: string }
export type CreationModel = { id: string }
export type CreationDraft = {
  model: string
  prompt: string
  size: string
  seconds: string
}
export type GeneratedImage =
  | { kind: 'remote'; url: string; revisedPrompt?: string }
  | { kind: 'blob'; blob: Blob; revisedPrompt?: string }
export type CreationResult =
  | { kind: 'images'; images: GeneratedImage[] }
  | { kind: 'video'; taskId: string }
export type VideoTask =
  | { phase: 'waiting' | 'running'; id: string; progress: number }
  | { phase: 'complete'; id: string; retained: boolean }
  | { phase: 'failed' | 'unknown'; id: string }

const tokenChoiceSchema = apiKeySchema.pick({
  id: true,
  name: true,
  status: true,
  expired_time: true,
  remain_quota: true,
  unlimited_quota: true,
})
export type CreationToken = z.infer<typeof tokenChoiceSchema>
const tokenListSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(tokenChoiceSchema),
    total: z.number().int().nonnegative(),
  }),
})
const keySchema = z.object({
  success: z.literal(true),
  data: z.object({
    key: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/),
  }),
})
const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1).max(256),
      supported_endpoint_types: z.array(z.string()).nullish(),
    })
  ),
})
const imagePayloadSchema = z.object({
  url: z.string().nullish(),
  b64_json: z.string().nullish(),
  revised_prompt: z.string().max(32_000).nullish(),
})
const imagesSchema = z.object({
  data: z.union([
    imagePayloadSchema,
    z.array(imagePayloadSchema).min(1).max(16),
  ]),
})
const taskIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/)
const videoSubmissionSchema = z.object({ id: taskIdSchema })
const taskListSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(
      z.object({
        task_id: taskIdSchema,
        user_id: z.number(),
        status: z.string(),
        progress: z.string().nullish(),
        result_discarded: z.boolean().optional(),
      })
    ),
  }),
})

export class CreationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreationError'
  }
}

export function isCreationOwner(owner: CreationOwner): boolean {
  const { auth } = useAuthStore.getState()
  return (
    auth.user?.id === owner.userId &&
    auth.session?.sid === owner.sessionId &&
    Boolean(auth.accessToken)
  )
}

function assertOwner(owner: CreationOwner, signal: AbortSignal): void {
  if (signal.aborted || !isCreationOwner(owner)) {
    throw new DOMException('Creation request no longer active', 'AbortError')
  }
}

async function ownedOperation<T>(
  owner: CreationOwner,
  signal: AbortSignal,
  operation: (activeSignal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!isCreationOwner(owner)) controller.abort()
  })
  try {
    assertOwner(owner, signal)
    const result = await operation(controller.signal)
    assertOwner(owner, controller.signal)
    return result
  } catch (error) {
    if (
      signal.aborted ||
      controller.signal.aborted ||
      !isCreationOwner(owner)
    ) {
      throw new DOMException('Creation request no longer active', 'AbortError')
    }
    if (error instanceof CreationError) throw error
    throw new CreationError(
      'Unable to complete this request. Please try again.'
    )
  } finally {
    unsubscribe()
    signal.removeEventListener('abort', abort)
  }
}

export function listCreationTokens(
  owner: CreationOwner,
  signal: AbortSignal
): Promise<CreationToken[]> {
  return ownedOperation(owner, signal, async (activeSignal) => {
    const tokens = new Map<number, CreationToken>()
    for (let page = 1; page <= 1000; page++) {
      assertOwner(owner, activeSignal)
      const parsed = tokenListSchema.safeParse(
        await getApiKeys({ p: page, size: 100 })
      )
      assertOwner(owner, activeSignal)
      if (!parsed.success) throw new CreationError('Unable to load API keys.')
      const { items, total } = parsed.data.data
      const previousSize = tokens.size
      for (const token of items) tokens.set(token.id, token)
      if (tokens.size >= total) {
        const now = Date.now() / 1000
        return [...tokens.values()].filter(
          (token) =>
            token.status === 1 &&
            (token.expired_time === -1 || token.expired_time > now) &&
            (token.unlimited_quota || token.remain_quota > 0)
        )
      }
      if (tokens.size === previousSize) break
    }
    throw new CreationError('Unable to load API keys.')
  })
}

async function relayRequest(input: {
  owner: CreationOwner
  tokenId: number
  path: '/v1/models' | '/v1/images/generations' | '/v1/videos'
  signal: AbortSignal
  body?: object
}): Promise<unknown> {
  return ownedOperation(input.owner, input.signal, async (signal) => {
    const keyResult = keySchema.safeParse(await fetchTokenKey(input.tokenId))
    assertOwner(input.owner, signal)
    if (!keyResult.success) {
      throw new CreationError('Unable to use this API key. Choose another key.')
    }
    const value = keyResult.data.data.key
    const key = value.startsWith('sk-') ? value : `sk-${value}`
    let response: Response
    try {
      response = await fetch(input.path, {
        method: input.body ? 'POST' : 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      })
    } catch {
      assertOwner(input.owner, signal)
      throw new CreationError(
        input.body
          ? 'The connection was interrupted. The request may still be processing; submitting again can create another charge.'
          : 'Unable to load models. Please try again.'
      )
    }
    assertOwner(input.owner, signal)
    if (response.status === 401 || response.status === 403) {
      throw new CreationError(
        'This API key cannot access this model. Choose another key or model.'
      )
    }
    if (response.status === 429) {
      throw new CreationError(
        'The request limit was reached. Please try again later.'
      )
    }
    if (!response.ok) {
      throw new CreationError(
        'Generation failed. Check the model parameters, balance and channel configuration.'
      )
    }
    try {
      const result: unknown = await response.json()
      assertOwner(input.owner, signal)
      return result
    } catch {
      assertOwner(input.owner, signal)
      throw new CreationError(
        input.body
          ? 'The response could not be read. The request may have completed; check usage or task records before submitting again.'
          : 'Unable to load models. Please try again.'
      )
    }
  })
}

export async function listCreationModels(input: {
  owner: CreationOwner
  tokenId: number
  kind: CreationKind
  signal: AbortSignal
}): Promise<CreationModel[]> {
  const response = await relayRequest({ ...input, path: '/v1/models' })
  assertOwner(input.owner, input.signal)
  const result = modelsSchema.safeParse(response)
  if (!result.success) {
    throw new CreationError('Unable to load models. Please try again.')
  }
  const endpoint = input.kind === 'image' ? 'image-generation' : 'openai-video'
  return [
    ...new Set(
      result.data.data
        .filter((model) => model.supported_endpoint_types?.includes(endpoint))
        .map((model) => model.id)
    ),
  ].map((id) => ({ id }))
}

function generatedImages(value: unknown): GeneratedImage[] {
  const parsed = imagesSchema.safeParse(value)
  if (!parsed.success) {
    throw new CreationError('The model returned no usable images.')
  }
  const entries = Array.isArray(parsed.data.data)
    ? parsed.data.data
    : [parsed.data.data]
  const payloads = entries.filter((image) => image.url || image.b64_json)
  if (!payloads.length || payloads.length > 8) {
    throw new CreationError('The model returned no usable images.')
  }
  return payloads.map((image): GeneratedImage => {
    const revisedPrompt = image.revised_prompt || undefined
    if (image.b64_json) {
      const encoded = image.b64_json
      if (
        encoded.length > 32 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      ) {
        throw new CreationError('The model returned no usable images.')
      }
      let binary: string
      try {
        binary = atob(encoded)
      } catch {
        throw new CreationError('The model returned no usable images.')
      }
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      let mime: string
      if (
        bytes.length >= 8 &&
        bytes[0] === 137 &&
        binary.slice(1, 8) === 'PNG\r\n\x1a\n'
      ) {
        mime = 'image/png'
      } else if (
        bytes.length >= 3 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255
      ) {
        mime = 'image/jpeg'
      } else if (
        bytes.length >= 12 &&
        binary.slice(0, 4) === 'RIFF' &&
        binary.slice(8, 12) === 'WEBP'
      ) {
        mime = 'image/webp'
      } else throw new CreationError('The model returned no usable images.')
      return {
        kind: 'blob',
        blob: new Blob([bytes], { type: mime }),
        revisedPrompt,
      }
    }
    try {
      if (!image.url || image.url.length > 16_384) throw new Error()
      const url = new URL(image.url)
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        /sk-[a-z0-9]{10,}/i.test(image.url) ||
        [...url.searchParams.keys()].some((key) =>
          /^(api[_-]?key|authorization|token)$/i.test(key)
        )
      ) {
        throw new Error()
      }
      return { kind: 'remote', url: url.href, revisedPrompt }
    } catch {
      throw new CreationError('The model returned no usable images.')
    }
  })
}

export async function submitCreation(input: {
  owner: CreationOwner
  tokenId: number
  kind: CreationKind
  draft: CreationDraft
  signal: AbortSignal
}): Promise<CreationResult> {
  const body = {
    model: input.draft.model,
    prompt: input.draft.prompt,
    ...(input.draft.size ? { size: input.draft.size } : {}),
  }
  if (input.kind === 'image') {
    const response = await relayRequest({
      ...input,
      path: '/v1/images/generations',
      body: { ...body, n: 1, stream: false },
    })
    assertOwner(input.owner, input.signal)
    return { kind: 'images', images: generatedImages(response) }
  }
  const response = await relayRequest({
    ...input,
    path: '/v1/videos',
    body: {
      ...body,
      ...(input.draft.seconds ? { seconds: input.draft.seconds } : {}),
    },
  })
  assertOwner(input.owner, input.signal)
  const parsed = videoSubmissionSchema.safeParse(response)
  if (!parsed.success) {
    throw new CreationError(
      'The model returned no task ID. Check task records before submitting again.'
    )
  }
  return { kind: 'video', taskId: parsed.data.id }
}

export function readCreationTask(input: {
  owner: CreationOwner
  taskId: string
  signal: AbortSignal
}): Promise<VideoTask | null> {
  return ownedOperation(input.owner, input.signal, async (signal) => {
    if (!taskIdSchema.safeParse(input.taskId).success) {
      throw new CreationError('This task is unavailable.')
    }
    const response = await getUserTaskLogs({
      task_id: input.taskId,
      p: 1,
      page_size: 1,
    })
    assertOwner(input.owner, signal)
    const parsed = taskListSchema.safeParse(response)
    if (!parsed.success) {
      throw new CreationError('Unable to load the generation task.')
    }
    if (!parsed.data.data.items.length) return null
    const task = parsed.data.data.items[0]
    if (
      !task ||
      task.task_id !== input.taskId ||
      task.user_id !== input.owner.userId
    ) {
      throw new CreationError('This task is unavailable.')
    }
    if (task.status === 'SUCCESS') {
      return {
        phase: 'complete',
        id: task.task_id,
        retained: !task.result_discarded,
      }
    }
    if (task.status === 'FAILURE') return { phase: 'failed', id: task.task_id }
    if (
      ['NOT_START', 'SUBMITTED', 'QUEUED', 'IN_PROGRESS'].includes(task.status)
    ) {
      const rawProgress = Number.parseInt(task.progress || '0', 10)
      return {
        phase: task.status === 'IN_PROGRESS' ? 'running' : 'waiting',
        id: task.task_id,
        progress: Number.isFinite(rawProgress)
          ? Math.max(0, Math.min(100, rawProgress))
          : 0,
      }
    }
    return { phase: 'unknown', id: task.task_id }
  })
}

export function readCreationArtifacts(input: {
  owner: CreationOwner
  taskId: string
  signal: AbortSignal
}) {
  return ownedOperation(input.owner, input.signal, async (signal) => {
    if (!taskIdSchema.safeParse(input.taskId).success) {
      throw new CreationError('This task is unavailable.')
    }
    const result = await getTaskArtifacts(input.taskId)
    assertOwner(input.owner, signal)
    return result
  })
}
