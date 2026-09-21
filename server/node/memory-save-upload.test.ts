import { expect, test, vi } from 'vitest'
import { createMemorySaveSlot, decodeMemorySaveChat } from '../../src/ts/risubard/memorySaveSlots'
import type { Chat } from '../../src/ts/storage/database.svelte'
const { createChatContentUploads } = require('./chat-content-upload.cjs')
const { registerRisuBardMemoryRoutes } = require('./risubard-memory-routes.cjs')

test.each(['large', 'disabled', 'small', 'changed metadata', 'auth failure', 'conflict'])('memory save transport: %s', async mode => {
    const uploads = createChatContentUploads()
    const routes = new Map<string, Function>()
    const summary = { saveId: 'save', sourceChatId: 'chat', sourceChatName: 'Story', createdAt: new Date().toISOString(), turnCount: 1 }
    const service = { createMemorySave: vi.fn(async () => {
        if (mode === 'conflict') throw Object.assign(new Error('Conflict'), { status: 409 })
        return summary
    }) }
    let posts = 0, deletes = 0
    const sizes: number[] = []
    registerRisuBardMemoryRoutes({
        post: (url: string, fn: Function) => routes.set('POST ' + url, fn),
        delete: (url: string, fn: Function) => routes.set('DELETE ' + url, fn),
    }, { uploads, service, auth: async (_req: unknown, res: any) => {
        if (mode === 'auth failure' && posts === 2) { res.status(401).send({ error: 'Unauthorized' }); return false }
        return true
    } })
    const data = 'x'.repeat(mode === 'large' ? 100 * 1024 * 1024 + 17 : mode === 'small' ? 10 : 2 * 1024 * 1024)
    const chat: Chat = { id: 'chat', name: 'Story', note: '', localLore: [], message: [{ role: 'char', data }] }
    const fetchImpl = (async (url: string, init: RequestInit) => {
        const method = init.method!
        if (method === 'POST') {
            posts++
            expect(service.createMemorySave).not.toHaveBeenCalled()
            sizes.push((init.body as ArrayBuffer).byteLength)
        } else deletes++
        const headers = Object.fromEntries(new Headers(init.headers))
        if (mode === 'changed metadata' && posts === 2 && method === 'POST') headers['x-risubard-save-id'] = 'other'
        let status = 200, body: unknown
        const res = { status: (code: number) => { status = code; return res }, send: (value: unknown) => { body = value; return res } }
        await routes.get(method + ' ' + url)!({ headers, body: init.body ? Buffer.from(init.body as ArrayBuffer) : undefined }, res,
            (error: any) => { status = error.status ?? 500; body = { error: error.message } })
        return Response.json(body, { status })
    }) as typeof fetch
    try {
        const promise = createMemorySaveSlot({ characterId: 'character', saveId: 'save', chat, fetchImpl,
            createAuth: async () => 'auth', chunkEnabled: mode !== 'disabled', chunkMiB: mode === 'large' ? 8 : 1 })
        if (['changed metadata', 'auth failure', 'conflict'].includes(mode)) {
            await expect(promise).rejects.toThrow(/status (401|409)/)
            expect(deletes).toBe(1)
            if (mode !== 'conflict') expect(service.createMemorySave).not.toHaveBeenCalled()
        } else {
            await expect(promise).resolves.toEqual(summary)
            expect(service.createMemorySave).toHaveBeenCalledOnce()
            const saved = (service.createMemorySave.mock.calls[0] as any)[0]
            expect((decodeMemorySaveChat(saved.chatBytes) as Chat).message[0].data === data).toBe(true)
            expect(posts).toBe(mode === 'large' ? 13 : 1)
            if (mode === 'large') expect(Math.max(...sizes)).toBeLessThanOrEqual(8 * 1024 * 1024)
            expect(deletes).toBe(0)
        }
    } finally { await uploads.close() }
})
