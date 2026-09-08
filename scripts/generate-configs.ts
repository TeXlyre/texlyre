// scripts/generate-configs.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { updateManifestExtensions } from './update-manifest-extensions.ts';

const Filename = fileURLToPath(import.meta.url);
const Dirname = path.dirname(Filename);
const rootDir = path.join(Dirname, '..');

interface NormalizedPwaColor {
	light: string;
	dark: string;
	fallback: string;
	adaptive: boolean;
}

async function loadConfig() {
	const configPath = path.join(rootDir, 'texlyre.config.ts');
	const { default: config } = await import(pathToFileURL(configPath).href);
	return config;
}

function deepMerge(target: any, source: any): any {
	const result = { ...target };

	for (const key in source) {
		if (
			source[key] &&
			typeof source[key] === 'object' &&
			!Array.isArray(source[key])
		) {
			result[key] = deepMerge(result[key] || {}, source[key]);
		} else if (source[key] !== undefined) {
			result[key] = source[key];
		}
	}

	return result;
}

function flattenIds(ids: string[] = []): string[] {
	return ids.map((id) => id.replace(/([A-Z])/g, '-$1').toLowerCase());
}

function flattenSettings(settings: any, prefix = ''): Record<string, any> {
	const result: Record<string, any> = {};

	for (const [key, value] of Object.entries(settings)) {
		const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
		const newKey = prefix ? `${prefix}-${kebabKey}` : kebabKey;

		if (value && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(result, flattenSettings(value, newKey));
		} else {
			result[newKey] = value;
		}
	}

	return result;
}

function flattenProperties(properties: any): Record<string, any> {
	const result: Record<string, any> = {};

	for (const [scope, props] of Object.entries(properties)) {
		for (const [key, value] of Object.entries(props as Record<string, any>)) {
			const flatKey = `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}:${scope}`;
			result[flatKey] = value;
		}
	}

	return result;
}

function normalizePwaColor(
	value: unknown,
	defaultColor: string,
): NormalizedPwaColor {
	if (typeof value === 'string' && value.length > 0) {
		return {
			light: value,
			dark: value,
			fallback: value,
			adaptive: false,
		};
	}

	if (value && typeof value === 'object') {
		const color = value as {
			light?: unknown;
			dark?: unknown;
			fallback?: unknown;
		};

		if (
			typeof color.light === 'string' &&
			color.light.length > 0 &&
			typeof color.dark === 'string' &&
			color.dark.length > 0
		) {
			return {
				light: color.light,
				dark: color.dark,
				fallback:
					typeof color.fallback === 'string' && color.fallback.length > 0
						? color.fallback
						: color.light,
				adaptive: true,
			};
		}
	}

	return {
		light: defaultColor,
		dark: defaultColor,
		fallback: defaultColor,
		adaptive: false,
	};
}

function generatePwaColorHead(pwa: any): string {
	const themeColor = normalizePwaColor(pwa.themeColor, '#000000');
	const backgroundColor = normalizePwaColor(pwa.backgroundColor, '#ffffff');
	const lines: string[] = ['  <!-- PWA adaptive colors:start -->'];

	if (themeColor.adaptive) {
		lines.push(
			`  <meta name="theme-color" content="${themeColor.light}" media="(prefers-color-scheme: light)">`,
			`  <meta name="theme-color" content="${themeColor.dark}" media="(prefers-color-scheme: dark)">`,
		);
	} else {
		lines.push(`  <meta name="theme-color" content="${themeColor.fallback}">`);
	}

	if (backgroundColor.adaptive) {
		lines.push(
			'  <style id="pwa-background-colors">',
			'    html,',
			'    body {',
			`      background-color: ${backgroundColor.light};`,
			'    }',
			'',
			'    @media (prefers-color-scheme: dark) {',
			'      html,',
			'      body {',
			`        background-color: ${backgroundColor.dark};`,
			'      }',
			'    }',
			'  </style>',
		);
	}

	lines.push('  <!-- PWA adaptive colors:end -->');
	return lines.join('\n');
}

function generatePluginsConfig(config: any) {
	const allPlugins: string[] = [];

	for (const [type, plugins] of Object.entries(config.plugins)) {
		for (const plugin of plugins as string[]) {
			allPlugins.push(`${type}/${plugin}`);
		}
	}

	const content = `// plugins.config.js
export default {
\tplugins: ${JSON.stringify(allPlugins, null, 2).replace(/\n/g, '\n\t')},
};
`;

	fs.writeFileSync(path.join(rootDir, 'plugins.config.js'), content);
}

function generateViteConfig(config: any) {
	const viteConfigPath = path.join(rootDir, 'vite.config.ts');
	let viteContent = fs.readFileSync(viteConfigPath, 'utf8');

	viteContent = viteContent.replace(
		/const basePath = ['"`][^'"`]*['"`];/,
		`const basePath = "${config.baseUrl}";`,
	);

	fs.writeFileSync(viteConfigPath, viteContent);
}

function generateIndexHtml(config: any) {
	const indexPath = path.join(rootDir, 'index.html');
	let indexContent = fs.readFileSync(indexPath, 'utf8');

	indexContent = indexContent.replace(
		/<title>.*?<\/title>/,
		`<title>${config.title}</title>`,
	);

	indexContent = indexContent.replace(
		/rel="icon"[^>]*>/,
		`rel="icon" type="image/x-icon" href="${config.favicon}" />`,
	);

	if (config.pwa?.enabled) {
		const pwaColorHead = generatePwaColorHead(config.pwa);
		const managedBlockPattern =
			/[ \t]*<!-- PWA adaptive colors:start -->[\s\S]*?<!-- PWA adaptive colors:end -->[ \t]*\n?/;

		if (managedBlockPattern.test(indexContent)) {
			indexContent = indexContent.replace(
				managedBlockPattern,
				`${pwaColorHead}\n`,
			);
		} else {
			// Remove the legacy single theme-color tag before adding the managed block.
			indexContent = indexContent.replace(
				/[ \t]*<meta\s+name=["']theme-color["'][^>]*>[ \t]*\n?/g,
				'',
			);
			indexContent = indexContent.replace(
				/(^[ \t]*<title>)/m,
				`${pwaColorHead}\n$1`,
			);
		}
	}

	fs.writeFileSync(indexPath, indexContent);
}

function generateManifest(config: any) {
	if (!config.pwa?.enabled || !config.pwa?.manifest) {
		return;
	}

	// Resolve manifest path relative to public/
	const manifestRel = config.pwa.manifest.startsWith('./')
		? config.pwa.manifest.slice(2)
		: config.pwa.manifest;

	const manifestPath = path.join(rootDir, 'public', manifestRel);

	if (!fs.existsSync(manifestPath)) {
		console.warn(
			`Manifest file not found at ${manifestPath}, skipping manifest generation.`,
		);
		return;
	}

	const raw = fs.readFileSync(manifestPath, 'utf8');
	let manifest: any;
	try {
		manifest = JSON.parse(raw);
	} catch (err) {
		console.error('Failed to parse manifest.json:', err);
		return;
	}

	// Non-redundant mapping:
	// - use pwa.* if defined
	// - otherwise fall back to top-level config (title/tagline/baseUrl)
	manifest.name = config.pwa.name ?? config.title ?? manifest.name;

	manifest.short_name =
		config.pwa.shortName ??
		config.projectName ??
		config.title ??
		manifest.short_name;

	manifest.description =
		config.pwa.description ?? config.tagline ?? manifest.description;

	manifest.start_url = config.pwa.startUrl ?? './';

	manifest.display = config.pwa.display ?? manifest.display ?? 'standalone';

	// The Web App Manifest only supports one static color. For adaptive config
	// objects, use their explicit fallback (or light if fallback is omitted).
	manifest.background_color = normalizePwaColor(
		config.pwa.backgroundColor,
		manifest.background_color ?? '#ffffff',
	).fallback;

	manifest.theme_color = normalizePwaColor(
		config.pwa.themeColor,
		manifest.theme_color ?? '#000000',
	).fallback;
	// Icons:
	// - If pwa.icons is provided, override
	// - Otherwise, keep whatever is already in manifest.json
	if (Array.isArray(config.pwa.icons) && config.pwa.icons.length > 0) {
		manifest.icons = config.pwa.icons;
	}

	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function generateUserdataFiles(config: any) {
	const writeUserdataFile = (
		filename: string,
		settings: any,
		properties: any,
		secrets: any,
		records: any,
	) => {
		const userdata = {
			version: config.userdata.version || '1.0.0',
			settings: flattenSettings(settings),
			properties: flattenProperties(properties),
			forceUpdate: {
				settings: flattenIds(config.userdata.forceUpdate?.settings),
				properties: flattenIds(config.userdata.forceUpdate?.properties),
			},
			secrets,
			records,
		};

		fs.writeFileSync(
			path.join(rootDir, filename),
			JSON.stringify(userdata, null, 2),
		);
	};

	const mergeUserdata = (...parts: any[]) => {
		return parts.reduce(
			(acc, part) => ({
				settings: deepMerge(acc.settings, part?.settings || {}),
				properties: deepMerge(acc.properties, part?.properties || {}),
				secrets: deepMerge(acc.secrets, part?.secrets || {}),
				records: deepMerge(acc.records, part?.records || {}),
			}),
			{ settings: {}, properties: {}, secrets: {}, records: {} },
		);
	};

	const base = config.userdata.default;
	const local = config.userdata.local;
	const mobile = config.userdata.mobile;

	writeUserdataFile(
		'userdata.json',
		base.settings,
		base.properties,
		base.secrets,
		base.records,
	);

	if (mobile) {
		const merged = mergeUserdata(base, mobile);
		writeUserdataFile(
			'userdata.mobile.json',
			merged.settings,
			merged.properties,
			merged.secrets,
			merged.records,
		);
	}

	if (local) {
		const merged = mergeUserdata(base, local);
		writeUserdataFile(
			'userdata.local.json',
			merged.settings,
			merged.properties,
			merged.secrets,
			merged.records,
		);
	}

	if (local && mobile) {
		const merged = mergeUserdata(base, local, mobile);
		writeUserdataFile(
			'userdata.local.mobile.json',
			merged.settings,
			merged.properties,
			merged.secrets,
			merged.records,
		);
	}
}

async function main() {
	console.log('Loading texlyre.config.ts...');
	const config = await loadConfig();

	console.log('Generating plugins.config.js...');
	generatePluginsConfig(config);

	console.log('Updating vite.config.ts basePath...');
	generateViteConfig(config);

	console.log('Updating index.html...');
	generateIndexHtml(config);

	console.log('Updating manifest.json...');
	generateManifest(config);

	console.log('Updating manifest.json share_target extensions...');
	await updateManifestExtensions(config);

	console.log('Generating userdata files...');
	generateUserdataFiles(config);

	console.log('All configs generated successfully!');
}

main().catch(console.error);
