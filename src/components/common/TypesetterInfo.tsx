// src/components/common/TypesetterInfo.tsx
import type React from 'react';
import { useState, useRef } from 'react';

import { t } from '@/i18n';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import type { TypesetterProvider } from '../../types/compilation';
import type { ProjectType } from '../../types/projects';
import { resolveLabel } from '../../utils/compilerUtils';
import { GlobeIcon } from './Icons';
import Popover from './Popover';

interface TypesetterInfoProps {
	type: ProjectType;
	provider?: TypesetterProvider | null;
}

const TypesetterInfo: React.FC<TypesetterInfoProps> = ({
	type,
	provider: providerProp,
}) => {
	const provider =
		providerProp ?? typesetterRegistryService.getForProjectType(type);
	const [showTooltip, setShowTooltip] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const isExternal = provider?.source === 'chelys';

	const externalInfo = provider?.ui?.info;
	const isInternalLatex = provider?.id === 'internal:latex';
	const isInternalTypst = provider?.id === 'internal:typst';

	const getLabel = () => {
		if (isInternalLatex) return 'LaTeX';
		if (isInternalTypst) return 'Typst';
		if (externalInfo) return resolveLabel(externalInfo.title);
		return provider?.label ?? type;
	};

	const getTooltipContent = () => {
		if (isInternalLatex) {
			return (
				<>
					<h4 className='typesetter-tooltip-title'>{t('LaTeX')}</h4>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Engine:', { typesetter: t('LaTeX') })}
						</strong>{' '}
						{t('SwiftLaTeX v20/02/2022 (TeX Live 2020, 10/04/2020)')}
						<br />
						<strong>
							{t('{typesetter} Compilers:', { typesetter: t('LaTeX') })}
						</strong>
						<ul>
							<li>{t('pdfTeX (2020)')}</li>
							<li>{t('XeTeX (2020)')}</li>
						</ul>
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Engine:', { typesetter: t('LaTeX') })}
						</strong>{' '}
						{t('BusyTeX: texlyre-busytex v1.4.0 (TeX Live 2026, 01/03/2026)')}
						<br />
						<strong>
							{t('{typesetter} Compilers:', { typesetter: t('LaTeX') })}
						</strong>
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

		if (isInternalTypst) {
			return (
				<>
					<h4 className='typesetter-tooltip-title'>{t('Typst')}</h4>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Engine:', { typesetter: t('Typst') })}
						</strong>{' '}
						{t('@myriaddreamin/typst.ts v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Renderer:', { typesetter: t('Typst') })}
						</strong>{' '}
						{t('@texlyre/typst-ts-renderer v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Compiler:', { typesetter: t('Typst') })}
						</strong>{' '}
						{t('@texlyre/typst-ts-compiler v0.8.0-rc1')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>
							{t('{typesetter} Version:', { typesetter: t('Typst') })}
						</strong>{' '}
						{t('0.15.0 (15/06/2026)')}
					</div>
					<div className='typesetter-tooltip-section'>
						<strong>{t('Output Format:')}</strong>
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
				{isExternal && (
					<span
						className='external-typesetter-status'
						title={t('External compiler')}
						aria-hidden='true'
					>
						<GlobeIcon />
					</span>
				)}
			</button>
			<Popover
				anchor={buttonRef}
				open={showTooltip}
				className='typesetter-tooltip'
				axis='inline'
				align='center'
				spacing={12}
				clampHeight
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
			>
				{getTooltipContent()}
			</Popover>
		</>
	);
};

export default TypesetterInfo;
