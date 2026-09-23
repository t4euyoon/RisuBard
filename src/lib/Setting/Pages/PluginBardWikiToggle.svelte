<script lang="ts">
    import { language } from 'src/lang'
    import CheckInput from 'src/lib/UI/GUI/CheckInput.svelte'
    import { tooltip } from 'src/ts/gui/tooltip'
    import type { PluginBardWikiSetting } from 'src/ts/plugins/pluginBardWikiPolicy'

    let { plugin, save }: { plugin: PluginBardWikiSetting; save: () => unknown } = $props()
</script>

<div class="mt-2 flex items-center gap-2">
    <CheckInput name={language.pluginBardWikiAutoContext}
        margin={false}
        check={plugin.risuBardAutoContext === true}
        onChange={(checked) => {
            plugin.risuBardAutoContext = checked
            void save()
        }} />
    <button type="button"
        class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-darkborderc text-xs text-textcolor2 hover:text-textcolor focus-visible:outline focus-visible:outline-2"
        aria-label={language.pluginBardWikiAutoContextHelp}
        use:tooltip={language.pluginBardWikiAutoContextHelp}>?</button>
</div>
