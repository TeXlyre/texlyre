import { DEFAULT_SETTINGS_RAW, LatexSuitePluginSettingsRaw  } from "latex-suite";


export const defaultLatexSuiteSettings: LatexSuitePluginSettingsRaw = {
    ...DEFAULT_SETTINGS_RAW,
    snippetsEnabled: false,
    autoDelete$: false,
    concealEnabled: false,
}