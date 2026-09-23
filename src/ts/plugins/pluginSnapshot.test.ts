import { describe, expect, it, vi } from 'vitest'
import { reconcilePluginSnapshot } from './pluginSnapshotExperiment'

describe('plugin snapshot writes', () => {
    it('keeps all 200 historical message identities when registering an asset', () => {
        const previous = {
            chats: [{ message: Array.from({ length: 200 }, (_, i) => ({ chatId: `${i}`, data: `reply ${i}` })) }],
            additionalAssets: [['old', '/old', 'png']],
        }
        const incoming = structuredClone(previous)
        incoming.additionalAssets.push(['new', '/new', 'png'])
        const result = reconcilePluginSnapshot(previous, incoming)
        expect(result).toEqual(incoming)
        expect(result.chats).toBe(previous.chats)
        expect(result.additionalAssets).not.toBe(previous.additionalAssets)
        expect(previous.additionalAssets).toHaveLength(1)
    })

    it('changes only the edited message while retaining replacement semantics', () => {
        const previous = { message: [{ data: 'old', extra: true }, { data: 'unchanged' }], note: 'remove me' }
        const incoming = { message: [{ data: 'new' }, { data: 'unchanged' }] }
        const result = reconcilePluginSnapshot<{ message: { data: string; extra?: boolean }[]; note?: string }>(previous, incoming)
        expect(result).toEqual(incoming)
        expect(result.message[1]).toBe(previous.message[1])
        expect(result.message[0]).not.toBe(previous.message[0])
        expect(previous.note).toBe('remove me')
        expect(incoming.message[1]).not.toBe(previous.message[1])
    })

    it('handles deleted entries, null, arrays, and own __proto__ keys', () => {
        expect(reconcilePluginSnapshot([1, 2], [1])).toEqual([1])
        expect(reconcilePluginSnapshot<unknown>({ a: 1 }, null)).toBeNull()
        const value = JSON.parse('{"__proto__":{"data":"safe"}}')
        const result = reconcilePluginSnapshot({}, value)
        expect(Object.hasOwn(result, '__proto__')).toBe(true)
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    })
})

