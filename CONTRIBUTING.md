# Contributing to TeXlyre

Thanks for your interest in contributing! TeXlyre welcomes contributions of all kinds.

## Quick Start

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run `npm run lint` to check code style
5. Submit a pull request

## Development Setup

```bash
git clone https://github.com/texlyre/texlyre.git
cd texlyre
npm install
npm run dev
```

## What We Need Help With

- **Bug fixes** - Check our [issues](https://github.com/texlyre/texlyre/issues)
- **Plugin development** - See `extras/` directory for examples
- **Documentation** - Improve README, add code comments
- **Testing** - Help test on different browsers and devices
- **Translations** - Add translations for existing languages (locales), add new languages, and suggest fixes for incorrect wording

## Code Guidelines

- Follow existing code style (we use ESLint)
- Keep commits focused and descriptive
- Test your changes thoroughly

## Plugin Development

Plugins go in the `extras/` directory. Add your plugin path to `plugins.config.js` to enable it.

## Translation & Localization

TeXlyre uses [Crowdin](https://crowdin.com/project/texlyre) for community translations.

### Contributing Translations

1. Visit our [Crowdin project](https://crowdin.com/project/texlyre)
2. Select your language and start translating
3. All translations are manually synced to the repository on release

### Adding a New Language

To add a new language to TeXlyre:

1. Add the language JSON file to `translations/locales/`
2. Import and register it in `src/i18n.ts`:

```ts
import newLangTranslations from '../translations/locales/xx.json';

// In resources:
xx: {
  translation: newLangTranslations,
}
```

3. Add configuration to `translations/languages.config.json`:

```json
{
  "code": "xx",
  "name": "Language Name",
  "nativeName": "Native Name",
  "direction": "ltr",
  "filePath": "locales/xx.json"
}
```

4. Finally, make sure to run the following script to sort and check the language configurations (`npm`, `pnpm`, and `yarn` supported):

```bash
npm run i18n:full
```

### Using Translations in Code

Translation keys are the full English phrases.

#### Plain Text

```ts
import { t } from '@/i18n';

t("Automatically center images when they are loaded");
```

Variables can be inserted by passing an object as the second argument. Multiple variables are supported and must match the placeholders defined in the translation string.

```ts
t("{count} bytes", { count: 5 });
t("{hours}h {minutes}m remaining", { hours: 2, minutes: 30 });
```

Variables are referenced in translation files using double curly braces, for example `{{count}}`, `{{hours}}`, and `{{minutes}}`.


#### Rich Text and Components

```tsx
import { Trans } from 'react-i18next';

<Trans
  i18nKey="Not saved automatically. Click the <icon /> <strong>Save</strong> button or <strong>Ctrl+S</strong>"
  components={{
    strong: <strong />,
    icon: <> <SaveIcon />{' '} </>
  }}
/>
```

Tags used in `i18nKey` must exist unchanged in all translations.

#### Plurals

```json
"{count} bytes": "{{count}} Bytes",
"{count} bytes_one": "{{count}} Byte",
"{count} bytes_other": "{{count}} Bytes"
```

The source of truth is `en.json`, but Crowdin uses the auto-generated `base-en.json` which includes pluralization forms (`_one`, `_two`, `_few`, `_many`, `_other`, and base phrases). Only the `{count}` variable is supported for counting. 

Some languages require a few or all of the pluralization forms. It is not necessary to include all variations for languages that don't require them.

### Translation Dos & Don’ts

#### Do

* Keep the English key exactly the same
* Preserve all tags (`<strong />`, `<icon />`) and variables (`{{count}}`)
* Follow existing pluralization patterns

#### Don’t

* Change or rephrase the English key
* Remove, rename, or reorder tags
* Translate variable names or placeholders


## Questions?

Open an [issue](https://github.com/TeXlyre/texlyre/issues) or start a [discussion](https://github.com/TeXlyre/texlyre/discussions).

---

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.