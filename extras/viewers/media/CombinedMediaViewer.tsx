// extras/viewers/media/CombinedMediaViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import {
	DownloadIcon,
	PauseIcon,
	PlayIcon,
	VolumeIcon,
	VolumeMuteIcon,
} from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './MediaViewerPlugin';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VIDEO_MIME_PREFIX = 'video/';
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];

const formatTime = (seconds: number): string => {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => n.toString().padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const CombinedMediaViewer: React.FC<ViewerProps> = ({
	content,
	mimeType,
	fileName,
	fileId,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoplay =
		(getSetting('media-viewer-autoplay')?.value as boolean) ?? false;
	const loop = (getSetting('media-viewer-loop')?.value as boolean) ?? false;
	const defaultVolume =
		parseInt(
			(getSetting('media-viewer-default-volume')?.value as string) ?? '100',
			10,
		) / 100;

	const isVideo =
		(mimeType?.startsWith(VIDEO_MIME_PREFIX) ?? false) ||
		VIDEO_EXTENSIONS.includes(fileName.split('.').pop()?.toLowerCase() ?? '');

	const [mediaSrc, setMediaSrc] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(defaultVolume);
	const [isMuted, setIsMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [videoSize, setVideoSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

	useEffect(() => {
		if (!(content instanceof ArrayBuffer) || content.byteLength === 0) {
			setError(t('Invalid media content'));
			setIsLoading(false);
			return;
		}

		const blob = new Blob([content], {
			type: mimeType || 'application/octet-stream',
		});
		const url = URL.createObjectURL(blob);
		setMediaSrc(url);
		setIsLoading(false);
		setError(null);
		return () => URL.revokeObjectURL(url);
	}, [content, mimeType]);

	useEffect(() => {
		const media = mediaRef.current;
		if (!media) return;
		media.volume = volume;
		media.muted = isMuted;
		media.playbackRate = playbackRate;
	}, [volume, isMuted, playbackRate, mediaSrc]);

	const handlePlayPause = () => {
		const media = mediaRef.current;
		if (!media) return;
		if (media.paused) media.play().catch(() => undefined);
		else media.pause();
	};

	const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
		const media = mediaRef.current;
		if (!media) return;
		const value = Number(event.target.value);
		media.currentTime = value;
		setCurrentTime(value);
	};

	const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const next = Number(event.target.value) / 100;
		setVolume(next);
		if (next > 0 && isMuted) setIsMuted(false);
	};

	const handleToggleMute = () => setIsMuted((prev) => !prev);

	const handleRateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setPlaybackRate(parseFloat(event.target.value));
	};

	const handleExport = () => {
		if (!(content instanceof ArrayBuffer)) return;
		const blob = new Blob([content], {
			type: mimeType || 'application/octet-stream',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleLoadedMetadata = () => {
		const media = mediaRef.current;
		if (!media) return;
		setDuration(Number.isFinite(media.duration) ? media.duration : 0);
		if (media instanceof HTMLVideoElement) {
			setVideoSize({ width: media.videoWidth, height: media.videoHeight });
		}
	};

	const tooltipInfo = [
		t('Type: {type}', { type: isVideo ? t('Video') : t('Audio') }),
		t('Autoplay: {status}', {
			status: autoplay ? t('enabled') : t('disabled'),
		}),
		t('Loop: {status}', { status: loop ? t('enabled') : t('disabled') }),
		t('Duration: {duration}', { duration: formatTime(duration) }),
		...(videoSize
			? [
					t('Dimensions: {width} × {height}', {
						width: videoSize.width,
						height: videoSize.height,
					}),
				]
			: []),
		t('MIME Type: {mimeType}', { mimeType: mimeType || t('Unknown') }),
		t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					onClick={handlePlayPause}
					disabled={isLoading || !!error}
					title={isPlaying ? t('Pause') : t('Play')}
				>
					{isPlaying ? <PauseIcon /> : <PlayIcon />}
				</button>
			</PluginControlGroup>

			<PluginControlGroup className='media-time-group'>
				<span className='media-time'>{formatTime(currentTime)}</span>
				<span>/</span>
				<span className='media-time'>{formatTime(duration)}</span>
			</PluginControlGroup>

			<PluginControlGroup>
				<button
					onClick={handleToggleMute}
					disabled={isLoading || !!error}
					title={isMuted ? t('Unmute') : t('Mute')}
					className={isMuted ? 'active' : ''}
				>
					{isMuted ? <VolumeMuteIcon /> : <VolumeIcon />}
				</button>
			</PluginControlGroup>

			<PluginControlGroup className='media-time-group'>
				<input
					type='range'
					min={0}
					max={100}
					step={1}
					value={Math.round(volume * 100)}
					onChange={handleVolumeChange}
					disabled={isLoading || !!error}
					className='media-volume'
					title={t('Volume')}
				/>
			</PluginControlGroup>

			<PluginControlGroup>
				<select
					value={playbackRate}
					onChange={handleRateChange}
					disabled={isLoading || !!error}
					className='media-rate-select'
					title={t('Playback Speed')}
				>
					{PLAYBACK_RATES.map((rate) => (
						<option key={rate} value={rate}>
							{rate}×
						</option>
					))}
				</select>
			</PluginControlGroup>

			<PluginControlGroup>
				<button
					onClick={handleExport}
					disabled={isLoading}
					title={t('Download')}
				>
					<DownloadIcon />
				</button>
			</PluginControlGroup>
		</>
	);

	const sharedProps = {
		ref: mediaRef as React.RefObject<HTMLVideoElement & HTMLAudioElement>,
		src: mediaSrc ?? undefined,
		autoPlay: autoplay,
		loop,
		onPlay: () => setIsPlaying(true),
		onPause: () => setIsPlaying(false),
		onTimeUpdate: () => {
			const media = mediaRef.current;
			if (media) setCurrentTime(media.currentTime);
		},
		onLoadedMetadata: handleLoadedMetadata,
		onEnded: () => setIsPlaying(false),
		onError: () => setError(t('Failed to load media')),
	};

	return (
		<div className='media-viewer-container'>
			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='media-viewer-content'>
				{isLoading && (
					<div className='loading-indicator'>{t('Loading media...')}</div>
				)}

				{error && <div className='media-error-message'>{error}</div>}

				{!isLoading && !error && mediaSrc && (
					<div className={`media-stage ${isVideo ? 'is-video' : 'is-audio'}`}>
						{isVideo ? (
							<>
								<video {...sharedProps} className='media-element' playsInline />
								<div className='media-video-overlay'>
									<button
										onClick={handlePlayPause}
										className='media-video-overlay-button'
										title={isPlaying ? t('Pause') : t('Play')}
									>
										{isPlaying ? <PauseIcon /> : <PlayIcon />}
									</button>
								</div>
							</>
						) : (
							<div className='media-audio-card'>
								<button
									onClick={handlePlayPause}
									className='media-audio-card-icon'
									title={isPlaying ? t('Pause') : t('Play')}
								>
									{isPlaying ? <PauseIcon /> : <PlayIcon />}
								</button>
								<div className='media-audio-card-title' title={fileName}>
									{fileName}
								</div>
								<div className='media-audio-card-meta'>
									<span>{formatTime(duration)}</span>
									<span>{formatFileSize(fileInfo.fileSize)}</span>
									{mimeType && <span>{mimeType}</span>}
								</div>
								<audio {...sharedProps} className='media-element-hidden' />
							</div>
						)}
					</div>
				)}
			</div>

			<div className='media-seek-bar'>
				<input
					type='range'
					min={0}
					max={duration || 0}
					step={0.1}
					value={Math.min(currentTime, duration || 0)}
					onChange={handleSeek}
					disabled={isLoading || !!error || !duration}
					className='media-seek'
					aria-label={t('Seek')}
				/>
			</div>
		</div>
	);
};

export default CombinedMediaViewer;
