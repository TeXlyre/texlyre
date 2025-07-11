// extras/viewers/image/CombinedImageViewer.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";

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
} from "../../../src/components/common/Icons";
import {
	PluginControlGroup,
	PluginHeader,
} from "../../../src/components/common/PluginHeader";
import { usePluginFileInfo } from "../../../src/hooks/usePluginFileInfo";
import { useSettings } from "../../../src/hooks/useSettings";
import type { ViewerProps } from "../../../src/plugins/PluginInterface";
import { fileStorageService } from "../../../src/services/FileStorageService";
import "./styles.css";
import { PLUGIN_NAME, PLUGIN_VERSION } from "./ImageViewerPlugin";

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

const CombinedImageViewer: React.FC<ViewerProps> = ({
	content,
	mimeType,
	fileName,
	fileId,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoCenter =
		(getSetting("image-viewer-auto-center")?.value as boolean) ?? true;
	const quality =
		(getSetting("image-viewer-quality")?.value as "low" | "medium" | "high") ??
		"high";
	const enablePanning =
		(getSetting("image-viewer-enable-panning")?.value as boolean) ?? true;
	const enableFilters =
		(getSetting("image-viewer-enable-filters")?.value as boolean) ?? true;

	const imageRenderingStyle = {
		low: "pixelated",
		medium: "crisp-edges",
		high: "auto",
	}[quality];

	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [isSvg, setIsSvg] = useState<boolean>(false);
	const [svgContent, setSvgContent] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);

	const [transform, setTransform] = useState<ImageTransform>({
		scale: 1,
		rotation: 0,
		flipH: false,
		flipV: false,
		translateX: 0,
		translateY: 0,
		brightness: 100,
		contrast: 100,
	});

	const [isPanning, setIsPanning] = useState(false);
	const [panStart, setPanStart] = useState({ x: 0, y: 0 });
	const imageContainerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (!(content instanceof ArrayBuffer)) {
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		const isSvgFile =
			mimeType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg");
		setIsSvg(isSvgFile);

		try {
			if (isSvgFile) {
				const decoder = new TextDecoder("utf-8");
				setSvgContent(decoder.decode(content));
				setImageSrc(null);
			} else {
				const blob = new Blob([content], { type: mimeType || "image/png" });
				const url = URL.createObjectURL(blob);
				setImageSrc(url);
				setSvgContent(null);
				return () => URL.revokeObjectURL(url);
			}
		} catch (error) {
			console.error("Error processing image:", error);
		} finally {
			setIsLoading(false);
		}
	}, [content, mimeType, fileName]);

	const updateTransform = (newTransform: Partial<ImageTransform>) => {
		setTransform((prev) => ({ ...prev, ...newTransform }));
		setHasChanges(true);
	};

	const handleZoomIn = () =>
		updateTransform({ scale: Math.min(transform.scale + 0.25, 5) });
	const handleZoomOut = () =>
		updateTransform({ scale: Math.max(transform.scale - 0.25, 0.1) });
	const handleRotate = () =>
		updateTransform({ rotation: (transform.rotation + 90) % 360 });
	const handleFlipH = () => updateTransform({ flipH: !transform.flipH });
	const handleFlipV = () => updateTransform({ flipV: !transform.flipV });

	const handleBrightnessChange = (delta: number) => {
		updateTransform({
			brightness: Math.max(0, Math.min(200, transform.brightness + delta)),
		});
	};

	const handleContrastChange = (delta: number) => {
		updateTransform({
			contrast: Math.max(0, Math.min(200, transform.contrast + delta)),
		});
	};

	const handleReset = () => {
		setTransform({
			scale: 1,
			rotation: 0,
			flipH: false,
			flipV: false,
			translateX: 0,
			translateY: 0,
			brightness: 100,
			contrast: 100,
		});
		setHasChanges(false);
	};

	const handleSave = async () => {
		if (!hasChanges || !fileId || isSvg) return;

		setIsSaving(true);
		try {
			const processedImageData = await processImageWithTransforms();
			if (processedImageData) {
				await fileStorageService.updateFileContent(fileId, processedImageData);
				setHasChanges(false);
			}
		} catch (error) {
			console.error("Error saving image:", error);
		} finally {
			setIsSaving(false);
		}
	};

	const processImageWithTransforms = async (): Promise<ArrayBuffer | null> => {
		if (!imageSrc || !canvasRef.current) return null;

		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = canvasRef.current!;
				const ctx = canvas.getContext("2d")!;

				canvas.width = img.width;
				canvas.height = img.height;

				ctx.save();
				ctx.translate(canvas.width / 2, canvas.height / 2);
				ctx.rotate((transform.rotation * Math.PI) / 180);
				ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
				ctx.filter = `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`;
				ctx.drawImage(img, -img.width / 2, -img.height / 2);
				ctx.restore();

				canvas.toBlob((blob) => {
					if (blob) {
						blob.arrayBuffer().then(resolve);
					} else {
						resolve(null);
					}
				}, mimeType || "image/png");
			};
			img.src = imageSrc;
		});
	};

	const handleExport = () => {
		if (imageSrc && !isSvg) {
			const a = document.createElement("a");
			a.href = imageSrc;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		} else if (svgContent && isSvg) {
			const blob = new Blob([svgContent], { type: "image/svg+xml" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (!enablePanning) return;
		setIsPanning(true);
		setPanStart({
			x: e.clientX - transform.translateX,
			y: e.clientY - transform.translateY,
		});
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isPanning || !enablePanning) return;
		updateTransform({
			translateX: e.clientX - panStart.x,
			translateY: e.clientY - panStart.y,
		});
	};

	const handleMouseUp = () => {
		setIsPanning(false);
	};

	const getTransformStyle = (): React.CSSProperties => {
		const scaleX = transform.flipH ? -transform.scale : transform.scale;
		const scaleY = transform.flipV ? -transform.scale : transform.scale;
		const transformValue = `translate(${transform.translateX}px, ${transform.translateY}px) rotate(${transform.rotation}deg) scale(${scaleX}, ${scaleY})`;

		const filterValue = enableFilters
			? `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`
			: "none";

		return {
			transform: transformValue,
			transformOrigin: "center",
			imageRendering:
				imageRenderingStyle as React.CSSProperties["imageRendering"],
			filter: filterValue,
			cursor: enablePanning ? (isPanning ? "grabbing" : "grab") : "default",
			transition: isPanning ? "none" : "transform 0.2s ease",
		};
	};

	const renderSvgIframe = () => {
		if (!svgContent) return null;
		const centerCss =
			autoCenter && transform.translateX === 0 && transform.translateY === 0
				? "display:flex;justify-content:center;align-items:center;"
				: "";

		const scaleX = transform.flipH ? -transform.scale : transform.scale;
		const scaleY = transform.flipV ? -transform.scale : transform.scale;
		const transformValue = `translate(${transform.translateX}px, ${transform.translateY}px) rotate(${transform.rotation}deg) scale(${scaleX}, ${scaleY})`;

		const filterValue = enableFilters
			? `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`
			: "none";

		return (
			<iframe
				title={fileName}
				srcDoc={`<!DOCTYPE html>
          <html>
            <head>
              <style>
                body, html { 
                  margin: 0; 
                  padding: 0; 
                  height: 100%; 
                  width: 100%; 
                  overflow: hidden; 
                  ${centerCss}
                }
                svg { 
                  max-width: 100%; 
                  max-height: 100%; 
                  transform: ${transformValue};
                  transform-origin: center;
                  filter: ${filterValue};
                  cursor: ${enablePanning ? (isPanning ? "grabbing" : "grab") : "default"};
                  transition: ${isPanning ? "none" : "transform 0.2s ease"};
                }
              </style>
            </head>
            <body>${svgContent}</body>
          </html>`}
				style={{
					width: "100%",
					height: "100%",
					border: "none",
				}}
				onMouseDown={(e) => enablePanning && handleMouseDown(e)}
				onMouseMove={(e) => enablePanning && handleMouseMove(e)}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			/>
		);
	};

	const tooltipInfo = [
		`Quality: ${quality}`,
		`Auto center: ${autoCenter ? "enabled" : "disabled"}`,
		`Panning: ${enablePanning ? "enabled" : "disabled"}`,
		`Filters: ${enableFilters ? "enabled" : "disabled"}`,
		`MIME Type: ${mimeType || "Unknown"}`,
		`Size: ${fileInfo.fileSize ? `${Math.round(fileInfo.fileSize / 1024)} KB` : "Unknown"}`,
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button onClick={handleZoomOut} title="Zoom Out">
					<ZoomOutIcon />
				</button>
				<button
					onClick={() => updateTransform({ scale: 1 })}
					title="Reset Zoom"
				>
					{Math.round(transform.scale * 100)}%
				</button>
				<button onClick={handleZoomIn} title="Zoom In">
					<ZoomInIcon />
				</button>
			</PluginControlGroup>

			<PluginControlGroup>
				<button
					onClick={handleRotate}
					title={`Rotate 90° (${transform.rotation}°)`}
				>
					<RotateIcon />
				</button>
				<button
					onClick={handleFlipH}
					title="Flip Horizontal"
					className={transform.flipH ? "active" : ""}
				>
					<FlipHorizontalIcon />
				</button>
				<button
					onClick={handleFlipV}
					title="Flip Vertical"
					className={transform.flipV ? "active" : ""}
				>
					<FlipVerticalIcon />
				</button>
			</PluginControlGroup>

			{enablePanning && (
				<PluginControlGroup>
					<button
						title={`Panning ${enablePanning ? "enabled" : "disabled"}`}
						className={enablePanning ? "active" : ""}
					>
						<MoveIcon />
					</button>
				</PluginControlGroup>
			)}

			{enableFilters && (
				<PluginControlGroup>
					<button
						onClick={() => handleBrightnessChange(-10)}
						title={`Decrease Brightness (${transform.brightness}%)`}
					>
						<BrightnessDownIcon />
					</button>
					<button
						onClick={() => handleBrightnessChange(10)}
						title={`Increase Brightness (${transform.brightness}%)`}
					>
						<BrightnessIcon />
					</button>
					<button
						onClick={() => handleContrastChange(-10)}
						title={`Decrease Contrast (${transform.contrast}%)`}
					>
						<ContrastDownIcon />
					</button>
					<button
						onClick={() => handleContrastChange(10)}
						title={`Increase Contrast (${transform.contrast}%)`}
					>
						<ContrastIcon />
					</button>
				</PluginControlGroup>
			)}

			<PluginControlGroup>
				<button onClick={handleReset} title="Reset All Transforms">
					<ResetIcon />
				</button>
				{!isSvg && fileId && (
					<button
						onClick={handleSave}
						title="Save Changes to File"
						disabled={!hasChanges || isSaving}
						className={hasChanges ? "active" : ""}
					>
						<SaveIcon />
					</button>
				)}
				<button onClick={handleExport} title="Download Image">
					<DownloadIcon />
				</button>
			</PluginControlGroup>
		</>
	);

	return (
		<div className="image-viewer-container">
			<canvas ref={canvasRef} style={{ display: "none" }} />

			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div
				className="image-viewer-content"
				ref={imageContainerRef}
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			>
				{isLoading && <div className="loading-indicator">Loading image...</div>}

				{!isLoading && imageSrc && !isSvg && (
					<div
						className={`image-container${autoCenter && transform.translateX === 0 && transform.translateY === 0 ? "" : " no-center"}`}
					>
						<img
							src={imageSrc}
							alt={fileName}
							style={getTransformStyle()}
							draggable={false}
						/>
					</div>
				)}

				{!isLoading && isSvg && (
					<div
						className={`svg-container${autoCenter && transform.translateX === 0 && transform.translateY === 0 ? "" : " no-center"}`}
						style={{ width: "100%", height: "100%" }}
					>
						{renderSvgIframe()}
					</div>
				)}

				{!isLoading && !imageSrc && !svgContent && (
					<div className="image-error-message">Cannot display this image.</div>
				)}
			</div>
		</div>
	);
};

export default CombinedImageViewer;
