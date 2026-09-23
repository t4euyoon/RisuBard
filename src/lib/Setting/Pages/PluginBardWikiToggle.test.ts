import { expect, it, vi } from 'vitest'
import { flushSync, mount, tick, unmount } from 'svelte'
import PluginBardWikiToggle from './PluginBardWikiToggle.svelte'

vi.mock('src/lang', () => ({ language: { pluginBardWikiAutoContext: 'BardWiki 문맥 자동 제공', pluginBardWikiAutoContextHelp: '기본 꺼짐' } }))

it('shows missing settings as off, persists a toggle, and restores the choice', async () => {
    const plugin = { name: 'Asset Maid', risuBardAutoContext: undefined as boolean | undefined }
    const save = vi.fn()
    const target = document.body.appendChild(document.createElement('div'))
    let instance = mount(PluginBardWikiToggle, { target, props: { plugin, save } })
    try {
        flushSync()
        const input = target.querySelector('input')!
        expect(input.checked).toBe(false)
        input.click(); await tick()
        expect(plugin.risuBardAutoContext).toBe(true)
        expect(save).toHaveBeenCalledTimes(1)
        await unmount(instance)
        instance = mount(PluginBardWikiToggle, { target, props: { plugin, save } })
        flushSync()
        expect(target.querySelector('input')!.checked).toBe(true)
        target.querySelector('input')!.click(); await tick()
        expect(plugin.risuBardAutoContext).toBe(false)
    } finally { await unmount(instance); target.remove() }
})
