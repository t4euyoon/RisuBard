import { expect, it, vi } from 'vitest'

vi.mock('../stores.svelte', () => ({
    DBState: { db: {} },
    selectedCharID: { subscribe: (callback: (value: number) => void) => { callback(0); return () => {} } },
    selIdState: { selId: 0 },
}))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null }, downloadFile: () => {}, saveAsset: async () => '' }))
vi.mock('../alert', () => ({ notifySuccess: () => {}, alertError: () => {} }))
vi.mock('../../lang', () => ({ language: {}, changeLanguage: () => {} }))

const { DBState } = await import('../stores.svelte')
const { getCurrentCharacter, getCharacterByIndex } = await import('./database.svelte')

it('snapshots only the requested character and keeps the snapshot detached', () => {
    let unrelatedReads = 0
    const selected = { name: 'selected', chats: [{ message: [{ data: 'original' }] }] }
    const other = { get name() { unrelatedReads++; return 'unrelated' } }
    DBState.db = {
        characters: [selected, other],
        get plugins() { unrelatedReads++; return [{ script: 'large bundle' }] },
    } as unknown as typeof DBState.db
    for (const snapshot of [getCurrentCharacter({ snapshot: true }), getCharacterByIndex(0, { snapshot: true })]) {
        expect(snapshot).toEqual(selected)
        snapshot.chats[0].message[0].data = 'edited'
    }
    expect(selected.chats[0].message[0].data).toBe('original')
    expect(getCurrentCharacter()).toBe(selected)
    expect(unrelatedReads).toBe(0)
})
