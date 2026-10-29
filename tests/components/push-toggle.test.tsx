import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushToggle } from '@/components/finance/push-toggle'

vi.mock('@/components/finance-auth-guard', () => ({ useFinanceAuth: () => ({ status: 'signed-in', email: 'l@x', owner: 'Laura', verified: true }) }))

const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc' }), unsubscribe: vi.fn(async () => true) }

function supportPush() {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub, subscribe: async () => sub } }) } })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: async () => 'granted' })
}

beforeEach(() => { window.sessionStorage.clear() })
afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('PushToggle', () => {
  it('shows iPhone install guidance as text on tap, not only in a tooltip', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    render(<PushToggle />)
    const button = await screen.findByRole('button', { name: /Push needs Home Screen/ })
    expect(button).not.toHaveAttribute('aria-disabled')
    expect(screen.queryByText(/Add to Home Screen/)).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Share › Add to Home Screen/)).toBeVisible()
    vi.restoreAllMocks()
  })

  it('says it could not reach the server when the re-sync fails offline', async () => {
    supportPush()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<PushToggle />)
    expect(await screen.findByRole('button', { name: /Couldn’t reach server/ })).toBeInTheDocument()
    expect(screen.queryByText(/no longer has this device/)).not.toBeInTheDocument()
  })

  it('re-posts an existing subscription once per session', async () => {
    supportPush()
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const first = render(<PushToggle />)
    expect(await screen.findByRole('button', { name: /Daily push on/ })).toBeInTheDocument()
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({ owner: 'Laura' })
    first.unmount()
    render(<PushToggle />)
    expect(await screen.findByRole('button', { name: /Daily push on/ })).toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
