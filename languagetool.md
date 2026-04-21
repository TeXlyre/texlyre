# LanguageTool Integration for Texlyre

This document explains the LanguageTool integration added to Texlyre, including the editor plugin, settings support, and Docker backend configuration.

## What was added

- A new LanguageTool plugin under `extras/lsp/languagetool/`
  - `settings.ts` defines user settings for enabling LanguageTool, the server URL, and language selection. Settings are registered under **Settings → LSP → LanguageTool**.
  - `LanguageToolPlugin.ts` exposes the plugin to Texlyre as an `LSPPlugin` and implements `isEnabled()`, which gates on both the `VITE_ENABLE_LANGUAGE_TOOL` environment flag and the user setting.
  - `index.ts` exports the plugin for plugin generation.

- A new CodeMirror extension in `src/extensions/codemirror/LanguageToolExtension.ts`
  - Calls the LanguageTool HTTP API at `/v2/check` (POST, `application/x-www-form-urlencoded`).
  - Converts LanguageTool matches into CodeMirror `Diagnostic` objects with `source: 'LanguageTool'`.
  - Attaches replacement suggestions to the diagnostic's `info` field so the code-actions tooltip can offer one-click fixes.
  - Supported file types: `tex`, `latex`, `typ`, `typst`, `md`, `markdown`, `txt`, `bib`, `bibtex`.
  - Lint hover tooltip is suppressed (`tooltipFilter: () => []`) to avoid conflicting with the right-click code-actions tooltip.

- False-positive filter in `LanguageToolExtension.ts` (`shouldIgnoreLanguageToolMatch`)
  - Whitespace/formatting messages (extra spaces, blank lines, etc.) are suppressed.
  - Matches for LaTeX/Typst command tokens (`\cmd`, `#arg`, `$var`) are suppressed.
  - Matches inside `\anycommand[…]` option brackets are suppressed (covers `\usepackage`, `\documentclass`, `\includegraphics`, and any other bracketed option list).
  - Matches inside `$…$` inline math and `$$…$$` display math are suppressed using an unescaped-dollar counter (odd count = inside math).
  - Matches inside `\begin{env}…\end{env}` blocks are suppressed for math environments (`equation`, `align`, `gather`, `multline`, etc.) and verbatim environments (`verbatim`, `lstlisting`, `minted`, `comment`, etc.).

- Code-actions tooltip in `src/extensions/codemirror/CodeActionsLSPExtension.ts`
  - Right-clicking on any diagnostic (from LanguageTool or an LSP server) shows a tooltip with the diagnostic message and replacement buttons.
  - The browser's native context menu is suppressed only when a diagnostic is present at the click position; otherwise it is left unchanged.
  - LanguageTool replacement suggestions stored in `diagnostic.info.replacements` are surfaced as quick-fix buttons alongside any LSP code actions.
  - `createCodeActionsExtension` is now registered unconditionally for all editors (not only when an LSP client is connected), so LanguageTool fixes are always available.

- Editor integration in `src/hooks/editor/useEditorView.ts`
  - Uses `pluginRegistry.getLSPPlugin('languagetool-lsp')?.isEnabled()` to decide whether to attach the extension. This delegates the enabled check to the plugin's own `isEnabled()` (which already gates on the env flag and user setting), keeping the integration consistent with how other LSP plugins are controlled.
  - Server URL and language are read from the registered settings (`languagetool-server-url`, `languagetool-language`).

- Plugin registration in `texlyre.config.ts`
  - Added `'languagetool'` to the `plugins.lsp` array so the plugin is included in the generated `plugins.config.js`.

- Environment flag support via `.env`
  - `VITE_ENABLE_LANGUAGE_TOOL=true` must be set to activate the integration.
  - When the flag is absent or `false`, the plugin reports itself as disabled and the extension is never attached, regardless of user settings.

## .env configuration

The integration is gated by an environment variable:

```env
VITE_ENABLE_LANGUAGE_TOOL=true
```

If this value is `false` or absent, the LanguageTool editor integration remains disabled even if the user setting is enabled.

## User settings

The following settings are registered by `LanguageToolPlugin` and appear under **Settings → LSP → LanguageTool**:

| Setting ID | Type | Default | Description |
|---|---|---|---|
| `languagetool-enabled` | checkbox | `true` | Enable or disable LanguageTool support |
| `languagetool-server-url` | text | `http://localhost:8010` | LanguageTool server base URL |
| `languagetool-language` | select | `en-US` | Document language sent to the server |

All three settings have `liveUpdate: true`, so changes take effect on the next editor rebuild without requiring a page reload.

Available language options: Auto, English (US), English (UK), German, French, Spanish.

## Docker backend

The LanguageTool server runs in Docker using `docker/compose.yaml`.

- Service name: `languagetool`
- Image: `erikvl87/languagetool:latest`
- Local port mapping: `8010:8010`
- Uses the local `docker/data/ngrams` volume for LanguageTool n-gram language models.

To start the backend container:

```bash
cd /root/texlyre_languagetools/texlyre
docker compose -f docker/compose.yaml up -d
```

The container exposes the LanguageTool API at:

```text
http://localhost:8010/v2/languages
```

Helper scripts in `docker/` are available for common operations:

```bash
docker/up_languagetool.sh      # start
docker/down_languagetool.sh    # stop
docker/logs_languagetool.sh    # view logs
```

## Running and testing

After installing dependencies and generating plugins, start the frontend with:

```bash
pnpm dev
```

The LanguageTool backend must be running and reachable at `http://localhost:8010`.

The editor attaches LanguageTool diagnostics for supported file types when all of the following are true:

- `VITE_ENABLE_LANGUAGE_TOOL=true` in `.env`
- **Settings → LSP → LanguageTool → Enable LanguageTool support** is checked
- A supported file extension is open in the editor

Right-clicking on an underlined word while a diagnostic is present opens the code-actions tooltip with the diagnostic message and replacement options.

## Files changed

- `texlyre.config.ts` — added `'languagetool'` to `plugins.lsp`
- `.env` — added `VITE_ENABLE_LANGUAGE_TOOL=true`
- `src/hooks/editor/useEditorView.ts` — attaches `LanguageToolExtension` via plugin registry; registers `CodeActionsExtension` unconditionally
- `src/extensions/codemirror/LanguageToolExtension.ts` — new file: HTTP linter + false-positive filter
- `src/extensions/codemirror/CodeActionsLSPExtension.ts` — context menu suppression, LanguageTool replacement actions, diagnostic message in tooltip
- `src/contexts/FileSyncContext.tsx` — graceful fallback when `FileTreeContext` is not mounted
- `extras/lsp/languagetool/settings.ts` — new file: setting descriptors
- `extras/lsp/languagetool/LanguageToolPlugin.ts` — new file: `LSPPlugin` implementation
- `extras/lsp/languagetool/index.ts` — new file: plugin export
- `docker/compose.yaml` — LanguageTool service definition

## Notes

- The plugin uses the LanguageTool HTTP API directly, not the WebSocket LSP transport used by other plugins. This avoids the need for a proxy and matches LanguageTool's native interface.
- The `isEnabled()` check in `LanguageToolPlugin` reads from `localStorage` directly (not via React state) because it is called outside the React component tree during plugin registration.
- Setting changes are picked up on the next editor view rebuild. Because all three settings have `liveUpdate: true`, this happens automatically when a setting is changed in the UI.
