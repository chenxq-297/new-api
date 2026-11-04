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
  createRoute,
  createRouter,
  RouterProvider,
  useSearch,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PersonalCenter } from '@/features/personal-center'
import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'
import { Route as ProfileRoute } from '@/routes/_authenticated/profile'
import { useAuthStore } from '@/stores/auth-store'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  setting: JSON.stringify({
    notify_type: 'email',
    quota_warning_threshold: 500000,
  }),
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  Element.prototype.scrollIntoView = vi.fn()
  useAuthStore
    .getState()
    .auth.setUser({ ...profile, permissions: { sidebar_settings: false } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/access_tokens') {
      return { data: { success: true, data: { items: [], legacy: null } } }
    }
    if (url === '/api/user/access_tokens/catalog') {
      return {
        data: {
          success: true,
          data: { groups: [], max_tokens: 20, default_expiry_days: 30 },
        },
      }
    }
    if (url === '/api/user/topup/info') {
      return {
        data: {
          success: true,
          data: { pay_methods: [], amount_options: [10], min_topup: 1 },
        },
      }
    }
    if (url === '/api/user/aff') {
      return { data: { success: true, data: 'invite-code' } }
    }
    if (url === '/api/subscription/plans') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/subscription/self') {
      return {
        data: {
          success: true,
          data: {
            subscriptions: [],
            all_subscriptions: [],
            billing_preference: 'wallet_only',
          },
        },
      }
    }
    if (String(url).startsWith('/api/user/topup/self?')) {
      return { data: { success: true, data: { items: [], total: 0 } } }
    }
    if (url === '/api/user/self') {
      return { data: { success: true, data: profile } }
    }
    if (url === '/api/user/passkey') {
      return { data: { success: true, data: { enabled: false } } }
    }
    if (url === '/api/user/2fa/status') {
      return {
        data: {
          success: true,
          data: { enabled: false, locked: false, backup_codes_remaining: 0 },
        },
      }
    }
    if (url === '/api/user/sessions') {
      return { data: { success: true, data: [] } }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: '10' },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

function PersonalCenterRoute() {
  const search = useSearch({ strict: false })
  return <PersonalCenter initialShowHistory={search.show_history} />
}

async function renderPage(path = '/profile', sidebarConfig = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    SidebarModulesAdmin: sidebarConfig,
    checkin_enabled: false,
    wechat_login: true,
    github_oauth: true,
    oidc_enabled: true,
    custom_oauth_providers: [
      {
        id: 1,
        name: 'Gitea',
        slug: 'gitea',
        client_id: 'test-client',
        authorization_endpoint: 'https://example.com/oauth/authorize',
        scopes: 'openid',
      },
    ],
  })
  const root = createRootRoute()
  const personal = createRoute({
    getParentRoute: () => root,
    path: '/profile',
    validateSearch: ProfileRoute.options.validateSearch,
    component: PersonalCenterRoute,
  })
  const router = createRouter({
    routeTree: root.addChildren([personal]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  const rendered = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { ...rendered, router }
}

describe('personal center composition', () => {
  it('places account management on the left and verification and privacy on the right', async () => {
    await renderPage()
    const login = await screen.findByRole('region', {
      name: 'Login & Authentication',
    })
    expect(
      screen
        .getAllByRole('region')
        .map((region) => within(region).getAllByRole('heading')[0].textContent)
    ).toEqual([
      'Wallet',
      'Profile',
      'Security & Access',
      'Login & Authentication',
      'Sessions & Access',
      'Account Actions',
      'Privacy',
    ])
    expect(
      within(login).getByRole('button', { name: 'Change Password' })
    ).toBeVisible()
    expect(within(login).getByText('Account Bindings')).toBeVisible()
    const verification = screen.getByRole('complementary', {
      name: 'Security verification',
    })
    expect(await within(verification).findByText('Passkey Login')).toBeVisible()
    expect(
      await within(verification).findByText('Two-Factor Authentication')
    ).toBeVisible()
    expect(
      within(verification).getByRole('switch', { name: 'Record IP Address' })
    ).toBeVisible()
    expect(verification).toHaveClass('xl:sticky', 'xl:top-0')
    expect(verification.parentElement).toHaveClass(
      'grid',
      'xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.46fr)]'
    )
    const access = screen.getByRole('region', { name: 'Sessions & Access' })
    expect(within(access).getByText('Access tokens')).toBeVisible()
    expect(
      await within(access).findByText('No active login sessions')
    ).toBeVisible()
    expect(
      screen.getByRole('switch', { name: 'Record IP Address' })
    ).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'Account Actions' })).getByRole(
        'button',
        { name: 'Delete Account' }
      )
    ).toBeVisible()
  })

  it('built-in and custom bindings share one compact responsive grid', async () => {
    await renderPage()
    const bindings = await screen.findByRole('list', {
      name: 'Account Bindings',
    })
    expect(within(bindings).getAllByRole('listitem')).toHaveLength(5)
    expect(within(bindings).getByText('Gitea')).toBeVisible()
    expect(bindings).toHaveClass(
      'grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-3',
      'gap-2'
    )
    expect(screen.queryByText('Custom OAuth')).not.toBeInTheDocument()
  })

  it('the password action opens the existing dialog by keyboard and Escape closes it', async () => {
    const user = userEvent.setup()
    await renderPage()
    const action = await screen.findByRole('button', {
      name: 'Change Password',
    })
    action.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', {
      name: 'Change Password',
    })
    expect(within(dialog).getByLabelText('Current Password')).toBeVisible()
    expect(
      within(dialog).getByLabelText('New Password', { exact: true })
    ).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('shows wallet, preferences and security together in one page', async () => {
    await renderPage()
    expect(
      await within(screen.getByRole('region', { name: 'Profile' })).findByRole(
        'button',
        { name: 'Save Settings' }
      )
    ).toBeVisible()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(
      screen.getByRole('heading', { name: 'Personal Center' })
    ).toBeVisible()
    for (const name of ['Wallet', 'Profile', 'Security & Access']) {
      expect(screen.getByRole('region', { name })).toBeVisible()
    }
    expect(
      screen.getByRole('button', { name: 'Change Password' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeVisible()
    expect(
      screen.getByRole('switch', { name: 'Record IP Address' })
    ).toBeVisible()
  })

  it('keeps sidebar customization available when personal sections are hidden', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ ...profile, permissions: { sidebar_settings: true } })
    await renderPage(
      '/profile',
      JSON.stringify({ personal: { enabled: false } })
    )
    expect(await screen.findByText('Sidebar Personal Settings')).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Profile' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Security & Access' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Wallet' })
    ).not.toBeInTheDocument()
  })

  it('payment returns still open history when the wallet section is hidden', async () => {
    const user = userEvent.setup()
    const { router } = await renderPage(
      '/profile?show_history=true',
      JSON.stringify({ personal: { enabled: true, topup: false } })
    )
    expect(
      await screen.findByRole('dialog', { name: 'Billing History' })
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Wallet' })
    ).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
    expect(router.state.location.search).toEqual({})
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('refreshes the common balance overview after a successful redemption', async () => {
    const user = userEvent.setup()
    await renderPage()
    await screen.findByRole('button', { name: 'Redeem' })
    expect(screen.getByText('$2')).toBeVisible()
    const selfResponse = vi.mocked(api.get).getMockImplementation()
    if (!selfResponse) throw new Error('Missing API fixture')
    vi.mocked(api.get).mockImplementation(async (...args) => {
      if (args[0] === '/api/user/self') {
        return {
          data: {
            success: true,
            data: {
              ...profile,
              quota: 2000000,
              display_name: 'Alice refreshed',
            },
          },
        }
      }
      return selfResponse(...args)
    })
    await user.type(screen.getByLabelText('Have a Code?'), 'preview-credit')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(
      await screen.findByRole('heading', { name: 'Alice refreshed' })
    ).toBeVisible()
    expect(screen.getByText('$4')).toBeVisible()
    expect(screen.getByLabelText('Have a Code?')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Change Password' })
    ).toBeVisible()
  })

  it('a failed profile load offers retry before exposing account actions', async () => {
    const getResponse = vi.mocked(api.get).getMockImplementation()
    if (!getResponse) throw new Error('Missing API fixture')
    let shouldFail = true
    vi.mocked(api.get).mockImplementation(async (...args) => {
      if (args[0] === '/api/user/self' && shouldFail) {
        shouldFail = false
        return { data: { success: false } }
      }
      return getResponse(...args)
    })
    const user = userEvent.setup()
    await renderPage()
    expect(await screen.findByText('Failed to load profile')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Delete Account' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('button', { name: 'Delete Account' })
    ).toBeVisible()
  })
})
