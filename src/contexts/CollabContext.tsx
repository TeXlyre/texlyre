// src/contexts/CollabContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type * as Y from 'yjs';

import { useSettings } from '../hooks/useSettings';
import { collabService } from '../services/CollabService';
import type { CollabContextType, CollabProvider as ICollabProvider, CollabProviderType } from '../types/collab';
import type { YjsDocUrl } from '../types/yjs';

export const CollabContext = createContext<CollabContextType | null>(null);

interface CollabProviderProps {
  children: ReactNode;
  docUrl: YjsDocUrl;
  collectionName: string;
}

export const CollabProvider: React.FC<CollabProviderProps> = ({
  children,
  docUrl,
  collectionName
}) => {
  const [data, setData] = useState<any>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [doc, setDoc] = useState<Y.Doc | undefined>();
  const [provider, setProvider] = useState<ICollabProvider | undefined>();
  const isUpdatingRef = useRef(false);
  const { registerSetting, batchGetSettings } = useSettings();
  const settingsRegistered = useRef(false);

  const [providerType, setProviderType] = useState<CollabProviderType>('webrtc');
  const [signalingServers, setSignalingServers] = useState<string>('');
  const [websocketServer, setWebsocketServer] = useState<string>('');
  const [awarenessTimeout, setAwarenessTimeout] = useState(30);
  const [autoReconnect, setAutoReconnect] = useState(false);

  const projectId = useMemo(() => {
    return docUrl.startsWith('yjs:') ?
      docUrl.slice(4) :
      docUrl.replace(/[^a-zA-Z0-9]/g, '-');
  }, [docUrl]);

  useEffect(() => {
    if (settingsRegistered.current) return;
    settingsRegistered.current = true;

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

    setProviderType(initialProviderType);
    setSignalingServers(initialSignalingServers);
    setWebsocketServer(initialWebsocketServer);
    setAwarenessTimeout(initialAwarenessTimeout);
    setAutoReconnect(initialAutoReconnect);

    registerSetting({
      id: 'collab-provider-type',
      category: t("Collaboration"),
      subcategory: t("Real-time Synchronization"),
      type: 'select',
      label: t("Connection provider"),
      description: t("Choose WebRTC for peer-to-peer or WebSocket for server-based synchronization"),
      defaultValue: initialProviderType,
      options: [
        { label: t("WebRTC (peer-to-peer)"), value: 'webrtc' },
        { label: t("WebSocket (server)"), value: 'websocket' }
      ],
      liveUpdate: false,
      onChange: (value) => {
        setProviderType(value as CollabProviderType);
      }
    });

    registerSetting({
      id: 'collab-signaling-servers',
      category: t("Collaboration"),
      subcategory: t("Real-time Synchronization"),
      type: 'text',
      label: t("Signaling servers (WebRTC)"),
      description: t("Comma-separated list of Yjs WebRTC signaling server URLs"),
      defaultValue: initialSignalingServers,
      liveUpdate: false,
      onChange: (value) => {
        setSignalingServers(value as string);
      }
    });

    registerSetting({
      id: 'collab-websocket-server',
      category: t("Collaboration"),
      subcategory: t("Real-time Synchronization"),
      type: 'text',
      label: t("WebSocket server"),
      description: t("WebSocket server URL for Yjs y-websocket or y/hub connections"),
      defaultValue: initialWebsocketServer,
      liveUpdate: false,
      onChange: (value) => {
        setWebsocketServer(value as string);
      }
    });

    registerSetting({
      id: 'collab-awareness-timeout',
      category: t("Collaboration"),
      subcategory: t("Real-time Synchronization"),
      type: 'number',
      label: t("Awareness timeout (seconds)"),
      description: t("How long to wait before considering other users inactive"),
      defaultValue: initialAwarenessTimeout,
      min: 10,
      max: 300,
      onChange: (value) => {
        setAwarenessTimeout(value as number);
      }
    });

    registerSetting({
      id: 'collab-auto-reconnect',
      category: t("Collaboration"),
      subcategory: t("Real-time Synchronization"),
      type: 'checkbox',
      label: t("Auto-reconnect on disconnect"),
      description: t("Automatically attempt to reconnect when the connection is lost"),
      defaultValue: initialAutoReconnect,
      onChange: (value) => {
        setAutoReconnect(value as boolean);
      }
    });
  }, [registerSetting, batchGetSettings]);

  useEffect(() => {
    if (!projectId || !collectionName) return;

    const serversToUse = signalingServers.length > 0
      ? signalingServers.split(',').map((s) => s.trim())
      : undefined;

    try {
      const { doc: ydoc, provider: yprovider } = collabService.connect(
        projectId,
        collectionName,
        {
          providerType,
          signalingServers: serversToUse,
          websocketServer,
          autoReconnect,
          awarenessTimeout: awarenessTimeout * 1000
        }
      );
      setDoc(ydoc);
      setProvider(yprovider as ICollabProvider ?? undefined);

      const ymap = ydoc.getMap('data');

      const observer = () => {
        if (!isUpdatingRef.current) {
          setData(ymap.toJSON());
        }
      };

      ymap.observe(observer);
      setData(ymap.toJSON());
      setIsConnected(true);

      return () => {
        ymap.unobserve(observer);
        collabService.disconnect(projectId, collectionName);
        setIsConnected(false);
        setDoc(undefined);
        setProvider(undefined);
      };
    } catch (error) {
      console.warn('[CollabContext] Connection failed, continuing in offline mode:', error);
      setIsConnected(false);
      setDoc(undefined);
      setProvider(undefined);
      return () => { };
    }
  }, [
    projectId,
    collectionName,
    providerType,
    signalingServers,
    websocketServer,
    autoReconnect,
    awarenessTimeout
  ]);

  const changeData = useCallback(
    (fn: (currentData: any) => void) => {
      if (!doc) return;

      const ymap = doc.getMap('data');
      isUpdatingRef.current = true;

      doc.transact(() => {
        const currentData = ymap.toJSON();
        fn(currentData);

        for (const key of ymap.keys()) {
          ymap.delete(key);
        }
        if (typeof currentData === 'object' && currentData !== null) {
          Object.entries(currentData).forEach(([key, value]) => {
            ymap.set(key, value);
          });
        }
      });

      setData(ymap.toJSON());

      isUpdatingRef.current = false;
    },
    [doc]
  );

  const value: CollabContextType<any> = {
    collabService,
    doc,
    provider,
    data,
    changeData,
    isConnected
  };

  return (
    <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
  );
};