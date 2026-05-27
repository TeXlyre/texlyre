// src/components/common/CollaboratorAvatars.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Awareness } from 'y-protocols/awareness';

interface CollaboratorUser {
	id?: string;
	username: string;
	name?: string;
	email?: string;
	color: string;
	colorLight?: string;
}

interface CollaboratorState {
	clientId: number;
	user: CollaboratorUser;
	isLocal: boolean;
}

interface CollaboratorAvatarsProps {
	awareness: Awareness;
	maxVisible?: number;
	excludeLocal?: boolean;
}

const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({
	awareness,
	maxVisible = 4,
	excludeLocal = false,
}) => {
	const [collaborators, setCollaborators] = useState<CollaboratorState[]>([]);
	const [expanded, setExpanded] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const rowRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const update = () => {
			const states = awareness.getStates();
			const result: CollaboratorState[] = [];

			states.forEach((state, clientId) => {
				if (!state.user) return;
				const isLocal = clientId === awareness.clientID;
				if (excludeLocal && isLocal) return;
				result.push({
					clientId,
					user: state.user as CollaboratorUser,
					isLocal,
				});
			});

			result.sort((a, b) => {
				if (a.isLocal) return -1;
				if (b.isLocal) return 1;
				return (a.user.username || '').localeCompare(b.user.username || '');
			});

			setCollaborators(result);
		};

		awareness.on('change', update);
		update();

		return () => {
			awareness.off('change', update);
		};
	}, [awareness, excludeLocal]);

	useEffect(() => {
		if (!expanded || !rowRef.current || !panelRef.current) return;

		const updatePosition = () => {
			if (!rowRef.current || !panelRef.current) return;

			const rowRect = rowRef.current.getBoundingClientRect();
			const panelRect = panelRef.current.getBoundingClientRect();
			const spacing = 4;
			const padding = 8;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			const spaceBelow = viewportHeight - rowRect.bottom;
			const spaceAbove = rowRect.top;

			let top =
				spaceBelow >= panelRect.height + spacing || spaceBelow >= spaceAbove
					? rowRect.bottom + spacing
					: rowRect.top - panelRect.height - spacing;

			let left = rowRect.right - panelRect.width;

			top = Math.max(
				padding,
				Math.min(top, viewportHeight - panelRect.height - padding),
			);
			left = Math.max(
				padding,
				Math.min(left, viewportWidth - panelRect.width - padding),
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
	}, [expanded]);

	useEffect(() => {
		if (!expanded) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				rowRef.current &&
				!rowRef.current.contains(target) &&
				panelRef.current &&
				!panelRef.current.contains(target)
			) {
				setExpanded(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [expanded]);

	if (collaborators.length === 0) return null;

	const visible = collaborators.slice(0, maxVisible);
	const overflow = collaborators.length - maxVisible;

	const getInitial = (user: CollaboratorUser) =>
		(user.name || user.username || '?').charAt(0).toUpperCase();

	const renderTooltipContent = (collab: CollaboratorState) => (
		<div className='collab-avatar-tooltip'>
			<div className='collab-avatar-tooltip-name'>
				{collab.user.name || collab.user.username}
				{collab.isLocal && <span className='collab-avatar-you'>(You)</span>}
			</div>
			{collab.user.email && (
				<a
					className='collab-avatar-tooltip-email'
					href={`mailto:${collab.user.email}`}
					onClick={(e) => e.stopPropagation()}
				>
					{collab.user.email}
				</a>
			)}
		</div>
	);

	return (
		<div className='collab-avatars'>
			<div
				ref={rowRef}
				className='collab-avatars-row'
				onClick={() => setExpanded(!expanded)}
			>
				{visible.map((collab) => (
					<div
						key={collab.clientId}
						className={`collab-avatar ${collab.isLocal ? 'local' : ''}`}
						style={
							{
								'--collab-color': collab.user.color,
								'--collab-color-light':
									collab.user.colorLight || collab.user.color,
							} as React.CSSProperties
						}
						title={
							(collab.user.name || collab.user.username) +
							(collab.isLocal ? ' (You)' : '')
						}
					>
						{getInitial(collab.user)}
					</div>
				))}
				{overflow > 0 && (
					<div className='collab-avatar collab-avatar-overflow'>
						+{overflow}
					</div>
				)}
			</div>

			{expanded &&
				createPortal(
					<div
						ref={panelRef}
						className='collab-avatars-panel'
						style={{
							top: `${position.top}px`,
							left: `${position.left}px`,
						}}
					>
						{collaborators.map((collab) => (
							<div key={collab.clientId} className='collab-avatars-panel-item'>
								<div
									className='collab-avatar'
									style={
										{
											'--collab-color': collab.user.color,
											'--collab-color-light':
												collab.user.colorLight || collab.user.color,
										} as React.CSSProperties
									}
								>
									{getInitial(collab.user)}
								</div>
								{renderTooltipContent(collab)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</div>
	);
};

export default CollaboratorAvatars;
