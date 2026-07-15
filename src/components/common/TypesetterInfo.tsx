// src/components/common/TypesetterInfo.tsx
import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@/i18n';
import type { CompilerProvider } from '../../types/compilation';
import type { ProjectType } from '../../types/projects';
import { resolveLabel } from '../../utils/compilerUtils';

interface TypesetterInfoProps {
	type: ProjectType;
	provider?: CompilerProvider | null;
}

const TypesetterInfo: React.FC<TypesetterInfoProps> = ({ type, provider }) => {
	const [showTooltip, setShowTooltip] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const buttonRef = useRef<HTMLButtonElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!showTooltip || !buttonRef.current || !tooltipRef.current) return;

		const updatePosition = () => {
			if (!buttonRef.current || !tooltipRef.current) return;

			const buttonRect = buttonRef.current.getBoundingClientRect();
			const tooltipRect = tooltipRef.current.getBoundingClientRect();
			const spacing = 12;
			const padding = 8;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			const spaceRight = viewportWidth - buttonRect.right;
			const spaceLeft = buttonRect.left;
			const spaceBelow = viewportHeight - buttonRect.bottom;
			const spaceAbove = buttonRect.top;

			let top = 0;
			let left = 0;

			if (spaceRight >= tooltipRect.width + spacing) {
				left = buttonRect.right + spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			} else if (spaceLeft >= tooltipRect.width + spacing) {
				left = buttonRect.left - tooltipRect.width - spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			} else if (spaceBelow >= tooltipRect.height + spacing) {
				top = buttonRect.bottom + spacing;
				left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
			} else if (spaceAbove >= tooltipRect.height + spacing) {
				top = buttonRect.top - tooltipRect.height - spacing;
				left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
			} else {
				left = buttonRect.right + spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			}

			top = Math.max(
				padding,
				Math.min(top, viewportHeight - tooltipRect.height - padding),
			);
			left = Math.max(
				padding,
				Math.min(left, viewportWidth - tooltipRect.width - padding),
			);

			setPosition({ top, left });
		};

		updatePosition();

		window.addEventListener('scroll', updatePosition, true);
		window.addEventListener('resize', updatePosition);

		return () => {
			window.removeEventListener('scroll', updatePosition, true);
			window.removeEventListener('resize', updatePosition);
		};
	}, [showTooltip]);

	const externalInfo = provider?.ui?.info;

	const getLabel = () => {
		if (type === 'latex') return 'LaTeX';
		if (type === 'typst') return 'Typst';
		if (externalInfo) return resolveLabel(externalInfo.title);
		return provider?.label ?? type;
	};

	const getTooltipContent = () => {
		if (type === 'latex') {
			return (
				<>
					<h4 className='typesetter-tooltip-title'>{t('LaTeX')}</h4>
					<div className='typesetter-tooltip-section'>
						<strong>{t('LaTeX Engine:')}</strong>{' '}
						{t('SwiftLaTeX v20/02/2022 (TeX Live 2020, 10/04/2020)')}
						<br />
						<strong>{t('LaTeX Compilers:')}</strong>
						<ul>
							<li>{t('pdfTeX (2020)')}</li>
							<li>{t('XeTeX (2020)')}</li>
						</ul>
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('LaTeX Engine:')}</strong>{' '}
						{t('BusyTeX: texlyre-busytex v1.2.3 (TeX Live 2026, 01/03/2026)')}
						<br />
						<strong>{t('LaTeX Compilers:')}</strong>
						<ul>
							<li>{t('pdfTeX (2026)')}</li>
							<li>{t('XeTeX (2026)')}</li>
							<li>{t('LuaHBTeX (2026)')}</li>
						</ul>
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Output Format:')}</strong> {t('PDF')}
					</div>
				</>
			);
		}

		if (type === 'typst') {
			return (
				<>
					<h4 className='typesetter-tooltip-title'>{t('Typst')}</h4>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Typst Engine:')}</strong>{' '}
						{t('@myriaddreamin/typst.ts v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Typst Renderer:')}</strong>{' '}
						{t('@texlyre/typst-ts-renderer v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Typst Compiler:')}</strong>{' '}
						{t('@texlyre/typst-ts-compiler v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Typst Version:')}</strong> {t('0.15.0 (15/06/2026)')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Output Formats:')}</strong>
						<ul>
							<li>{t('PDF')}</li>
							<li>{t('SVG')}</li>
						</ul>
					</div>
				</>
			);
		}

		if (externalInfo) {
			return (
				<>
					<h4 className='typesetter-tooltip-title'>
						{resolveLabel(externalInfo.title)}
					</h4>
					{externalInfo.rows.map((row, index) => (
						<div
							className='typesetter-tooltip-section'
							key={`${resolveLabel(row.label)}-${index}`}
						>
							<strong>{resolveLabel(row.label)}</strong>{' '}
							{resolveLabel(row.value)}
						</div>
					))}
				</>
			);
		}

		return (
			<>
				<h4 className='typesetter-tooltip-title'>{provider?.label ?? type}</h4>
				<div className='typesetter-tooltip-section'>
					{t('No typesetter information available.')}
				</div>
			</>
		);
	};

	return (
		<>
			<button
				ref={buttonRef}
				type='button'
				className='type-info-help'
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
				onClick={() => setShowTooltip(!showTooltip)}
			>
				{getLabel()}
			</button>
			{showTooltip &&
				createPortal(
					<div
						className='typesetter-tooltip'
						ref={tooltipRef}
						style={{
							top: `${position.top}px`,
							left: `${position.left}px`,
						}}
						onMouseEnter={() => setShowTooltip(true)}
						onMouseLeave={() => setShowTooltip(false)}
					>
						{getTooltipContent()}
					</div>,
					document.body,
				)}
		</>
	);
};

export default TypesetterInfo;
