// src/contexts/CollabContext.tsx
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
import type {
  CollabContextType,
  CollabProvider as ICollabProvider,
  CollabProviderType
} from '../types/collab';
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
  const { getSetting } = useSettings();

  const providerType =
    (getSetting('collab-provider-type')?.value as CollabProviderType | undefined) ?? 'webrtc';
  const signalingServers =
    (getSetting('collab-signaling-servers')?.value as string | undefined) ?? 'ws://ywebrtc.localhost:8082/';
  const websocketServer =
    (getSetting('collab-websocket-server')?.value as string | undefined) ?? 'ws://yweb.localhost:8082/';
  const awarenessTimeout =
    (getSetting('collab-awareness-timeout')?.value as number | undefined) ?? 30;
  const autoReconnect =
    (getSetting('collab-auto-reconnect')?.value as boolean | undefined) ?? false;

  const projectId = useMemo(() => {
    return docUrl.startsWith('yjs:') ?
      docUrl.slice(4) :
      docUrl.replace(/[^a-zA-Z0-9]/g, '-');
  }, [docUrl]);

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