/** Reuse unchanged JSON branches when a plugin writes back a detached snapshot.
 * This keeps historical messages stable for Svelte while preserving replacement
 * semantics (including removed properties). Neither input is mutated.
 */
export function reconcilePluginSnapshot<T>(previous: T, incoming: T): T {
    if (Object.is(previous, incoming)) return previous
    if (!previous || !incoming || typeof previous !== 'object' || typeof incoming !== 'object') {
        return incoming
    }
    const array = Array.isArray(incoming)
    if (array !== Array.isArray(previous)) return incoming
    if (!array && (Object.getPrototypeOf(previous) !== Object.prototype
        || Object.getPrototypeOf(incoming) !== Object.prototype)) return incoming
    const before = previous as Record<string, unknown>
    const after = incoming as Record<string, unknown>
    const keys = Object.keys(after)
    let unchanged = keys.length === Object.keys(before).length
        && (!array || (previous as unknown[]).length === (incoming as unknown[]).length)
    const result = array ? new Array((incoming as unknown[]).length) : {}
    for (const key of keys) {
        const exists = Object.hasOwn(before, key)
        const value = exists ? reconcilePluginSnapshot(before[key], after[key]) : after[key]
        if (!exists || !Object.is(value, before[key])) unchanged = false
        Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true })
    }
    return unchanged ? previous : result as T
}

