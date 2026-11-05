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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { CreationPage } from '..'
import {
  listCreationModels,
  listCreationTokens,
  readCreationTask,
  readCreationArtifacts,
  submitCreation,
  type CreationOwner,
} from '../api'
import { ImageResult } from '../image-results'
import { VideoTaskResult } from '../video-task'

const owner: CreationOwner = { userId: 7, sessionId: 'session-a' }
const draft = {
  model: 'test-image',
  prompt: 'A quiet garden',
  size: '',
  seconds: '',
}
const key = `test-${'a'.repeat(24)}`
const token = {
  id: 4,
  name: 'My creation key',
  status: 1,
  expired_time: -1,
  remain_quota: 100,
  unlimited_quota: false,
}
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
const fetchMock = vi.fn<typeof fetch>()
let client: QueryClient

function setOwner(value = owner) {
  useAuthStore.getState().auth.setBundle({
    access_token: `test-session-${'b'.repeat(24)}`,
    token_type: 'Bearer',
    access_expires_at: Date.now() / 1000 + 3600,
    user: { id: value.userId, username: 'test-user', role: 1 },
    session: {
      sid: value.sessionId,
      current: true,
      login_method: 'test-method',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: Date.now() / 1000 + 3600,
    },
  })
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function signal() {
  return new AbortController().signal
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred response not initialized')
  }
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
function taskResponse(status: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      success: true,
      data: {
        items: [
          {
            task_id: 'task-1',
            user_id: owner.userId,
            status,
            progress: '45%',
            ...overrides,
          },
        ],
      },
    },
  }
}
function tokenResponse(
  items: Array<typeof token & { key?: string }> = [token],
  total = items.length
) {
  return { data: { success: true, data: { items, total } } }
}
function renderCreation(
  kind: 'image' | 'video' = 'image',
  onTaskChange?: (id: string) => void
) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <CreationPage kind={kind} onTaskChange={onTaskChange} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
async function chooseKey() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('combobox', { name: 'API key' }))
  await user.click(
    await screen.findByRole('option', { name: 'My creation key #4' })
  )
  return user
}

beforeEach(() => {
  setOwner()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { key } },
  })
  vi.spyOn(api, 'get').mockResolvedValue(tokenResponse())
})
afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('creation credential and request contracts', () => {
  test('relays with the selected API bearer, not the login JWT, and omits model-default parameters', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          { url: 'https://images.example/result.png?signature=signed-image' },
        ],
      })
    )
    await submitCreation({
      owner,
      tokenId: 4,
      kind: 'image',
      draft,
      signal: signal(),
    })
    expect(api.post).toHaveBeenCalledWith('/api/token/4/key')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/v1/images/generations')
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer sk-${key}` },
    })
    expect(JSON.parse(String(options?.body))).toEqual({
      model: draft.model,
      prompt: draft.prompt,
      n: 1,
      stream: false,
    })
    expect(options?.headers).not.toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${useAuthStore.getState().auth.accessToken}`,
      })
    )
  })

  test.each([401, 403, 429, 500])(
    'does not replay a rejected generation (%i) or expose its response',
    async (status) => {
      fetchMock.mockResolvedValue(
        json({ error: { message: `secret sk-${key}` } }, status)
      )
      await expect(
        submitCreation({
          owner,
          tokenId: 4,
          kind: 'image',
          draft,
          signal: signal(),
        })
      ).rejects.not.toThrow(key)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )

  test('treats unreadable POST responses as uncertain without retrying', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    await expect(
      submitCreation({
        owner,
        tokenId: 4,
        kind: 'image',
        draft,
        signal: signal(),
      })
    ).rejects.toThrow('The request may have completed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('treats network loss as uncertain without replaying the POST', async () => {
    fetchMock.mockRejectedValue(new Error(`transport logged sk-${key}`))
    await expect(
      submitCreation({
        owner,
        tokenId: 4,
        kind: 'image',
        draft,
        signal: signal(),
      })
    ).rejects.toThrow('submitting again can create another charge')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test.each(['session', 'user', 'unmount'] as const)(
    'stops before relay when %s changes while the key is being returned',
    async (change) => {
      const pending = deferred<{
        data: { success: boolean; data: { key: string } }
      }>()
      vi.mocked(api.post).mockReturnValue(pending.promise)
      const controller = new AbortController()
      const operation = submitCreation({
        owner,
        tokenId: 4,
        kind: 'image',
        draft,
        signal: controller.signal,
      })
      const rejected = expect(operation).rejects.toMatchObject({
        name: 'AbortError',
      })
      if (change === 'unmount') controller.abort()
      else {
        setOwner({ userId: change === 'user' ? 8 : 7, sessionId: 'session-b' })
      }
      pending.resolve({ data: { success: true, data: { key } } })
      await rejected
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  test('aborts the request and discards its result after session replacement', async () => {
    const reply = deferred<Response>()
    fetchMock.mockReturnValue(reply.promise)
    const operation = submitCreation({
      owner,
      tokenId: 4,
      kind: 'image',
      draft,
      signal: signal(),
    })
    const rejected = expect(operation).rejects.toMatchObject({
      name: 'AbortError',
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const activeSignal = fetchMock.mock.calls[0][1]?.signal
    setOwner({ ...owner, sessionId: 'session-b' })
    expect(activeSignal?.aborted).toBe(true)
    reply.resolve(json({ data: [{ url: 'https://images.example/stale.png' }] }))
    await rejected
  })

  test('sends video seconds as a string and keeps size optional', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'task-1' }))
    expect(
      await submitCreation({
        owner,
        tokenId: 4,
        kind: 'video',
        draft: { ...draft, seconds: '8' },
        signal: signal(),
      })
    ).toEqual({ kind: 'video', taskId: 'task-1' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/videos')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: draft.model,
      prompt: draft.prompt,
      seconds: '8',
    })
    await submitCreation({
      owner,
      tokenId: 4,
      kind: 'video',
      draft,
      signal: signal(),
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      model: draft.model,
      prompt: draft.prompt,
    })
  })

  test('loads every page of usable own keys without retaining key values', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce(
        tokenResponse([{ ...token, key: 'unused-masked-key' }], 3)
      )
      .mockResolvedValueOnce(
        tokenResponse(
          [
            { ...token, id: 5, status: 2 },
            { ...token, id: 6 },
          ],
          3
        )
      )
    const tokens = await listCreationTokens(owner, signal())
    expect(tokens.map((value) => value.id)).toEqual([4, 6])
    expect(tokens.every((value) => !('key' in value))).toBe(true)
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/token/?p=2&size=100')
  })

  test('only offers models advertising the matching supported endpoint', async () => {
    fetchMock.mockImplementation(async () =>
      json({
        data: [
          { id: 'image-a', supported_endpoint_types: ['image-generation'] },
          { id: 'image-a', supported_endpoint_types: ['image-generation'] },
          { id: 'video-a', supported_endpoint_types: ['openai-video'] },
          { id: 'chat-only', supported_endpoint_types: ['openai'] },
          { id: 'name-that-looks-like-image' },
        ],
      })
    )
    expect(
      await listCreationModels({
        owner,
        tokenId: 4,
        kind: 'image',
        signal: signal(),
      })
    ).toEqual([{ id: 'image-a' }])
    expect(
      await listCreationModels({
        owner,
        tokenId: 4,
        kind: 'video',
        signal: signal(),
      })
    ).toEqual([{ id: 'video-a' }])
  })
})

describe('safe image output', () => {
  test.each([
    { url: 'https://images.example/image.png' },
    [
      { revised_prompt: 'Revised scene' },
      { url: 'https://images.example/image.png' },
    ],
    [{ url: 'https://images.example/image.png' }, { b64_json: png }],
  ])('accepts gateway-compatible payload shapes %#', async (data) => {
    fetchMock.mockResolvedValue(json({ data }))
    const result = await submitCreation({
      owner,
      tokenId: 4,
      kind: 'image',
      draft,
      signal: signal(),
    })
    expect(result.kind).toBe('images')
    if (result.kind !== 'images') throw new Error('Expected images')
    expect(result.images.length).toBeGreaterThan(0)
  })

  test.each([
    [png, 'image/png'],
    [btoa(String.fromCharCode(255, 216, 255, 224)), 'image/jpeg'],
    [btoa('RIFF1234WEBP'), 'image/webp'],
  ])('accepts recognized image bytes (%s)', async (encoded, mime) => {
    fetchMock.mockResolvedValue(json({ data: [{ b64_json: encoded }] }))
    const result = await submitCreation({
      owner,
      tokenId: 4,
      kind: 'image',
      draft,
      signal: signal(),
    })
    expect(result.kind).toBe('images')
    if (result.kind !== 'images') throw new Error('Expected image response')
    const image = result.images[0]
    expect(image.kind).toBe('blob')
    if (image.kind !== 'blob') throw new Error('Expected binary image')
    expect(image.blob.type).toBe(mime)
  })

  test.each([
    { url: 'javascript:alert(1)' },
    { url: 'data:image/svg+xml,<svg />' },
    { url: 'https://user:example@images.example/image.png' },
    { url: `https://images.example/image.png?api_key=sk-${key}` },
    { b64_json: btoa('<svg onload="alert(1)" />') },
    { b64_json: 'not valid base64' },
  ])('rejects executable or credential-bearing output %#', async (image) => {
    fetchMock.mockResolvedValue(json({ data: [image] }))
    await expect(
      submitCreation({
        owner,
        tokenId: 4,
        kind: 'image',
        draft,
        signal: signal(),
      })
    ).rejects.toThrow('no usable images')
  })

  test('revokes generated image URLs when leaving the result', async () => {
    const create = vi.fn(() => 'blob:test-image')
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create
        static revokeObjectURL = revoke
      }
    )
    const view = render(
      <ImageResult
        image={{
          kind: 'blob',
          blob: new Blob(['image'], { type: 'image/png' }),
        }}
        position={1}
      />
    )
    expect(await screen.findByRole('img')).toHaveAttribute(
      'src',
      'blob:test-image'
    )
    expect(
      screen.getByRole('button', { name: 'Download image' })
    ).toHaveAttribute('download', 'lulu-image-1.png')
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:test-image')
  })
})

describe('video task ownership and polling', () => {
  test('does not expose artifacts returned after the session changes', async () => {
    const reply = deferred<{
      data: { success: boolean; data: { artifacts: unknown[] } }
    }>()
    vi.mocked(api.get).mockReturnValue(reply.promise)
    const operation = readCreationArtifacts({
      owner,
      taskId: 'task-1',
      signal: signal(),
    })
    const rejected = expect(operation).rejects.toMatchObject({
      name: 'AbortError',
    })
    setOwner({ ...owner, sessionId: 'session-b' })
    reply.resolve({ data: { success: true, data: { artifacts: [] } } })
    await rejected
  })

  test('loads only a retained successful task artifact and reuses the video preview', async () => {
    const contentUrl = `https://local.example/v1/tasks/task-1/artifacts/video/content?access=${'a'.repeat(43)}`
    vi.mocked(api.get).mockImplementation(async (url) =>
      String(url).includes('/artifacts')
        ? {
            data: {
              success: true,
              data: {
                artifacts: [
                  {
                    key: 'video',
                    type: 'video',
                    content_url: contentUrl,
                    mime_type: 'video/mp4',
                  },
                ],
              },
            },
          }
        : taskResponse('SUCCESS')
    )
    const view = render(
      <QueryClientProvider client={client}>
        <VideoTaskResult owner={owner} taskId='task-1' />
      </QueryClientProvider>
    )
    expect(await screen.findByText('Your video is ready')).toBeInTheDocument()
    await waitFor(() =>
      expect(view.container.querySelector('video')).toHaveAttribute(
        'src',
        contentUrl
      )
    )
    expect(api.get).toHaveBeenCalledWith(
      '/api/task/task-1/artifacts',
      expect.anything()
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([
    ['QUEUED', 'waiting'],
    ['IN_PROGRESS', 'running'],
    ['SUCCESS', 'complete'],
    ['FAILURE', 'failed'],
    ['UNKNOWN', 'unknown'],
  ])('maps %s from own exact task', async (status, phase) => {
    vi.mocked(api.get).mockResolvedValue(taskResponse(status))
    expect(
      await readCreationTask({ owner, taskId: 'task-1', signal: signal() })
    ).toMatchObject({ phase, id: 'task-1' })
    const url = new URL(
      String(vi.mocked(api.get).mock.calls[0][0]),
      'https://local.example'
    )
    expect(url.pathname).toBe('/api/task/self')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      p: '1',
      page_size: '1',
      task_id: 'task-1',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([{ user_id: 8 }, { task_id: 'some-other-task' }])(
    'rejects a task outside the exact ownership selection %#',
    async (overrides) => {
      vi.mocked(api.get).mockResolvedValue(taskResponse('SUCCESS', overrides))
      await expect(
        readCreationTask({ owner, taskId: 'task-1', signal: signal() })
      ).rejects.toThrow('This task is unavailable.')
    }
  )

  test('stops polling terminal tasks and avoids discarded artifacts', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(api.get).mockResolvedValue(
      taskResponse('SUCCESS', { result_discarded: true })
    )
    render(
      <QueryClientProvider client={client}>
        <VideoTaskResult owner={owner} taskId='task-1' />
      </QueryClientProvider>
    )
    expect(await screen.findByText('Result not retained')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  test('bounds missing-task polling and keeps a manual refresh available', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [] } },
    })
    render(
      <QueryClientProvider client={client}>
        <VideoTaskResult owner={owner} taskId='task-1' />
      </QueryClientProvider>
    )
    expect(
      await screen.findByText('Waiting for the task record')
    ).toBeInTheDocument()
    for (let count = 0; count < 15; count++) {
      await act(() => vi.advanceTimersByTimeAsync(3000))
    }
    expect(api.get).toHaveBeenCalledTimes(10)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(11))
  })
})

describe('creation page behavior', () => {
  test('returns a submitted task ID to the route without starting a second request', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url) === '/v1/models'
        ? json({
            data: [
              { id: 'test-video', supported_endpoint_types: ['openai-video'] },
            ],
          })
        : json({ id: 'task-1' })
    )
    const onTaskChange = vi.fn()
    renderCreation('video', onTaskChange)
    const user = await chooseKey()
    await user.type(
      screen.getByRole('textbox', { name: 'Prompt' }),
      'A slow camera pan'
    )
    await user.click(
      await screen.findByRole('button', { name: 'Generate video' })
    )
    await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith('task-1'))
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/v1/videos')
    ).toHaveLength(1)
  })

  test('shows the genuine empty-model state and prevents submitting', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [{ id: 'chat-only', supported_endpoint_types: ['openai'] }],
      })
    )
    renderCreation()
    expect(
      await screen.findByRole('combobox', { name: 'API key' })
    ).toHaveTextContent('Choose an API key.')
    await chooseKey()
    expect(
      await screen.findByText('No image models available')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate image' })
    ).toBeDisabled()
    expect(
      screen.queryByRole('option', { name: 'chat-only' })
    ).not.toBeInTheDocument()
  })

  test('guards duplicate submissions and clears a pending result on session change', async () => {
    const reply = deferred<Response>()
    fetchMock.mockImplementation(async (url) =>
      String(url) === '/v1/models'
        ? json({
            data: [
              {
                id: 'test-image',
                supported_endpoint_types: ['image-generation'],
              },
            ],
          })
        : reply.promise
    )
    renderCreation()
    const user = await chooseKey()
    await user.type(
      screen.getByRole('textbox', { name: 'Prompt' }),
      'A quiet garden'
    )
    const button = await screen.findByRole('button', { name: 'Generate image' })
    await waitFor(() => expect(button).toBeEnabled())
    const form = button.closest('form')
    if (!form) throw new Error('Missing generation form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url === '/v1/images/generations')
      ).toHaveLength(1)
    )
    act(() => setOwner({ ...owner, sessionId: 'session-b' }))
    await act(async () => {
      reply.resolve(
        json({ data: [{ url: 'https://images.example/stale.png' }] })
      )
      await reply.promise
    })
    expect(
      screen.queryByRole('img', { name: 'Generated image 1' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('')
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data)
      )
    ).not.toContain(key)
  })
})
