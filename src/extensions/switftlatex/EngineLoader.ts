// src/extensions/switftlatex/EngineLoader.ts
export class EngineLoader {
	private static loadedScripts = new Set<string>();

	static async loadScript(src: string): Promise<void> {
		if (EngineLoader.loadedScripts.has(src)) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = src;
			script.onload = () => {
				EngineLoader.loadedScripts.add(src);
				resolve();
			};
			script.onerror = (_error) => {
				reject(new Error(`Failed to load script: ${src}`));
			};
			document.head.appendChild(script);
		});
	}

	static async loadScripts(scripts: string[]): Promise<void> {
		for (const script of scripts) {
			await EngineLoader.loadScript(script);
		}
	}

	static isScriptLoaded(src: string): boolean {
		return EngineLoader.loadedScripts.has(src);
	}

	static removeScript(src: string): void {
		const script = document.querySelector(`script[src="${src}"]`);
		if (script) {
			script.remove();
			EngineLoader.loadedScripts.delete(src);
		}
	}
}
