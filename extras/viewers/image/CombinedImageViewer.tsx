// extras/viewers/image/CombinedImageViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import {
	BrightnessDownIcon,
	BrightnessIcon,
	ContrastDownIcon,
	ContrastIcon,
	DownloadIcon,
	FlipHorizontalIcon,
	FlipVerticalIcon,
	MoveIcon,
	ResetIcon,
	RotateIcon,
	SaveIcon,
	ZoomInIcon,
	ZoomOutIcon,
} from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './ImageViewerPlugin';

interface ImageTransform {
	scale: number;
	rotation: number;
	flipH: boolean;
	flipV: boolean;
	translateX: number;
	translateY: number;
	brightness: number;
	contrast: number;
}

const DEFAULT_TRANSFORM: ImageTransform = {
	scale: 1,
	rotation: 0,
	flipH: false,
	flipV: false,
	translateX: 0,
	translateY: 0,
	brightness: 100,
	contrast: 100,
};

const RENDERING_BY_QUALITY = {
	low: 'pixelated',
	medium: 'crisp-edges',
	high: 'auto',
} as const;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const CombinedImageViewer: React.FC<ViewerProps> = ({
	content,
	mimeType,
	fileName,
	fileId,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoCenter =
		(getSetting('image-viewer-auto-center')?.value as boolean) ?? true;
	const quality =
		(getSetting('image-viewer-quality')
			?.value as keyof typeof RENDERING_BY_QUALITY) ?? 'high';
	const enableFilters =
		(getSetting('image-viewer-enable-filters')?.value as boolean) ?? true;
	const imageRenderingStyle = RENDERING_BY_QUALITY[quality];

	const isSvg =
		mimeType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg');

	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [svgContent, setSvgContent] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);
	const [isPanning, setIsPanning] = useState(false);
	const [dimensions, setDimensions] = useState<{
		width: number;
		height: number;
	} | null>(null);

	const panStart = useRef({ x: 0, y: 0 });
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const latestSavedRef = useRef<ArrayBuffer | null>(null);

	useEffect(() => {
		latestSavedRef.current = null;
		if (!(content instanceof ArrayBuffer)) {
			setIsLoading(false);
			return;
		}

		setIsLoading(true);

		const type = isSvg ? 'image/svg+xml' : mimeType || 'image/png';
		const blob = new Blob([content], { type });
		const url = URL.createObjectURL(blob);

		setSvgContent(isSvg ? new TextDecoder('utf-8').decode(content) : null);
		setImageSrc(url);
		setIsLoading(false);

		return () => URL.revokeObjectURL(url);
	}, [content, mimeType, isSvg]);

	const updateTransform = (changes: Partial<ImageTransform>) => {
		setTransform((prev) => ({ ...prev, ...changes }));
		setHasChanges(true);
	};

	const handleRecenter = () =>
		updateTransform({ translateX: 0, translateY: 0 });

	const handleZoomIn = () =>
		updateTransform({ scale: clamp(transform.scale + 0.25, 0.1, 5) });
	const handleZoomOut = () =>
		updateTransform({ scale: clamp(transform.scale - 0.25, 0.1, 5) });
	const handleRotate = () =>
		updateTransform({ rotation: (transform.rotation + 90) % 360 });
	const handleFlipH = () => updateTransform({ flipH: !transform.flipH });
	const handleFlipV = () => updateTransform({ flipV: !transform.flipV });
	const handleBrightness = (delta: number) =>
		updateTransform({
			brightness: clamp(transform.brightness + delta, 0, 200),
		});
	const handleContrast = (delta: number) =>
		updateTransform({ contrast: clamp(transform.contrast + delta, 0, 200) });

	const handleReset = () => {
		setTransform(DEFAULT_TRANSFORM);
		setHasChanges(false);
	};

	const processImageWithTransforms = (): Promise<ArrayBuffer | null> =>
		new Promise((resolve) => {
			if (!imageSrc || !canvasRef.current) return resolve(null);
			const img = new Image();
			img.onload = () => {
				const canvas = canvasRef.current!;
				const ctx = canvas.getContext('2d')!;

				const angle = ((transform.rotation % 360) + 360) % 360;
				const radians = (angle * Math.PI) / 180;
				const swap = angle === 90 || angle === 270;
				const outW = swap ? img.height : img.width;
				const outH = swap ? img.width : img.height;

				canvas.width = outW;
				canvas.height = outH;
				ctx.clearRect(0, 0, outW, outH);
				ctx.filter = `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`;
				ctx.translate(outW / 2, outH / 2);
				ctx.rotate(radians);
				ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
				ctx.drawImage(img, -img.width / 2, -img.height / 2);

				canvas.toBlob(
					(blob) => (blob ? blob.arrayBuffer().then(resolve) : resolve(null)),
					mimeType || 'image/png',
				);
			};
			img.onerror = () => resolve(null);
			img.src = imageSrc;
		});

	const handleSave = async () => {
		if (!hasChanges || !fileId || isSvg) return;
		setIsSaving(true);
		try {
			const data = await processImageWithTransforms();
			if (data) {
				await fileStorageService.updateFileContent(fileId, data);
				latestSavedRef.current = data;
				setHasChanges(false);
			}
		} catch (error) {
			console.error('[CombinedImageViewer] Error saving image:', error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleExport = () => {
		if (isSvg && svgContent) {
			const url = URL.createObjectURL(
				new Blob([svgContent], { type: 'image/svg+xml' }),
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			return;
		}

		if (latestSavedRef.current) {
			const url = URL.createObjectURL(
				new Blob([latestSavedRef.current], { type: mimeType || 'image/png' }),
			);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			return;
		}

		if (!imageSrc) return;
		const a = document.createElement('a');
		a.href = imageSrc;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	const beginPan = (clientX: number, clientY: number) => {
		setIsPanning(true);
		panStart.current = {
			x: clientX - transform.translateX,
			y: clientY - transform.translateY,
		};
	};

	const movePan = (clientX: number, clientY: number) => {
		if (!isPanning) return;
		updateTransform({
			translateX: clientX - panStart.current.x,
			translateY: clientY - panStart.current.y,
		});
	};

	const endPan = () => setIsPanning(false);

	const handleMouseDown = (e: React.MouseEvent) =>
		beginPan(e.clientX, e.clientY);
	const handleMouseMove = (e: React.MouseEvent) =>
		movePan(e.clientX, e.clientY);

	const handleTouchStart = (e: React.TouchEvent) => {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		beginPan(touch.clientX, touch.clientY);
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0];
		movePan(touch.clientX, touch.clientY);
	};

	const tooltipInfo = [
		t('Quality: {quality}', { quality: t(quality) }),
		t('Auto center: {status}', {
			status: autoCenter ? t('enabled') : t('disabled'),
		}),
		t('Filters: {status}', {
			status: enableFilters ? t('enabled') : t('disabled'),
		}),
		t('MIME Type: {mimeType}', { mimeType: mimeType || t('Unknown') }),
		t('Dimensions: {width} × {height}', {
			width: dimensions?.width ?? '—',
			height: dimensions?.height ?? '—',
		}),
		t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button onClick={handleZoomOut} title={t('Zoom Out')}>
					<ZoomOutIcon />
				</button>
				<button
					onClick={() => updateTransform({ scale: 1 })}
					title={t('Reset Zoom')}
				>
					{Math.round(transform.scale * 100)}%
				</button>
				<button onClick={handleZoomIn} title={t('Zoom In')}>
					<ZoomInIcon />
				</button>
			</PluginControlGroup>

			<PluginControlGroup>
				<button
					onClick={handleRotate}
					title={t('Rotate 90° ({degree}°)', { degree: transform.rotation })}
				>
					<RotateIcon />
				</button>
				<button
					onClick={handleFlipH}
					title={t('Flip Horizontal')}
					className={transform.flipH ? 'active' : ''}
				>
					<FlipHorizontalIcon />
				</button>
				<button
					onClick={handleFlipV}
					title={t('Flip Vertical')}
					className={transform.flipV ? 'active' : ''}
				>
					<FlipVerticalIcon />
				</button>
			</PluginControlGroup>

			{enableFilters && (
				<PluginControlGroup>
					<button
						onClick={() => handleBrightness(-10)}
						title={t('Decrease Brightness ({percent}%)', {
							percent: transform.brightness,
						})}
					>
						<BrightnessDownIcon />
					</button>
					<button
						onClick={() => handleBrightness(10)}
						title={t('Increase Brightness ({percent}%)', {
							percent: transform.brightness,
						})}
					>
						<BrightnessIcon />
					</button>
					<button
						onClick={() => handleContrast(-10)}
						title={t('Decrease Contrast ({percent}%)', {
							percent: transform.contrast,
						})}
					>
						<ContrastDownIcon />
					</button>
					<button
						onClick={() => handleContrast(10)}
						title={t('Increase Contrast ({percent}%)', {
							percent: transform.contrast,
						})}
					>
						<ContrastIcon />
					</button>
				</PluginControlGroup>
			)}

			<PluginControlGroup>
				<button onClick={handleRecenter} title={t('Recenter Image')}>
					<MoveIcon />
				</button>
				<button onClick={handleReset} title={t('Reset All Transforms')}>
					<ResetIcon />
				</button>
				{!isSvg && fileId && (
					<button
						onClick={handleSave}
						title={t('Save Changes to File')}
						disabled={!hasChanges || isSaving}
						className={hasChanges ? 'active' : ''}
					>
						<SaveIcon />
					</button>
				)}
				<button onClick={handleExport} title={t('Download Image')}>
					<DownloadIcon />
				</button>
			</PluginControlGroup>
		</>
	);

	return (
		<div className='image-viewer-container'>
			<canvas ref={canvasRef} style={{ display: 'none' }} />

			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div
				className='image-viewer-content'
				style={{
					cursor: isPanning ? 'grabbing' : 'grab',
					userSelect: 'none',
					touchAction: 'none',
				}}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={endPan}
				onMouseLeave={endPan}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={endPan}
				onTouchCancel={endPan}
			>
				{isLoading && (
					<div className='loading-indicator'>{t('Loading image...')}</div>
				)}

				{!isLoading && imageSrc && (
					<div
						className='image-fx-stage'
						style={{
							transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale}) rotate(${transform.rotation}deg) scale(${transform.flipH ? -1 : 1}, ${transform.flipV ? -1 : 1})`,
							filter: enableFilters
								? `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`
								: 'none',
						}}
					>
						<img
							src={imageSrc}
							alt={fileName}
							draggable={false}
							onLoad={(e) => {
								const target = e.currentTarget;
								setDimensions({
									width: target.naturalWidth,
									height: target.naturalHeight,
								});
							}}
							style={{ imageRendering: imageRenderingStyle }}
						/>
					</div>
				)}

				{!isLoading && !imageSrc && (
					<div className='image-error-message'>
						{t('Cannot display this image.')}
					</div>
				)}
			</div>
		</div>
	);
};

export default CombinedImageViewer;
