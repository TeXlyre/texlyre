import type {
	LatexPdfAdapterInstallResult,
	LatexPdfInteractionAdapter,
	LatexPdfInteractionContext,
} from './types';
import {
	attachPdfButtonHandler,
	flattenActionStrings,
	getAnnotationElement,
	getAnnotationName,
	makeClickable,
	setVisible,
} from './dom';

type PlaybackOptions = {
	autoplay: boolean;
	loop: boolean;
	palindrome: boolean;
	fps: number;
};

type FrameRecord = { name: string; index: number; annotationId: string };
type ControlRecord = { name: string; annotationId: string };
type Manifest = PlaybackOptions & {
	prefix: string;
	frames: FrameRecord[];
	controls: ControlRecord[];
};

type Instance = PlaybackOptions & {
	prefix: string;
	frames: HTMLElement[];
	controls: Map<string, HTMLElement>;
	index: number;
	timer: number | null;
	direction: 1 | -1;
	playing: boolean;
};

const DEFAULT_FPS = 15;

const CONTROL_SUFFIXES = [
	'PlayRight',
	'PlayLeft',
	'PauseRight',
	'PauseLeft',
	'PlayPauseRight',
	'PlayPauseLeft',
	'StepRight',
	'StepLeft',
	'EndRight',
	'EndLeft',
	'Plus',
	'Minus',
	'Reset',
] as const;

function collectJavaScript(context: LatexPdfInteractionContext): string {
	const sources: unknown[] = [context.analysis.documentActions];

	for (const page of context.analysis.pageAnnotations) {
		for (const annotation of page.annotations) {
			sources.push(
				annotation.action as Record<string, unknown>,
				annotation.actions,
				annotation.additionalActions,
				annotation.jsAction,
			);
		}
	}

	return sources.flatMap(flattenActionStrings).join('\n');
}

function extractFunctionBody(javascript: string, name: string): string {
	const start = javascript.search(new RegExp(`${name}\\s*=\\s*function`, 'i'));
	if (start < 0) return '';

	const open = javascript.indexOf('{', start);
	if (open < 0) return '';

	let depth = 0;
	for (let i = open; i < javascript.length; i++) {
		const char = javascript[i];
		if (char === '{') depth++;
		else if (char === '}' && --depth === 0)
			return javascript.slice(open, i + 1);
	}

	return '';
}

function detectPlaybackOptions(
	prefix: string,
	javascript: string,
): PlaybackOptions {
	const p = `a?${prefix}_`;
	const scoped =
		javascript.match(new RegExp(`(?<!\\w)${p}[^\n;]*`, 'gi'))?.join('\n') ||
		javascript;

	const fpsMatch = /_fps\s*=\s*(\d+(?:\.\d+)?)/i.exec(scoped);
	const intervalMatch = /(?:interval|delay)\s*[=:]\s*(\d+(?:\.\d+)?)/i.exec(
		scoped,
	);
	const milliseconds = intervalMatch ? Number(intervalMatch[1]) : 0;
	const rawFps = fpsMatch
		? Number(fpsMatch[1])
		: milliseconds > 0
			? 1000 / milliseconds
			: DEFAULT_FPS;

	const gotoNext =
		extractFunctionBody(javascript, `${p}gotoNext`) ||
		extractFunctionBody(javascript, `${p}gotoFwd`);

	const autoplay = new RegExp(`${p}play(?:Right|Fwd)\\s*\\(`, 'i').test(
		javascript,
	);

	const palindrome = new RegExp(
		`${p}(?:playsRight|playLeft|playBwd|gotoPrev)`,
		'i',
	).test(gotoNext);

	const loop =
		!palindrome &&
		new RegExp(`${p}(?:seekFrame\\s*\\(\\s*0|gotoBegin|stopFirst)`, 'i').test(
			gotoNext,
		);

	return {
		autoplay,
		loop,
		palindrome,
		fps: Math.max(
			1,
			Math.min(60, Number.isFinite(rawFps) ? rawFps : DEFAULT_FPS),
		),
	};
}

function buildManifests(context: LatexPdfInteractionContext): Manifest[] {
	const byPrefix = new Map<string, Manifest>();
	const javascript = collectJavaScript(context);

	const ensure = (prefix: string): Manifest => {
		let manifest = byPrefix.get(prefix);
		if (!manifest) {
			manifest = {
				prefix,
				frames: [],
				controls: [],
				...detectPlaybackOptions(prefix, javascript),
			};
			byPrefix.set(prefix, manifest);
		}
		return manifest;
	};

	for (const page of context.analysis.pageAnnotations) {
		for (const annotation of page.annotations) {
			const name = getAnnotationName(annotation);
			const annotationId = annotation.id ? String(annotation.id) : '';
			if (!name || !annotationId || annotation.subtype !== 'Widget') continue;

			const frameMatch = /^(\d+)\.(\d+)$/.exec(name);
			if (frameMatch) {
				ensure(frameMatch[1]).frames.push({
					name,
					index: Number(frameMatch[2]),
					annotationId,
				});
				continue;
			}

			const prefix = /^(\d+)\./.exec(name)?.[1] || /^anm(\d+)$/.exec(name)?.[1];
			if (prefix) ensure(prefix).controls.push({ name, annotationId });
		}
	}

	return Array.from(byPrefix.values()).map((manifest) => ({
		...manifest,
		frames: manifest.frames.sort((a, b) => a.index - b.index),
	}));
}

function control(instance: Instance, suffix: string): HTMLElement | undefined {
	return instance.controls.get(`${instance.prefix}.${suffix}`);
}

function setFrame(instance: Instance, nextIndex: number): void {
	if (instance.frames.length === 0) return;
	const clamped = Math.max(0, Math.min(instance.frames.length - 1, nextIndex));
	instance.frames.forEach((frame, index) => {
		setVisible(frame, index === clamped);
	});
	instance.index = clamped;
}

function refreshControls(instance: Instance): void {
	const playing = instance.playing;
	setVisible(control(instance, 'PlayRight'), !playing);
	setVisible(control(instance, 'PlayLeft'), !playing);
	setVisible(control(instance, 'PauseRight'), playing);
	setVisible(control(instance, 'PauseLeft'), playing);

	for (const suffix of CONTROL_SUFFIXES)
		makeClickable(control(instance, suffix));
	makeClickable(instance.controls.get(`anm${instance.prefix}`));
}

function stop(instance: Instance, resetDirection = false): void {
	if (instance.timer !== null) {
		window.clearInterval(instance.timer);
		instance.timer = null;
	}
	instance.playing = false;
	if (resetDirection) instance.direction = 1;
	refreshControls(instance);
}

function advance(instance: Instance): void {
	const last = instance.frames.length - 1;
	const next = instance.index + instance.direction;

	if (next >= 0 && next <= last) {
		setFrame(instance, next);
		return;
	}

	if (instance.palindrome) {
		instance.direction = instance.direction === 1 ? -1 : 1;
		setFrame(instance, instance.index + instance.direction);
		return;
	}

	if (instance.loop) {
		setFrame(instance, instance.direction === 1 ? 0 : last);
		return;
	}

	setFrame(instance, next > last ? last : 0);
	stop(instance);
}

function play(instance: Instance, direction: 1 | -1): void {
	if (instance.frames.length < 2) return;
	if (instance.timer !== null) window.clearInterval(instance.timer);

	instance.direction = direction;
	instance.playing = true;
	refreshControls(instance);
	instance.timer = window.setInterval(
		() => advance(instance),
		1000 / instance.fps,
	);
}

function changeSpeed(instance: Instance, fps: number): void {
	instance.fps = Math.max(1, Math.min(60, fps));
	if (instance.playing) play(instance, instance.direction);
}

function installManifest(
	context: LatexPdfInteractionContext,
	manifest: Manifest,
): LatexPdfAdapterInstallResult {
	const frames = manifest.frames
		.map((frame) => getAnnotationElement(context.pdfViewer, frame.annotationId))
		.filter(Boolean) as HTMLElement[];

	if (frames.length < 2) return { installed: false };

	const controls = new Map<string, HTMLElement>();
	for (const record of manifest.controls) {
		const el = getAnnotationElement(context.pdfViewer, record.annotationId);
		if (el) controls.set(record.name, el);
	}

	const instance: Instance = {
		...manifest,
		frames,
		controls,
		index: 0,
		timer: null,
		direction: 1,
		playing: false,
	};

	setFrame(instance, 0);
	refreshControls(instance);

	const toggle = (forward: boolean) => () => {
		if (instance.playing) {
			stop(instance);
			return;
		}
		const last = instance.frames.length - 1;
		if (forward && instance.index === last) setFrame(instance, 0);
		if (!forward && instance.index === 0) setFrame(instance, last);
		play(instance, forward ? 1 : -1);
	};

	const bind = (suffix: string, handler: () => void): (() => void) =>
		attachPdfButtonHandler(control(instance, suffix), handler);

	const disposers: Array<() => void> = [
		bind('StepRight', () => {
			stop(instance);
			setFrame(instance, instance.index + 1);
		}),
		bind('StepLeft', () => {
			stop(instance);
			setFrame(instance, instance.index - 1);
		}),
		bind('EndRight', () => {
			stop(instance, true);
			setFrame(instance, instance.frames.length - 1);
		}),
		bind('EndLeft', () => {
			stop(instance, true);
			setFrame(instance, 0);
		}),
		bind('PlayPauseRight', toggle(true)),
		bind('PlayPauseLeft', toggle(false)),
		bind('PlayRight', () => play(instance, 1)),
		bind('PlayLeft', () => play(instance, -1)),
		bind('PauseRight', () => stop(instance)),
		bind('PauseLeft', () => stop(instance)),
		bind('Plus', () => changeSpeed(instance, instance.fps * 1.1)),
		bind('Minus', () => changeSpeed(instance, instance.fps / 1.1)),
		bind('Reset', () => changeSpeed(instance, manifest.fps)),
		attachPdfButtonHandler(
			instance.controls.get(`anm${manifest.prefix}`),
			toggle(true),
		),
	];

	if (manifest.autoplay) play(instance, 1);

	return {
		installed: true,
		dispose: () => {
			stop(instance);
			for (const dispose of disposers) dispose();
		},
	};
}

export const AnimateAdapter: LatexPdfInteractionAdapter = {
	name: 'animate',
	detect: (context) =>
		buildManifests(context).some((manifest) => manifest.frames.length > 1),
	install: (context) => {
		const results = buildManifests(context).map((manifest) =>
			installManifest(context, manifest),
		);
		const disposers = results.flatMap((result) =>
			result.dispose ? [result.dispose] : [],
		);

		return {
			installed: results.some((result) => result.installed),
			dispose: () => {
				for (const dispose of disposers) dispose();
			},
		};
	},
};
