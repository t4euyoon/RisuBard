import { expect, it } from 'vitest'
import { decoratePluginRead } from './pluginBardWikiPolicy'
import { flushSync } from 'svelte'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { reconcilePluginSnapshot } from './pluginSnapshotExperiment'
import { selectBardWikiPluginRecentMessages, type BardWikiPluginMessage } from '../risubard/pluginBardWiki'
import { selectNarrativeWorkingMessages } from '../risubard/narrativeContext'

function messages(turns: number): BardWikiPluginMessage[] {
    return Array.from({ length: turns * 2 }, (_, i) => ({
        role: i % 2 ? 'char' : 'user',
        data: `${i}: ` + 'The character enters the room. **A new scene begins.**\n\n'.repeat(35),
        disabled: false,
    }))
}
function character(turns: number, id = 0) {
    return { chaId: `c${id}`, name: `Character ${id}`, chatPage: 0,
        chats: [{ id: `chat${id}`, message: messages(turns), localLore: [], scriptstate: {} }],
        additionalAssets: Array.from({ length: turns }, (_, i) => [`asset${i}`, `/asset/${i}`, 'png']),
    }
}
function oldSelect(input: readonly BardWikiPluginMessage[]) {
    let start = 0
    for (let i = input.length - 1; i >= 0; i--) if (input[i].disabled === 'allBefore') { start = i + 1; break }
    return selectNarrativeWorkingMessages(input.slice(start).filter(m =>
        m.disabled !== true && m.disabled !== 'allBefore' && m.isComment !== true
        && typeof m.data === 'string' && m.data.trim().length > 0), 12, true)
}
function median(values: number[]) { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] }
const rows: Record<string, unknown>[] = []
function pair(label: string, before: () => unknown, after: () => unknown, batch = 1) {
    const samples = [[], []] as number[][]
    for (let round = 0; round < 18; round++) {
        for (const variant of round % 2 ? [1, 0] : [0, 1]) {
            const start = performance.now()
            for (let i = 0; i < batch; i++) (variant ? after : before)()
            if (round >= 3) samples[variant].push((performance.now() - start) / batch)
        }
    }
    rows.push({ label, beforeMs: median(samples[0]), afterMs: median(samples[1]), samples: 15 })
}

it.skipIf(process.env.RISUBARD_PERF_COMPARE !== '1')('records before/after costs without treating wall-clock timing as a correctness assertion', async () => {
    for (const turns of [200, 2000]) {
        for (const count of [1, 10]) {
            const db = $state({ characters: Array.from({ length: count }, (_, i) => character(turns, i)),
                plugins: [{ script: 'x'.repeat(2_000_000) }] })
            expect($state.snapshot(db).characters[0]).toEqual($state.snapshot(db.characters[0]))
            pair(`snapshot/${turns}turns/${count}characters`,
                () => $state.snapshot(db).characters[0], () => $state.snapshot(db.characters[0]))
        }
        const input = messages(turns)
        expect(oldSelect(input)).toEqual(selectBardWikiPluginRecentMessages(input, 12, false))
        pair(`recent/${turns}turns`, () => oldSelect(input), () => selectBardWikiPluginRecentMessages(input, 12, false), 50)

        for (const observers of ['none', 'message-object', 'message-text', 'character-object'] as const) {
            const state = $state({ character: character(turns) })
            let effects = 0
            const visible = Math.min(40, turns * 2)
            const stop = $effect.root(() => {
                if (observers === 'none') return
                for (let i = turns * 2 - visible; i < turns * 2; i++) {
                    if (observers === 'message-object') {
                        const value = $derived(state.character.chats[0].message[i])
                        $effect(() => { value; effects++ })
                    } else if (observers === 'message-text') {
                        const value = $derived(state.character.chats[0].message[i].data)
                        $effect(() => { value; effects++ })
                    } else {
                        const value = $derived(state.character)
                        $effect(() => { value; effects++ })
                    }
                }
            })
            flushSync()
            try {
                for (const mutation of ['asset', 'last-message'] as const) {
                    const samples = [[], []] as number[][]
                    const counts = [[], []] as number[][]
                    for (let round = 0; round < 18; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
                        const incoming = $state.snapshot(state.character)
                        if (mutation === 'asset') incoming.additionalAssets[incoming.additionalAssets.length - 1][0] = `${round}/${variant}`
                        else incoming.chats[0].message.at(-1)!.data = `edited ${round}/${variant}`
                        const previousEffects = effects
                        const start = performance.now()
                        state.character = variant ? reconcilePluginSnapshot(state.character, incoming) : incoming
                        flushSync()
                        if (round >= 3) { samples[variant].push(performance.now() - start); counts[variant].push(effects - previousEffects) }
                    }
                    rows.push({ label: `write/${turns}turns/${observers}/${mutation}`, beforeMs: median(samples[0]), afterMs: median(samples[1]),
                        beforeEffects: median(counts[0]), afterEffects: median(counts[1]), visibleMessages: visible, samples: 15 })
                }
            } finally { stop() }
        }
    }
    // Identical simulated inquiry cost, not an OCI latency measurement.
    for (const enabled of [true, false]) {
        let calls = 0
        const start = performance.now()
        for (let i = 0; i < 5; i++) await decoratePluginRead({}, enabled, async value => {
            calls++; await new Promise(resolve => setTimeout(resolve, 20)); return value
        })
        rows.push({ label: `inquiry-simulation/${enabled ? 'on' : 'off'}`, elapsedMs: performance.now() - start, calls })
    }
    mkdirSync(resolve('..', '.analysis'), { recursive: true })
    writeFileSync(resolve('..', '.analysis', 'plugin-performance-comparison.json'), JSON.stringify({
        environment: 'Vitest + happy-dom, real Svelte proxies; synthetic data; no OCI/network/image generation',
        bodyCharacters: messages(1)[0].data.length, rows,
    }, null, 2))
    console.log(JSON.stringify(rows))
}, 120_000)
