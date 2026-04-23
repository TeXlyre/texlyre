// src/settings/registerCollabSettings.ts
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { useSettings } from '../hooks/useSettings';
import type { CollabProviderType } from '../types/collab';

export function useRegisterCollabSettings() {
    const { registerSetting, batchGetSettings } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const batchedSettings = batchGetSettings([
            'collab-provider-type',
            'collab-signaling-servers',
            'collab-websocket-server',
            'collab-awareness-timeout',
            'collab-auto-reconnect'
        ]);

        const initialProviderType =
            (batchedSettings['collab-provider-type'] as CollabProviderType) ?? 'webrtc';
        const initialSignalingServers =
            (batchedSettings['collab-signaling-servers'] as string) ?? 'ws://ywebrtc.localhost:8082/';
        const initialWebsocketServer =
            (batchedSettings['collab-websocket-server'] as string) ?? 'ws://yweb.localhost:8082/';
        const initialAwarenessTimeout =
            (batchedSettings['collab-awareness-timeout'] as number) ?? 30;
        const initialAutoReconnect =
            (batchedSettings['collab-auto-reconnect'] as boolean) ?? false;

        registerSetting({
            id: 'collab-provider-type',
            category: t('Collaboration'),
            subcategory: t('Real-time Synchronization'),
            type: 'select',
            label: t('Connection provider'),
            description: t('Choose WebRTC for peer-to-peer or WebSocket for server-based synchronization'),
            defaultValue: initialProviderType,
            options: [
                { label: t('WebRTC (peer-to-peer)'), value: 'webrtc' },
                { label: t('WebSocket (server)'), value: 'websocket' }
            ],
            liveUpdate: false
        });

        registerSetting({
            id: 'collab-signaling-servers',
            category: t('Collaboration'),
            subcategory: t('Real-time Synchronization'),
            type: 'text',
            label: t('Signaling servers (WebRTC)'),
            description: t('Comma-separated list of Yjs WebRTC signaling server URLs'),
            defaultValue: initialSignalingServers
        });

        registerSetting({
            id: 'collab-websocket-server',
            category: t('Collaboration'),
            subcategory: t('Real-time Synchronization'),
            type: 'text',
            label: t('WebSocket server'),
            description: t('WebSocket server URL for Yjs y-websocket or y/hub connections'),
            defaultValue: initialWebsocketServer
        });

        registerSetting({
            id: 'collab-awareness-timeout',
            category: t('Collaboration'),
            subcategory: t('Real-time Synchronization'),
            type: 'number',
            label: t('Awareness timeout (seconds)'),
            description: t('How long to wait before considering other users inactive'),
            defaultValue: initialAwarenessTimeout,
            min: 10,
            max: 300
        });

        registerSetting({
            id: 'collab-auto-reconnect',
            category: t('Collaboration'),
            subcategory: t('Real-time Synchronization'),
            type: 'checkbox',
            label: t('Auto-reconnect on disconnect'),
            description: t('Automatically attempt to reconnect when the connection is lost'),
            defaultValue: initialAutoReconnect
        });
    }, [registerSetting, batchGetSettings]);
}