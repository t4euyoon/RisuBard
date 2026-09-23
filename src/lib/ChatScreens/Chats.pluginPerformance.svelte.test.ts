import { expect, it, vi } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Chats from './Chats.svelte'
import { reconcilePluginSnapshot } from 'src/ts/plugins/pluginSnapshotExperiment'

const mocks = vi.hoisted(() => ({ mounts: 0, db: {} as any }))
// Exercise the real list/hash/DOM reconciliation, excluding image/LLM/parser costs.
vi.mock('./Chat.svelte', () => ({ default: function () {
    mocks.mounts++
    return { updateStreamingDisplay() {} }
} }))
vi.mock('src/ts/characters', () => ({ getCharImage: () => '' }))
vi.mock('./scrollWithin', () => ({ scrollWithinContainer() {} }))
vi.mock('src/ts/stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return {
        DBState: { get db() { return mocks.db } }, selectedCharID: writable(0), ReloadChatPointer: writable({}),
        createSimpleCharacter: (char: any) => ({ type: 'simple', chaId: char.chaId, additionalAssets: char.additionalAssets,
            customscript: char.customscript, virtualscript: char.virtualscript, emotionImages: char.emotionImages, triggerscript: char.triggerscript }),
    }
})

it.skipIf(process.env.RISUBARD_PERF_COMPARE !== '1')('compares actual Chats list reconciliation and message mounts', async () => {
    const rows: object[] = []
    for (const turns of [200, 2000]) for (const visible of [40, turns * 2]) {
        const state = $state({ character: {
            chaId: 'character', chatPage: 0, name: 'Test', largePortrait: false,
            chats: [{ id: 'chat', message: Array.from({ length: turns * 2 }, (_, i) => ({
                chatId: `m${i}`, role: i % 2 ? 'char' : 'user', data: `${i}: ` + 'A **scene** unfolds. '.repeat(100),
                disabled: false,
            })) }], additionalAssets: [['old', '/old', 'png']],
        } })
        mocks.db = { get characters() { return [state.character] } }
        const target = document.body.appendChild(document.createElement('div'))
        const instance = mount(Chats, { target, props: {
            get messages() { return state.character.chats[0].message as any },
            get currentCharacter() { return state.character as any },
            pageStart: turns * 2 - visible, pageEnd: turns * 2,
            onReroll() {}, unReroll() {}, currentUsername: 'User', userIcon: '',
        } })
        flushSync(); await tick()
        try {
            for (const mutation of ['asset', 'last-message']) {
                const times: number[][] = [[], []], mounts: number[][] = [[], []]
                for (let round = 0; round < 12; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
                    const incoming = $state.snapshot(state.character)
                    if (mutation === 'asset') incoming.additionalAssets[0][0] = `asset${round}/${variant}`
                    else incoming.chats[0].message.at(-1)!.data = `edited ${round}/${variant}`
                    const beforeMounts = mocks.mounts, start = performance.now()
                    state.character = variant ? reconcilePluginSnapshot(state.character, incoming) : incoming
                    flushSync(); await tick()
                    if (round >= 3) { times[variant].push(performance.now() - start); mounts[variant].push(mocks.mounts - beforeMounts) }
                }
                const median = (values: number[]) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)]
                rows.push({ turns, visible, mutation, beforeMs: median(times[0]), afterMs: median(times[1]),
                    beforeMounts: median(mounts[0]), afterMounts: median(mounts[1]), samples: 9 })
                expect(mounts[0]).toEqual(mounts[1])
            }
        } finally { await unmount(instance); target.remove() }
    }
    mkdirSync(resolve('..', '.analysis'), { recursive: true })
    writeFileSync(resolve('..', '.analysis', 'plugin-chat-list-comparison.json'), JSON.stringify({
        note: 'Real Chats.svelte with stub Chat child; measures list update and mount counts, not full chat rendering', rows,
    }, null, 2))
}, 120_000)
