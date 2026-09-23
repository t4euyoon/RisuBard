import { afterEach, describe, expect, test, vi } from 'vitest'
import { SandboxHost } from './factory'

describe('API v3 plugin sandbox document', () => {
    test('records unfinished, successful and failed host calls without retaining payloads', async () => {
        vi.stubGlobal('ImageBitmap', class ImageBitmap {})
        let finish: (value: string) => void = () => {}
        const iframe = document.createElement('iframe')
        document.body.appendChild(iframe)
        const host = new SandboxHost({
            slow: () => new Promise<string>(resolve => { finish = resolve }),
            broken: () => { throw new Error('private-error-content') },
        })
        const stop = host.run(iframe, '')
        try {
            const call = (method: string) => window.dispatchEvent(new MessageEvent('message', {
                source: iframe.contentWindow,
                data: { type: 'CALL_ROOT', reqId: method, method, args: ['private-request-content'] },
            }))
            call('slow')
            expect(host.getDiagnostics().calls[0].state).toBe('running')
            call('broken')
            await vi.waitFor(() => expect(host.getDiagnostics().calls[1]).toMatchObject({ failed: true, state: 'posted' }))
            finish('private-result-content')
            await vi.waitFor(() => expect(host.getDiagnostics().calls[0]).toMatchObject({ failed: false, state: 'posted' }))
            expect(JSON.stringify(host.getDiagnostics())).not.toContain('private-')
        } finally { stop() }
    })

    test('diagnostic ping ignores other frames and accepts only safe counters', async () => {
        const iframe = document.createElement('iframe')
        const other = document.createElement('iframe')
        document.body.append(iframe, other)
        const host = new SandboxHost({})
        const stop = host.run(iframe, '')
        const post = vi.spyOn(iframe.contentWindow!, 'postMessage')
        try {
            const ping = host.pingDiagnostics()
            const request = post.mock.calls[0][0] as { reqId: string }
            const response = { type: 'DIAGNOSTIC_PONG', reqId: request.reqId,
                result: { pendingRequests: 3, remoteRefs: 10, callbacks: 2, secret: 'private' } }
            const settled = vi.fn()
            void ping.then(settled)
            window.dispatchEvent(new MessageEvent('message', { source: other.contentWindow, data: response }))
            await Promise.resolve()
            expect(settled).not.toHaveBeenCalled()
            window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, data: response }))
            expect(await ping).toEqual({ status: 'responsive', pendingRequests: 3, remoteRefs: 10, callbacks: 2 })
        } finally { stop() }
    })

    test('diagnostics still return when the guest is silent and clean up on termination', async () => {
        vi.useFakeTimers()
        const host = new SandboxHost({})
        const iframe = document.createElement('iframe')
        document.body.appendChild(iframe)
        const stop = host.run(iframe, '')
        try {
            const ping = host.pingDiagnostics()
            await vi.advanceTimersByTimeAsync(2000)
            expect(await ping).toEqual({ status: 'timeout' })
            const pending = host.pingDiagnostics()
            stop()
            expect(await pending).toEqual({ status: 'terminated' })
            expect(vi.getTimerCount()).toBe(0)
        } finally { stop(); vi.useRealTimers() }
    })

    test('creates distinct CSP nonces over HTTP without crypto.randomUUID', () => {
        const getRandomValues = vi.fn(crypto.getRandomValues.bind(crypto))
        vi.stubGlobal('crypto', { getRandomValues })
        const nonces: string[] = []

        for (let i = 0; i < 2; i++) {
            const iframe = document.createElement('iframe')
            const host = new SandboxHost({})
            const stop = host.run(iframe, '')
            try {
                const nonce = iframe.getAttribute('csp')?.match(/'nonce-([^']+)'/)?.[1]
                expect(nonce).toMatch(/^[0-9a-f]{32}$/)
                expect(iframe.srcdoc).toContain(`<script nonce="${nonce}">`)
                expect(iframe.sandbox.contains('allow-same-origin')).toBe(false)
                nonces.push(nonce!)
            } finally {
                stop()
            }
        }

        expect(getRandomValues).toHaveBeenCalledTimes(2)
        expect(getRandomValues.mock.calls[0][0]).toHaveLength(16)
        expect(nonces[0]).not.toBe(nonces[1])
    })

    afterEach(() => {
        document.body.replaceChildren()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    test('loads the sandbox without blob navigation and keeps its security policy', () => {
        const createObjectURL = vi.spyOn(URL, 'createObjectURL')
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
        const iframe = document.createElement('iframe')
        const host = new SandboxHost({})

        const stop = host.run(iframe, 'globalThis.pluginLoaded = true')

        expect(createObjectURL).not.toHaveBeenCalled()
        expect(iframe.getAttribute('src')).toBeNull()
        expect(iframe.srcdoc).toContain('globalThis.pluginLoaded = true')
        expect(iframe.sandbox.contains('allow-scripts')).toBe(true)
        expect(iframe.sandbox.contains('allow-modals')).toBe(true)
        expect(iframe.sandbox.contains('allow-downloads')).toBe(true)
        expect(iframe.sandbox.contains('allow-same-origin')).toBe(false)
        expect(iframe.getAttribute('allow') ?? '').toContain('screen-wake-lock')
        expect(iframe.getAttribute('csp')).toContain("default-src 'none'")
        expect(iframe.srcdoc).toContain(`content="${iframe.getAttribute('csp')}"`)
        expect(revokeObjectURL).not.toHaveBeenCalled()

        iframe.dispatchEvent(new Event('load'))

        stop()

        expect(revokeObjectURL).not.toHaveBeenCalled()
    })

    test('removes the frame and message handler when terminated before load', () => {
        const removeEventListener = vi.spyOn(window, 'removeEventListener')
        const iframe = document.createElement('iframe')
        const host = new SandboxHost({})
        document.body.appendChild(iframe)

        host.run(iframe, '')
        host.terminate()
        iframe.dispatchEvent(new Event('load'))

        expect(iframe.isConnected).toBe(false)
        expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
    })

    test('bridges callbacks nested in API argument objects', async () => {
        vi.stubGlobal('ImageBitmap', class ImageBitmap {})
        const addProvider = vi.fn()
        const iframe = document.createElement('iframe')
        const host = new SandboxHost({ addProvider })
        const stop = host.run(iframe, '')

        window.dispatchEvent(new MessageEvent('message', {
            source: iframe.contentWindow,
            data: {
                type: 'CALL_ROOT',
                reqId: 'add-provider',
                method: 'addProvider',
                args: [
                    'callback-repro',
                    { __type: 'CALLBACK_REF', id: 'provider-callback' },
                    {
                        overrideRequestStatus: {
                            __type: 'CALLBACK_REF',
                            id: 'status-callback',
                        },
                    },
                ],
            },
        }))

        await vi.waitFor(() => expect(addProvider).toHaveBeenCalledOnce())
        const [, provider, options] = addProvider.mock.calls[0]

        expect(provider).toBeTypeOf('function')
        expect(options.overrideRequestStatus).toBeTypeOf('function')

        stop()
    })

    test('serializes callbacks nested in guest API argument objects', async () => {
        const iframe = document.createElement('iframe')
        const host = new SandboxHost({})

        const stop = host.run(iframe, '')
        const documentText = iframe.srcdoc
        expect(documentText).toContain('const serialized = serializeArg(val);')
        expect(documentText).toContain('out[key] = serialized;')

        stop()
    })

    test('ignores API calls from a different frame', () => {
        const registerSetting = vi.fn()
        const iframe = document.createElement('iframe')
        const otherFrame = document.createElement('iframe')
        document.body.append(iframe, otherFrame)
        const host = new SandboxHost({ registerSetting })
        const stop = host.run(iframe, '')

        window.dispatchEvent(new MessageEvent('message', {
            source: otherFrame.contentWindow,
            data: { type: 'CALL_ROOT', reqId: 'spoof', method: 'registerSetting', args: [] },
        }))

        expect(registerSetting).not.toHaveBeenCalled()
        stop()
    })
})
