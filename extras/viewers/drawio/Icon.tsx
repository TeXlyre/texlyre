// extras/viewers/drawio/Icon.tsx
import type React from 'react';

// export const DrawioIcon: React.FC = () => (
// 	<svg
// 		xmlns='http://www.w3.org/2000/svg'
// 		width='16'
// 		height='16'
// 		viewBox='0 0 24 24'
// 		fill='none'
// 		stroke='currentColor'
// 		strokeWidth='2'
// 		strokeLinecap='round'
// 		strokeLinejoin='round'
// 	>
// 		<rect x='9' y='3' width='6' height='6' rx='1.5' />
// 		<rect x='3' y='15' width='6' height='6' rx='1.5' />
// 		<rect x='15' y='15' width='6' height='6' rx='1.5' />
// 		<line x1='12' y1='9' x2='6' y2='15' />
// 		<line x1='12' y1='9' x2='18' y2='15' />
// 	</svg>
// );

export const DrawioIcon: React.FC<{ className?: string }> = ({ className }) => (
	<svg
		className={className}
		viewBox='0 0 512 512'
		width='1em'
		height='1em'
		aria-hidden='true'
		focusable='false'
		role='img'
		xmlns='http://www.w3.org/2000/svg'
	>
		<rect width='512' height='512' rx='55' fill='#F08705' />

		<g transform='scale(3.1683168317)'>
			<path
				fill='#DF6C0C'
				d='M161.6,154.7c0,3.9-3.2,6.9-6.9,6.9H55.3l-32.2-32.7l20-32.7l59.4-73.8l58.9,60.7L161.6,154.7z'
			/>

			<path
				fill='#FFFFFF'
				d='M132.7,90.3h-17l-18-30.6c4-0.8,7-4.4,7-8.6V28c0-4.9-3.9-8.8-8.8-8.8h-30c-4.9,0-8.8,3.9-8.8,8.8v23.1c0,4.3,3,7.8,6.9,8.6L46,90.4H29c-4.9,0-8.8,3.9-8.8,8.8v23.1c0,4.9,3.9,8.8,8.8,8.8h30c4.9,0,8.8-3.9,8.8-8.8V99.2c0-4.9-3.9-8.8-8.8-8.8h-2.9L73.9,60h13.9l17.9,30.4h-3c-4.9,0-8.8,3.9-8.8,8.8v23.1c0,4.9,3.9,8.8,8.8,8.8h30c4.9,0,8.8-3.9,8.8-8.8V99.2C141.5,94.3,137.6,90.3,132.7,90.3z'
			/>
		</g>
	</svg>
);
