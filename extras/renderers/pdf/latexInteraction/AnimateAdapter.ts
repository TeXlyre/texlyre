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

type FrameRecord = {
	name: string;
	index: number;
	annotationId: string;
};

type ControlRecord = {
	name: string;
	annotationId: string;
};

type AnimatePlaybackOptions = {
	autoplay: boolean;
	loop: boolean;
	palindrome: boolean;
	fps: number;
};

type AnimateManifest = AnimatePlaybackOptions & {
	prefix: string;
	frames: FrameRecord[];
	controls: ControlRecord[];
};

type AnimateInstance = AnimatePlaybackOptions & {
	prefix: string;
	frames: HTMLElement[];
	controls: Map<string, HTMLElement>;
	index: number;
	timer: number | null;
	direction: 1 | -1;
	playing: boolean;
};

const DEFAULT_FPS = 15;

function getJavaScript(context: LatexPdfInteractionContext): string {
	const actionSources: unknown[] = [context.analysis.documentActions];

	for (const page of context.analysis.pageAnnotations) {
		for (const annotation of page.annotations) {
			actionSources.push(
				annotation.action as Record<string, unknown>,
				annotation.actions,
				annotation.additionalActions,
				annotation.jsAction,
			);
		}
	}

	return actionSources.flatMap(flattenActionStrings).join('\n');
}

function detectPlaybackOptions(
	prefix: string,
	javascript: string,
): AnimatePlaybackOptions {
	const prefixPattern = new RegExp(`(?:anim|anm)?${prefix}[^\n;]*`, 'gi');
	const scoped = javascript.match(prefixPattern)?.join('\n') || javascript;
	const intervalMatch = /(?:interval|delay)\s*[=:]\s*(\d+(?:\.\d+)?)/i.exec(
		scoped,
	);
	const fpsMatch = /(?:fps|rate)\s*[=:]\s*(\d+(?:\.\d+)?)/i.exec(scoped);
	const milliseconds = intervalMatch ? Number(intervalMatch[1]) : 0;
	const fps = fpsMatch
		? Number(fpsMatch[1])
		: milliseconds > 0
			? 1000 / milliseconds
			: DEFAULT_FPS;

	const hasNoLoop = /(?:no\s*loop|noloop|loop\s*[=:]\s*false)/i.test(scoped);
	const hasLoop =
		!hasNoLoop &&
		/(?:\bloop\b|loop\s*[=:]\s*true|_loop\s*[=:]\s*true|\.loop\s*=\s*true)/i.test(
			scoped,
		);
	const hasPalindrome =
		/(?:\bpalindrome\b|alternate|bounce|direction\s*=\s*-direction|dir\s*=\s*-dir)/i.test(
			scoped,
		);

	const hasAutoplay =
		/(?:\bautoplay\b|\bautostart\b|autoPlay\s*[=:]\s*true|_autoplay\s*[=:]\s*true)/i.test(
			scoped,
		) ||
		/set(?:TimeOut|Interval)\s*\(/i.test(scoped) ||
		/\b(?:anim|anm)?\d+_play(?:Right|Left)\s*\(/i.test(scoped);

	return {
		autoplay: hasAutoplay,
		loop: hasLoop,
		palindrome: hasPalindrome,
		fps: Math.max(1, Math.min(60, Number.isFinite(fps) ? fps : DEFAULT_FPS)),
	};
}

function buildManifests(
	context: LatexPdfInteractionContext,
): AnimateManifest[] {
	const byPrefix = new Map<string, AnimateManifest>();
	const javascript = getJavaScript(context);

	for (const page of context.analysis.pageAnnotations) {
		for (const annotation of page.annotations) {
			const name = getAnnotationName(annotation);
			const annotationId = annotation.id ? String(annotation.id) : '';

			if (!name || !annotationId || annotation.subtype !== 'Widget') continue;

			const frameMatch = /^(\d+)\.(\d+)$/.exec(name);
			const controlMatch = /^(\d+)\./.exec(name);
			const rootButtonMatch = /^anm(\d+)$/.exec(name);

			if (frameMatch) {
				const prefix = frameMatch[1];
				const index = Number(frameMatch[2]);
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

				manifest.frames.push({ name, index, annotationId });
				continue;
			}

			const prefix = controlMatch?.[1] || rootButtonMatch?.[1];
			if (!prefix) continue;

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

			manifest.controls.push({ name, annotationId });
		}
	}

	return Array.from(byPrefix.values()).map((manifest) => ({
		...manifest,
		frames: manifest.frames.sort((a, b) => a.index - b.index),
	}));
}

function setFrame(instance: AnimateInstance, nextIndex: number): void {
	if (instance.frames.length === 0) return;

	const max = instance.frames.length - 1;
	const clamped = Math.max(0, Math.min(max, nextIndex));

	instance.frames.forEach((frame, index) => {
		setVisible(frame, index === clamped);
	});

	instance.index = clamped;
}

function setControlIcons(instance: AnimateInstance): void {
	const playing = instance.playing;

	setVisible(instance.controls.get(`${instance.prefix}.PlayRight`), !playing);
	setVisible(instance.controls.get(`${instance.prefix}.PlayLeft`), !playing);
	setVisible(instance.controls.get(`${instance.prefix}.PauseRight`), playing);
	setVisible(instance.controls.get(`${instance.prefix}.PauseLeft`), playing);

	for (const name of [
		`${instance.prefix}.PlayPauseRight`,
		`${instance.prefix}.PlayPauseLeft`,
		`${instance.prefix}.StepRight`,
		`${instance.prefix}.StepLeft`,
		`${instance.prefix}.EndRight`,
		`${instance.prefix}.EndLeft`,
		`${instance.prefix}.Plus`,
		`${instance.prefix}.Minus`,
		`${instance.prefix}.Reset`,
		`anm${instance.prefix}`,
	]) {
		makeClickable(instance.controls.get(name));
	}
}

function stop(instance: AnimateInstance, keepDirection = true): void {
	if (instance.timer !== null) {
		window.clearInterval(instance.timer);
		instance.timer = null;
	}

	instance.playing = false;
	setControlIcons(instance);

	if (!keepDirection) instance.direction = 1;
}

function tick(instance: AnimateInstance): void {
	const next = instance.index + instance.direction;

	if (next >= instance.frames.length) {
		if (instance.palindrome) {
			instance.direction = -1;
			setFrame(instance, Math.max(0, instance.frames.length - 2));
			return;
		}

		if (instance.loop) {
			setFrame(instance, 0);
			return;
		}

		setFrame(instance, instance.frames.length - 1);
		stop(instance);
		return;
	}

	if (next < 0) {
		if (instance.palindrome) {
			instance.direction = 1;
			setFrame(instance, Math.min(instance.frames.length - 1, 1));
			return;
		}

		if (instance.loop) {
			setFrame(instance, instance.frames.length - 1);
			return;
		}

		setFrame(instance, 0);
		stop(instance);
		return;
	}

	setFrame(instance, next);
}

function play(instance: AnimateInstance, direction: 1 | -1): void {
	if (instance.timer !== null) {
		window.clearInterval(instance.timer);
	}

	instance.direction = direction;
	instance.playing = true;
	setControlIcons(instance);

	instance.timer = window.setInterval(() => {
		tick(instance);
	}, 1000 / instance.fps);
}

function installManifest(
	context: LatexPdfInteractionContext,
	manifest: AnimateManifest,
): LatexPdfAdapterInstallResult {
	const frames = manifest.frames
		.map((frame) => getAnnotationElement(context.pdfViewer, frame.annotationId))
		.filter(Boolean) as HTMLElement[];

	if (frames.length < 2) return { installed: false };

	const controls = new Map<string, HTMLElement>();
	for (const control of manifest.controls) {
		const el = getAnnotationElement(context.pdfViewer, control.annotationId);
		if (el) controls.set(control.name, el);
	}

	const instance: AnimateInstance = {
		prefix: manifest.prefix,
		frames,
		controls,
		index: 0,
		timer: null,
		direction: 1,
		playing: false,
		autoplay: manifest.autoplay,
		loop: manifest.loop,
		palindrome: manifest.palindrome,
		fps: manifest.fps,
	};
	const disposers: Array<() => void> = [];

	setFrame(instance, 0);
	setControlIcons(instance);

	disposers.push(
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.StepRight`), () => {
			stop(instance);
			setFrame(instance, instance.index + 1);
		}),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.StepLeft`), () => {
			stop(instance);
			setFrame(instance, instance.index - 1);
		}),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.EndRight`), () => {
			stop(instance, false);
			setFrame(instance, instance.frames.length - 1);
		}),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.EndLeft`), () => {
			stop(instance, false);
			setFrame(instance, 0);
		}),
	);

	const playPauseRight = () => {
		if (instance.playing) {
			stop(instance);
			return;
		}

		if (instance.index === instance.frames.length - 1) setFrame(instance, 0);
		play(instance, 1);
	};

	const playPauseLeft = () => {
		if (instance.playing) {
			stop(instance);
			return;
		}

		if (instance.index === 0) setFrame(instance, instance.frames.length - 1);
		play(instance, -1);
	};

	disposers.push(
		attachPdfButtonHandler(
			controls.get(`${manifest.prefix}.PlayPauseRight`),
			playPauseRight,
		),
		attachPdfButtonHandler(
			controls.get(`${manifest.prefix}.PlayPauseLeft`),
			playPauseLeft,
		),
		attachPdfButtonHandler(
			controls.get(`anm${manifest.prefix}`),
			playPauseRight,
		),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.PlayRight`), () =>
			play(instance, 1),
		),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.PlayLeft`), () =>
			play(instance, -1),
		),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.PauseRight`), () =>
			stop(instance),
		),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.PauseLeft`), () =>
			stop(instance),
		),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.Plus`), () => {
			instance.fps = Math.min(60, instance.fps * 1.1);
			if (instance.playing) play(instance, instance.direction);
		}),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.Minus`), () => {
			instance.fps = Math.max(1, instance.fps / 1.1);
			if (instance.playing) play(instance, instance.direction);
		}),
		attachPdfButtonHandler(controls.get(`${manifest.prefix}.Reset`), () => {
			instance.fps = manifest.fps;
			if (instance.playing) play(instance, instance.direction);
		}),
	);

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
