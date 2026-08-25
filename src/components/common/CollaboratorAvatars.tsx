// src/components/common/CollaboratorAvatars.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

import Popover from './Popover';

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
	const rowRef = useRef<HTMLDivElement>(null);

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

			<Popover
				anchor={rowRef}
				open={expanded}
				className='collab-avatars-panel'
				clampHeight
				onClose={() => setExpanded(false)}
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
			</Popover>
		</div>
	);
};

export default CollaboratorAvatars;
