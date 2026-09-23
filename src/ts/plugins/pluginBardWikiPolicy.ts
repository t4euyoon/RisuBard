export interface PluginBardWikiSetting {
    name: string
    risuBardAutoContext?: boolean
}

/** Read live host settings on every call; old/missing settings default to off. */
export function pluginReceivesBardWiki(plugins: readonly PluginBardWikiSetting[], name: string): boolean {
    return plugins.find(plugin => plugin.name === name)?.risuBardAutoContext === true
}

export function preservePluginBardWikiSetting<T extends PluginBardWikiSetting>(previous: PluginBardWikiSetting | undefined, incoming: T): T & { risuBardAutoContext: boolean } {
    return { ...incoming, risuBardAutoContext: previous?.risuBardAutoContext === true }
}

export function decoratePluginRead<T>(snapshot: T, enabled: boolean, decorate: (value: T) => T | Promise<T>): T | Promise<T> {
    return enabled ? decorate(snapshot) : snapshot
}
