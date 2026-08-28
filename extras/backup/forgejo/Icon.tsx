// extras/backup/forgejo/Icon.tsx
// Official Forgejo monochrome mark.
// Attribution: http://texlyre.org/docs/attributions
import type React from 'react';

export const ForgejoIcon: React.FC = () => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		width='16'
		height='16'
		viewBox='0 0 212 212'
		className='brand-icon--monochrome'
		aria-hidden='true'
		focusable='false'
	>
		<g transform='translate(6 6)' fill='none' stroke='currentColor'>
			<path d='M58 168V70a50 50 0 0 1 50-50h20' strokeWidth='25' />
			<path d='M58 168v-30a50 50 0 0 1 50-50h20' strokeWidth='25' />
			<circle cx='142' cy='20' r='18' strokeWidth='15' />
			<circle cx='142' cy='88' r='18' strokeWidth='15' />
			<circle cx='58' cy='180' r='18' strokeWidth='15' />
		</g>
	</svg>
);
