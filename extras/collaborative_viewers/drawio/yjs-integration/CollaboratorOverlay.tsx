// extras/collaborative_viewers/drawio/yjs-integration/CollaboratorOverlay.tsx
import type React from 'react';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import './collaborator-overlay.css';

interface CollaboratorState {
    clientId: number;
    user: {
        id: string;
        username: string;
        color: string;
        colorLight: string;
    };
    selection?: { cellId: string; timestamp: number };
    lastActivity?: number;
}

interface CollaboratorOverlayProps {
    awareness?: Awareness;
    iframeRef: React.RefObject<HTMLIFrameElement>;
}

const CollaboratorOverlay: React.FC<CollaboratorOverlayProps> = ({ awareness, iframeRef }) => {
    const [collaborators, setCollaborators] = useState<CollaboratorState[]>([]);
    const [localUser, setLocalUser] = useState<any>(null);

    useEffect(() => {
        if (!awareness) return;

        const updateCollaborators = () => {
            const states = awareness.getStates();
            const remoteStates: CollaboratorState[] = [];
            let local: any = null;

            states.forEach((state, clientId) => {
                if (clientId === awareness.clientID) {
                    local = state.user;
                    return;
                }
                if (!state.user) return;

                remoteStates.push({
                    clientId,
                    user: state.user,
                    selection: state.selection as { cellId: string; timestamp: number } | undefined,
                    lastActivity: state.lastActivity as number | undefined
                });
            });

            setLocalUser(local);
            setCollaborators(remoteStates);
        };

        awareness.on('change', updateCollaborators);
        updateCollaborators();

        return () => {
            awareness.off('change', updateCollaborators);
        };
    }, [awareness]);

    const isActive = (collab: CollaboratorState) => {
        if (!collab.lastActivity) return false;
        return Date.now() - collab.lastActivity < 10000;
    };

    return (
        <div className="collaborator-overlay">
            <div className="collaborator-list">
                {localUser && (
                    <div
                        className="collaborator-badge local-user"
                        style={{
                            backgroundColor: localUser.color,
                            borderColor: localUser.colorLight
                        }}
                    >
                        <div className="collaborator-avatar" style={{ backgroundColor: localUser.color }}>
                            {localUser.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="collaborator-name">{localUser.username} (You)</div>
                    </div>
                )}
                {collaborators.map((collab) => (
                    <div
                        key={collab.clientId}
                        className={`collaborator-badge ${isActive(collab) ? 'active' : 'inactive'}`}
                        style={{
                            backgroundColor: collab.user.color,
                            borderColor: collab.user.colorLight
                        }}
                        title={`${collab.user.username} - ${isActive(collab) ? 'Active' : 'Idle'}`}
                    >
                        <div className="collaborator-avatar" style={{ backgroundColor: collab.user.color }}>
                            {collab.user.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="collaborator-name">{collab.user.username}</div>
                        {collab.selection && isActive(collab) && (
                            <div className="collaborator-status">
                                <span className="status-dot"></span>
                                Active
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CollaboratorOverlay;