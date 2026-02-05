// src/components/common/CollaboratorAvatars.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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
}

const CollaboratorAvatars: React.FC<CollaboratorAvatarsProps> = ({
    awareness,
    maxVisible = 4,
}) => {
    const [collaborators, setCollaborators] = useState<CollaboratorState[]>([]);
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const update = () => {
            const states = awareness.getStates();
            const result: CollaboratorState[] = [];

            states.forEach((state, clientId) => {
                if (!state.user) return;
                result.push({
                    clientId,
                    user: state.user as CollaboratorUser,
                    isLocal: clientId === awareness.clientID,
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
    }, [awareness]);

    useEffect(() => {
        if (!expanded) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
        <div className="collab-avatar-tooltip">
            <div className="collab-avatar-tooltip-name">
                {collab.user.name || collab.user.username}
                {collab.isLocal && <span className="collab-avatar-you">(You)</span>}
            </div>
            {collab.user.email && (
                <a
                    className="collab-avatar-tooltip-email"
                    href={`mailto:${collab.user.email}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {collab.user.email}
                </a>
            )}
        </div>
    );

    return (
        <div className="collab-avatars" ref={containerRef}>
            <div className="collab-avatars-row" onClick={() => setExpanded(!expanded)}>
                {visible.map((collab) => (
                    <div
                        key={collab.clientId}
                        className={`collab-avatar ${collab.isLocal ? 'local' : ''}`}
                        style={{ backgroundColor: collab.user.color }}
                        title={
                            (collab.user.name || collab.user.username) +
                            (collab.isLocal ? ' (You)' : '')
                        }
                    >
                        {getInitial(collab.user)}
                    </div>
                ))}
                {overflow > 0 && (
                    <div className="collab-avatar collab-avatar-overflow">
                        +{overflow}
                    </div>
                )}
            </div>

            {expanded && (
                <div className="collab-avatars-panel">
                    {collaborators.map((collab) => (
                        <div key={collab.clientId} className="collab-avatars-panel-item">
                            <div
                                className="collab-avatar"
                                style={{ backgroundColor: collab.user.color }}
                            >
                                {getInitial(collab.user)}
                            </div>
                            {renderTooltipContent(collab)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CollaboratorAvatars;