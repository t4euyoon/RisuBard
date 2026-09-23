import { expect, it } from 'vitest'
import { flushSync } from 'svelte'
import { reconcilePluginSnapshot } from './pluginSnapshotExperiment'

it('preserves historical Svelte message proxies after a plugin snapshot round trip', () => {
    const state = $state({ character: {
        chats: [{ message: Array.from({ length: 200 }, (_, i) => ({ data: `reply ${i}` })) }],
        additionalAssets: [] as string[][],
    } })
    const original = state.character.chats[0].message[0]
    let renders = 0
    const stop = $effect.root(() => {
        const historicalMessage = $derived(state.character.chats[0].message[0])
        $effect(() => { historicalMessage; renders += 1 })
    })
    try {
        flushSync()
        const update = $state.snapshot(state.character)
        update.additionalAssets.push(['new', '/asset', 'png'])
        state.character = reconcilePluginSnapshot(state.character, update)
        flushSync()
        expect(state.character.chats[0].message[0]).toBe(original)
        expect(renders).toBe(1)
        const edit = $state.snapshot(state.character)
        edit.chats[0].message[199].data += '{{image::new}}'
        state.character = reconcilePluginSnapshot(state.character, edit)
        flushSync()
        expect(renders).toBe(1)
        expect(state.character.chats[0].message[199].data).toContain('{{image::new}}')
    } finally { stop() }
})
