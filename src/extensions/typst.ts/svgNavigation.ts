// src/extensions/typst.ts/svgNavigation.ts

const TYPST_LOCATION_LINK_RE =
	/<a\b([^>]*?)\s+onclick=(["'])handleTypstLocation\(this,\s*(\d+),\s*(-?(?:\d+(?:\.\d+)?|\.\d+)),\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\);\s*return false;?\2([^>]*)>/g;

const TYPST_PAGE_RE =
	/<g\b([^>]*\bclass=(["'])[^"']*\btypst-page\b[^"']*\2[^>]*)>/g;

export function normalizeTypstSvgNavigation(svg: string): string {
	const destinations = new Map<
		number,
		Map<string, { id: string; x: string; y: string }>
	>();

	let normalized = svg.replace(
		TYPST_LOCATION_LINK_RE,
		(
			Match,
			before: string,
			_quote: string,
			pageValue: string,
			x: string,
			y: string,
			after: string,
		) => {
			const page = Number(pageValue);

			if (
				!Number.isInteger(page) ||
				page < 1 ||
				!Number.isFinite(Number(x)) ||
				!Number.isFinite(Number(y))
			) {
				return Match;
			}

			let pageDestinations = destinations.get(page);
			if (!pageDestinations) {
				pageDestinations = new Map();
				destinations.set(page, pageDestinations);
			}

			const key = `${x},${y}`;
			let destination = pageDestinations.get(key);

			if (!destination) {
				destination = {
					id: `nav-${page}-${pageDestinations.size + 1}`,
					x,
					y,
				};
				pageDestinations.set(key, destination);
			}

			const attributes = `${before}${after}`
				.replace(/\s+(?:xlink:)?href=(["'])#\1/g, '')
				.trim();

			return [
				'<a',
				attributes ? ` ${attributes}` : '',
				` href="#${destination.id}"`,
				` xlink:href="#${destination.id}"`,
				` data-nav-page="${page}"`,
				` data-nav-x="${x}"`,
				` data-nav-y="${y}">`,
			].join('');
		},
	);

	if (destinations.size === 0) {
		return normalized;
	}

	let page = 0;

	normalized = normalized.replace(TYPST_PAGE_RE, (openingTag: string) => {
		page++;

		const pageDestinations = destinations.get(page);
		if (!pageDestinations?.size) {
			return openingTag;
		}

		const targets = Array.from(pageDestinations.values(), ({ id, x, y }) =>
			[
				`<g id="${id}"`,
				` transform="translate(${x},${y})"`,
				' visibility="hidden"',
				' pointer-events="none"></g>',
			].join(''),
		).join('');

		return `${openingTag}${targets}`;
	});

	return normalized;
}
