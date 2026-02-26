// scripts/update-manifest-extensions.ts
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.resolve(ROOT_DIR, "public/manifest.json");

function extractSupportedExtensions(source: string): Array<{ extension?: string; mimeType?: string }> {
    const stripped = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    const fnStart = stripped.search(/getSupportedExtensions\s*:\s*\(\s*\)\s*=>/);
    if (fnStart === -1) return [];

    const arrowEnd = stripped.indexOf("=>", fnStart) + 2;
    let pos = arrowEnd;
    while (pos < stripped.length && /\s/.test(stripped[pos])) pos++;

    // find the first [ or ( bracket, skipping over any identifier characters
    while (pos < stripped.length && stripped[pos] !== "[" && stripped[pos] !== "(") pos++;

    const opener = stripped[pos];
    const closer = opener === "[" ? "]" : opener === "(" ? ")" : null;
    if (!closer) return [];

    let depth = 0;
    let end = pos;
    for (let i = pos; i < stripped.length; i++) {
        if (stripped[i] === opener) depth++;
        else if (stripped[i] === closer) {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }

    const fnBody = stripped.slice(arrowEnd, end).trim();

    const referencedVars = new Set<string>();
    for (const match of fnBody.matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) {
        referencedVars.add(match[1]);
    }

    const varDeclarations: string[] = [];
    for (const varName of referencedVars) {
        const varMatch = stripped.match(
            new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*\\[[^\\]]+\\]`)
        );
        if (varMatch) varDeclarations.push(varMatch[0] + ";");
    }

    const evalSource = `
        const t = (s) => s;
        ${varDeclarations.join("\n")}
        const fn = () => ${fnBody};
        return fn();
    `;

    try {
        return new Function(evalSource)() ?? [];
    } catch (err) {
        console.warn('eval error:', (err as Error).message);
        return [];
    }
}

export async function updateManifestExtensions(config: any) {
    const enabledViewers: string[] = config.plugins?.viewers ?? [];

    const allExtensions = new Set<string>();
    const allMimeTypes = new Set<string>();

    for (const viewer of enabledViewers) {
        const pluginDir = path.join(ROOT_DIR, "extras", "viewers", viewer);
        if (!fs.existsSync(pluginDir)) continue;

        const files = fs.readdirSync(pluginDir).filter(
            (f: string) => f.endsWith(".ts") && f.toLowerCase().includes("plugin")
        );

        for (const file of files) {
            try {
                const source = fs.readFileSync(path.join(pluginDir, file), "utf8");
                const entries = extractSupportedExtensions(source);
                for (const entry of entries) {
                    if (entry.extension) allExtensions.add(`.${entry.extension}`);
                    if (entry.mimeType) allMimeTypes.add(entry.mimeType);
                }
            } catch (err) {
                console.warn(`⚠️  Could not parse plugin file ${file}:`, (err as Error).message);
            }
        }
    }

    if (allExtensions.size === 0 && allMimeTypes.size === 0) {
        console.log("✓ No viewer extensions found, manifest share_target unchanged");
        return;
    }

    const manifest = await fs.readJson(MANIFEST_PATH);
    const acceptArray: string[] | undefined =
        manifest?.share_target?.params?.files?.[0]?.accept;

    if (!Array.isArray(acceptArray)) {
        console.warn("⚠️  manifest.json share_target accept array not found");
        return;
    }

    const existing = new Set(acceptArray);
    let added = 0;

    for (const mime of allMimeTypes) {
        if (!existing.has(mime)) {
            acceptArray.push(mime);
            existing.add(mime);
            added++;
        }
    }

    for (const ext of allExtensions) {
        if (!existing.has(ext)) {
            acceptArray.push(ext);
            existing.add(ext);
            added++;
        }
    }

    if (added > 0) {
        await fs.writeJson(MANIFEST_PATH, manifest, { spaces: 2 });
        console.log(`✓ Added ${added} entries to manifest.json share_target accept`);
    } else {
        console.log("✓ manifest.json share_target accept already up to date");
    }
}