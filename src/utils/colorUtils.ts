// src/utils/colorUtils.ts
export function generateRandomColor(isLight: boolean): string {
	const hue = Math.floor(Math.random() * 360);
	const saturation = isLight
		? 60 + Math.floor(Math.random() * 20)
		: 70 + Math.floor(Math.random() * 30);
	const lightness = isLight
		? 65 + Math.floor(Math.random() * 20)
		: 45 + Math.floor(Math.random() * 25);

	const sNorm = saturation / 100;
	const lNorm = lightness / 100;
	const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = lNorm - c / 2;

	let r = 0;
	let g = 0;
	let b = 0;
	if (0 <= hue && hue < 60) {
		r = c;
		g = x;
		b = 0;
	} else if (60 <= hue && hue < 120) {
		r = x;
		g = c;
		b = 0;
	} else if (120 <= hue && hue < 180) {
		r = 0;
		g = c;
		b = x;
	} else if (180 <= hue && hue < 240) {
		r = 0;
		g = x;
		b = c;
	} else if (240 <= hue && hue < 300) {
		r = x;
		g = 0;
		b = c;
	} else if (300 <= hue && hue < 360) {
		r = c;
		g = 0;
		b = x;
	}

	const toHex = (n: number) => {
		const hex = Math.round((n + m) * 255).toString(16);
		return hex.length === 1 ? `0${hex}` : hex;
	};

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
