// src/extensions/codemirror/HighlightThemeExtension.ts
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
    abcdef, abyss, androidstudio, andromeda, atomone, aura,
    basicLight, basicDark, bbedit, bespin, copilot, darcula, dracula,
    duotoneDark, duotoneLight, eclipse, githubLight, githubDark,
    gruvboxDark, kimbie, materialDark, materialLight, monokai,
    monokaiDimmed, noctisLilac, nord, okaidia, quietlight, red,
    solarizedLight, solarizedDark, sublime, tokyoNight, tokyoNightStorm,
    tokyoNightDay, tomorrowNightBlue, vscodeDark, vscodeLight, whiteDark, whiteLight,
    xcodeDark, xcodeLight
} from '@uiw/codemirror-themes-all';
import type { HighlightTheme } from '../../types/editor';

const APP_THEME_MAP: Record<string, HighlightTheme> = {
    dark: 'dark',
    light: 'light',
    monokai: 'monokai',
    tomorrow_night_blue: 'tomorrowNightBlue',
    github_light: 'githubLight',
    solarized_light: 'solarizedLight',
    atom_light: 'eclipse',
};

const THEME_EXTENSION_MAP: Record<HighlightTheme, Extension> = {
    auto: syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    light: syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    dark: oneDark,
    abcdef: abcdef,
    abyss: abyss,
    androidstudio: androidstudio,
    andromeda: andromeda,
    atomone: atomone,
    aura: aura,
    basicLight: basicLight,
    basicDark: basicDark,
    bbedit: bbedit,
    bespin: bespin,
    copilot: copilot,
    darcula: darcula,
    dracula: dracula,
    duotoneDark: duotoneDark,
    duotoneLight: duotoneLight,
    eclipse: eclipse,
    githubLight: githubLight,
    githubDark: githubDark,
    gruvboxDark: gruvboxDark,
    kimbie: kimbie,
    materialDark: materialDark,
    materialLight: materialLight,
    monokai: monokai,
    monokaiDimmed: monokaiDimmed,
    noctisLilac: noctisLilac,
    nord: nord,
    okaidia: okaidia,
    quietlight: quietlight,
    red: red,
    solarizedLight: solarizedLight,
    solarizedDark: solarizedDark,
    sublime: sublime,
    tokyoNight: tokyoNight,
    tokyoNightStorm: tokyoNightStorm,
    tokyoNightDay: tokyoNightDay,
    tomorrowNightBlue: tomorrowNightBlue,
    vscodeDark: vscodeDark,
    vscodeLight: vscodeLight,
    whiteLight: whiteLight,
    whiteDark: whiteDark,
    xcodeDark: xcodeDark,
    xcodeLight: xcodeLight,
};

export function resolveHighlightTheme(theme: HighlightTheme): Extension {
    if (theme === 'auto') {
        const appTheme = document.documentElement.getAttribute('data-theme') ?? '';
        const mapped = APP_THEME_MAP[appTheme];
        return mapped ? THEME_EXTENSION_MAP[mapped] : syntaxHighlighting(defaultHighlightStyle, { fallback: true });
    }
    return THEME_EXTENSION_MAP[theme];
}