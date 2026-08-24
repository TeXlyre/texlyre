// src/hooks/useWheelScroll.ts
import { type RefObject, useCallback } from 'react';

const LINE_HEIGHT = 16;
const MAX_STEP_RATIO = 1 / 3;

export const useWheelScroll = <T extends HTMLElement>(
	ref?: RefObject<T | null>,
) =>
	useCallback(
		(element: T | null) => {
			if (ref) ref.current = element;
			if (!element) return;

			const handleWheel = (event: WheelEvent) => {
				const maxScroll = element.scrollWidth - element.clientWidth;
				if (event.deltaX !== 0 || maxScroll <= 0) return;
				event.preventDefault();

				const distance =
					event.deltaMode === WheelEvent.DOM_DELTA_LINE
						? event.deltaY * LINE_HEIGHT
						: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
							? event.deltaY * element.clientWidth
							: event.deltaY;

				const step = Math.min(Math.abs(distance), maxScroll * MAX_STEP_RATIO);
				element.scrollBy({
					left: Math.sign(distance) * step,
					behavior: 'smooth',
				});
			};

			element.addEventListener('wheel', handleWheel, { passive: false });

			return () => {
				element.removeEventListener('wheel', handleWheel);
				if (ref) ref.current = null;
			};
		},
		[ref],
	);
