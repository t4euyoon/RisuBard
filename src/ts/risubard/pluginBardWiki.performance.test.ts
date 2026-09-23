import { expect, it } from 'vitest'
import { selectBardWikiPluginRecentMessages, type BardWikiPluginMessage } from './pluginBardWiki'
import { selectNarrativeWorkingMessages } from './narrativeContext'

it('reads only the recent tail at 200 and 2000 turns', () => {
    for (const turns of [200, 2000]) {
        let reads = 0
        const messages: BardWikiPluginMessage[] = Array.from({ length: turns * 2 }, (_, i) => ({
            role: i % 2 ? 'char' : 'user',
            get data() { reads++; return `message ${i}` },
        }))
        const result = selectBardWikiPluginRecentMessages(messages, 12, false)
        expect(result).toHaveLength(24)
        expect(reads).toBeLessThan(100)
    }
})

it('matches the original selection across disabled, comment and boundary cases', () => {
    let seed = 42
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
    for (let run = 0; run < 200; run++) {
        const messages: BardWikiPluginMessage[] = Array.from({ length: random() % 100 }, (_, i) => ({
            role: (['user', 'char', 'assistant'] as const)[random() % 3],
            data: random() % 5 ? `message ${i}` : ' ',
            disabled: ([false, false, true, 'allBefore'] as const)[random() % 4],
            isComment: random() % 7 === 0,
        }))
        const boundary = messages.findLastIndex((m) => m.disabled === 'allBefore')
        const usable = messages.slice(boundary + 1).filter((m) => !m.disabled && !m.isComment && m.data.trim())
        for (const limit of [1, 2, 12]) for (const exclude of [false, true]) {
            expect(selectBardWikiPluginRecentMessages(messages, limit, exclude))
                .toEqual(selectNarrativeWorkingMessages(usable, limit, !exclude))
        }
    }
})
