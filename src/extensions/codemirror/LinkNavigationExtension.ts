// src/extensions/codemirror/linkNavigationExtention.ts
import { StateEffect, StateField } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { LinkDetector, type DetectedLink } from './linkNavigation/LinkDetector';
import { LinkNavigator } from './linkNavigation/LinkNavigator';

const setCurrentFilePath = StateEffect.define<string>();
const setFileName = StateEffect.define<string>();
const highlightLink = StateEffect.define<{ from: number; to: number } | null>();

const currentFilePathField = StateField.define<string>({
	create() {
		return '';
	},
	update(path, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setCurrentFilePath)) {
				return effect.value;
			}
		}

		return path;
	},
});

const fileNameField = StateField.define<string>({
	create() {
		return '';
	},
	update(name, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setFileName)) {
				return effect.value;
			}
		}

		return name;
	},
});

const linkMark = Decoration.mark({
	class: 'cm-link-hover',
});

const linkHighlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		decorations = decorations.map(tr.changes);

		for (const effect of tr.effects) {
			if (effect.is(highlightLink)) {
				if (effect.value) {
					const decoration = linkMark.range(effect.value.from, effect.value.to);
					decorations = Decoration.set([decoration]);
				} else {
					decorations = Decoration.none;
				}
			}
		}

		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});

class LinkNavigationPlugin {
	private detector: LinkDetector;
	private navigator: LinkNavigator;
	private currentLink: DetectedLink | null = null;
	private ctrlPressed: boolean = false;

	private hoverValidationToken = 0;
	private fileHoverCache = new Map<string, boolean>();

	constructor(private view: EditorView) {
		this.detector = new LinkDetector();
		this.navigator = new LinkNavigator();

		this.view.dom.addEventListener('mousemove', this.handleMouseMove);
		this.view.dom.addEventListener('click', this.handleClick);
		this.view.dom.addEventListener('mouseleave', this.handleMouseLeave);
		document.addEventListener('keydown', this.handleKeyDown);
		document.addEventListener('keyup', this.handleKeyUp);

		this.updateDetectorFileType();
	}

	update(update: ViewUpdate): void {
		const filePath = update.state.field(currentFilePathField, false);
		if (filePath) {
			this.navigator.setCurrentFilePath(filePath);
		}

		const fileName = update.state.field(fileNameField, false);
		if (fileName || update.docChanged || update.viewportChanged) {
			this.updateDetectorFileType();
		}

		if (update.docChanged) {
			this.fileHoverCache.clear();
		}
	}

	private updateDetectorFileType(): void {
		const fileName = this.view.state.field(fileNameField, false);
		const content = this.view.state.doc.toString();

		this.detector.setFileType(fileName, content);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Control' || event.key === 'Meta') {
			this.ctrlPressed = true;
			void this.highlightIfNavigable(this.currentLink);
		}
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		if (event.key === 'Control' || event.key === 'Meta') {
			this.ctrlPressed = false;
			this.hoverValidationToken++;
			this.clearHighlight();
		}
	};

	private handleMouseMove = (event: MouseEvent): void => {
		let pos: number | null;
		try {
			pos = this.view.posAtCoords({
				x: event.clientX,
				y: event.clientY,
			});
		} catch {
			this.currentLink = null;
			this.clearHighlight();
			return;
		}

		if (pos === null) {
			this.currentLink = null;
			this.clearHighlight();
			return;
		}

		const link = this.detector.detectLinkAtPosition(this.view, pos);
		if (!link) {
			this.currentLink = null;
			this.clearHighlight();
			return;
		}

		const linkChanged =
			!this.currentLink ||
			link.from !== this.currentLink.from ||
			link.to !== this.currentLink.to ||
			link.value !== this.currentLink.value ||
			link.type !== this.currentLink.type;

		this.currentLink = link;

		if (!this.ctrlPressed) {
			this.clearHighlight();
			return;
		}

		if (linkChanged) {
			void this.highlightIfNavigable(link);
		}
	};

	private handleClick = async (event: MouseEvent): Promise<void> => {
		if (!this.currentLink) return;

		const isCtrlOrCmd = event.ctrlKey || event.metaKey;
		if (!isCtrlOrCmd) return;

		if (this.currentLink.type === 'file') {
			const canNavigate = await this.navigator.canNavigateToFile(
				this.currentLink.value,
			);
			if (!canNavigate) {
				return;
			}
		}

		event.preventDefault();
		event.stopPropagation();

		await this.navigator.navigate(this.view, this.currentLink);
	};

	private handleMouseLeave = (): void => {
		this.currentLink = null;
		this.hoverValidationToken++;
		this.clearHighlight();
	};

	private async highlightIfNavigable(link: DetectedLink | null): Promise<void> {
		if (!link || !this.ctrlPressed) {
			return;
		}

		const token = ++this.hoverValidationToken;

		if (link.type !== 'file') {
			this.highlightCurrentLink();
			return;
		}

		const cacheKey = `${link.fileType}:${link.value}`;
		let exists = this.fileHoverCache.get(cacheKey);

		if (exists === undefined) {
			exists = await this.navigator.canNavigateToFile(link.value);
			this.fileHoverCache.set(cacheKey, exists);
		}

		if (token !== this.hoverValidationToken) {
			return;
		}

		const isStillCurrentFileLink =
			this.currentLink &&
			this.currentLink.type === 'file' &&
			this.currentLink.value === link.value &&
			this.currentLink.from === link.from &&
			this.currentLink.to === link.to;

		if (exists && isStillCurrentFileLink && this.ctrlPressed) {
			this.highlightCurrentLink();
		} else {
			this.clearHighlight();
		}
	}

	private highlightCurrentLink(): void {
		if (!this.currentLink) return;

		this.view.dispatch({
			effects: highlightLink.of({
				from: this.currentLink.from,
				to: this.currentLink.to,
			}),
		});
	}

	private clearHighlight(): void {
		this.view.dispatch({
			effects: highlightLink.of(null),
		});
	}

	destroy(): void {
		this.view.dom.removeEventListener('mousemove', this.handleMouseMove);
		this.view.dom.removeEventListener('click', this.handleClick);
		this.view.dom.removeEventListener('mouseleave', this.handleMouseLeave);
		document.removeEventListener('keydown', this.handleKeyDown);
		document.removeEventListener('keyup', this.handleKeyUp);
	}
}

export function createLinkNavigationExtension(
	fileName?: string,
	content?: string,
): Extension {
	const plugin = ViewPlugin.fromClass(LinkNavigationPlugin);

	const initialFileName = fileName || '';

	return [
		currentFilePathField,
		fileNameField.init(() => initialFileName),
		linkHighlightField,
		plugin,
		EditorView.baseTheme({
			'.cm-link-hover': {
				cursor: 'pointer',
			},
		}),
	];
}

export function updateLinkNavigationFilePath(
	view: EditorView,
	filePath: string,
): void {
	view.dispatch({
		effects: setCurrentFilePath.of(filePath),
	});
}

export function updateLinkNavigationFileName(
	view: EditorView,
	fileName: string,
): void {
	view.dispatch({
		effects: setFileName.of(fileName),
	});
}
