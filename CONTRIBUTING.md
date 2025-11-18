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

```typescript
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

The source of truth is `en.json`, but Crowdin uses the auto-generated `base-en.json` which includes pluralization forms (`_one`, `_two`, `_few`, `_many`, `_other`, and base phrases).

## Questions?

Open an issue or start a discussion. We're here to help!

---

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.