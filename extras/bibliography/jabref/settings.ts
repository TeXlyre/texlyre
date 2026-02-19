// extras/bibliography/jabref/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getJabrefLSPSettings = (): Setting[] => [
  {
    id: 'jabref-lsp-enabled',
    category: t("Bibliography"),
    subcategory: t("JabRef"),
    type: 'checkbox',
    label: t("Enable JabRef LSP"),
    description: t("Enable JabRef Language Server Protocol integration for bibliography management"),
    defaultValue: false,
    liveUpdate: false
  },
  {
    id: 'jabref-lsp-server-url',
    category: t("Bibliography"),
    subcategory: t("JabRef"),
    type: 'text',
    label: t("LSP Server URL"),
    description: t("WebSocket URL for the JabRef LSP server"),
    defaultValue: 'ws://localhost:2087/',
    liveUpdate: false
  },
  {
    id: 'jabref-lsp-max-completions',
    category: t("Bibliography"),
    subcategory: t("JabRef"),
    type: 'number',
    label: t("Maximum completion items"),
    description: t("Maximum number of citation suggestions to show"),
    defaultValue: 20,
    min: 5,
    max: 100
  },
  {
    id: 'jabref-lsp-auto-import',
    category: t("Bibliography"),
    subcategory: t("JabRef"),
    type: 'checkbox',
    label: t("Auto-import external citations"),
    description: t("Automatically import external bibliography entries when selected"),
    defaultValue: true
  },
  // {
  // 	id: "jabref-lsp-show-import-preview",
  // 	category: "LSP",
  // 	subcategory: "JabRef",
  // 	type: "checkbox",
  // 	label: "Show import preview",
  // 	description: "Preview BibTeX entry before importing",
  // 	defaultValue: false,
  // },
  {
    id: 'jabref-lsp-merge-duplicates',
    category: t("Bibliography"),
    subcategory: t("JabRef"),
    type: 'select',
    label: t("Duplicate handling"),
    description: t("How to handle entries that already exist locally"),
    defaultValue: 'keep-local',
    options: [
      { label: t("Keep local version"), value: 'keep-local' },
      { label: t("Replace with external"), value: 'replace' },
      { label: t("Rename imported entry"), value: 'rename' }
    ]

  }
  // {
  // 	id: 'jabref-lsp-custom-script',
  // 	category: 'LSP',
  //	subcategory: 'JabRef',
  //	type: 'codemirror',
  //	label: 'Custom JavaScript',
  //	description: 'Enter custom JavaScript code',
  //	defaultValue: '// Your code here\nconsole.log("Hello World");',
  //	codeMirrorOptions: {
  //		language: 'javascript',
  //		height: 15,
  //		lineNumbers: true,
  //		resizable: true,
  //		theme: 'auto',
  //	}
  // },
];