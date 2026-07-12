// src/extensions/typst.ts/LongPathPackageRegistry.ts
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/dist/esm/fs/memory.mjs';
import { FetchPackageRegistry } from '@myriaddreamin/typst.ts/dist/esm/fs/package.mjs';
import {
	withAccessModel,
	withPackageRegistry,
} from '@myriaddreamin/typst.ts/dist/esm/options.init.mjs';
import { parseTar } from 'nanotar';
import { ungzip } from 'pako';

export class LongPathFetchPackageRegistry extends FetchPackageRegistry {
	resolve(spec: any, _context: any): string | undefined {
		if (spec.namespace !== 'preview') {
			return undefined;
		}

		const path = this.resolvePath(spec);
		if (this.cache.has(path)) {
			return this.cache.get(path)?.();
		}

		const data = this.pullPackageData(spec);
		if (!data) {
			return undefined;
		}

		const previewDir = `/@memory/fetch/packages/${spec.namespace}/${spec.name}/${spec.version}`;
		const files = parseTar(ungzip(data)).filter((file) => file.type === 'file');
		const cacheClosure = () => {
			for (const file of files) {
				(this as any).am.insertFile(
					`${previewDir}/${file.name}`,
					file.data ? file.data.slice() : new Uint8Array(0),
					new Date((file.attrs?.mtime ?? 0) * 1000),
				);
			}
			return previewDir;
		};
		this.cache.set(path, cacheClosure);
		return cacheClosure();
	}
}

export function longPathFetchPackageRegistry() {
	const accessModel = new MemoryAccessModel();
	return {
		key: 'package-registry$fetch',
		forRoles: ['compiler'],
		provides: [
			withAccessModel(accessModel),
			withPackageRegistry(new LongPathFetchPackageRegistry(accessModel)),
		],
	};
}
