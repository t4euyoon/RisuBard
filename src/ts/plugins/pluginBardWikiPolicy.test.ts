import { expect, it, vi } from 'vitest'
import { decoratePluginRead, pluginReceivesBardWiki, preservePluginBardWikiSetting } from './pluginBardWikiPolicy'

it('defaults off and reads live settings independently for each plugin', () => {
    const plugins = [{ name: 'A', risuBardAutoContext: false }, { name: 'B', risuBardAutoContext: true }]
    expect(pluginReceivesBardWiki([{ name: 'old' }], 'old')).toBe(false)
    expect(pluginReceivesBardWiki(plugins, 'missing')).toBe(false)
    expect(pluginReceivesBardWiki(plugins, 'A')).toBe(false)
    expect(pluginReceivesBardWiki(plugins, 'B')).toBe(true)
    plugins[0].risuBardAutoContext = true
    expect(pluginReceivesBardWiki(plugins, 'A')).toBe(true)
})

it('preserves the host choice across replacement and defaults new imports off', () => {
    for (const enabled of [true, false]) {
        expect(preservePluginBardWikiSetting({ name: 'A', risuBardAutoContext: enabled }, { name: 'A', script: 'new' }))
            .toEqual({ name: 'A', script: 'new', risuBardAutoContext: enabled })
    }
    expect(preservePluginBardWikiSetting(undefined, { name: 'new' }).risuBardAutoContext).toBe(false)
})

it('does not start or await inquiry when disabled, and returns unchanged enrichment when enabled', async () => {
    const value = { message: ['latest'] }
    const stalled = vi.fn(() => new Promise<typeof value>(() => {}))
    expect(decoratePluginRead(value, false, stalled)).toBe(value)
    expect(stalled).not.toHaveBeenCalled()
    const enriched = { ...value, wiki: 'context' }
    expect(await decoratePluginRead(value, true, async () => enriched)).toBe(enriched)
})
