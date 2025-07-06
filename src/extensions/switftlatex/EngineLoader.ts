// src/extensions/switftlatex/EngineLoader.ts
export class EngineLoader {
	private static loadedScripts = new Set<string>();

	static async loadScript(src: string): Promise<void> {
		if (this.loadedScripts.has(src)) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = src;
			script.onload = () => {
				this.loadedScripts.add(src);
				resolve();
			};
			script.onerror = (error) => {
				reject(new Error(`Failed to load script: ${src}`));
			};
			document.head.appendChild(script);
		});
	}

	static async loadScripts(scripts: string[]): Promise<void> {
		for (const script of scripts) {
			await this.loadScript(script);
		}
	}

	static isScriptLoaded(src: string): boolean {
		return this.loadedScripts.has(src);
	}

	static removeScript(src: string): void {
		const script = document.querySelector(`script[src="${src}"]`);
		if (script) {
			script.remove();
			this.loadedScripts.delete(src);
		}
	}
}
