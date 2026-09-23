<script lang="ts">
    import { language } from 'src/lang'
    import CheckInput from 'src/lib/UI/GUI/CheckInput.svelte'
    import type { PluginBardWikiSetting } from 'src/ts/plugins/pluginBardWikiPolicy'

    let { plugin, save }: { plugin: PluginBardWikiSetting; save: () => unknown } = $props()
</script>

<div class="mt-2 rounded-md border border-darkborderc p-3">
    <CheckInput name={language.pluginBardWikiAutoContext}
        check={plugin.risuBardAutoContext === true}
        onChange={(checked) => {
            plugin.risuBardAutoContext = checked
            void save()
        }} />
    <p class="mt-1 text-sm text-textcolor2">{language.pluginBardWikiAutoContextHelp}</p>
</div>
