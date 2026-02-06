// extras/viewers/drawio/DrawioSpashScreen.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

interface DrawioSplashScreenProps {
    iframeLoaded: boolean;
    minDisplayTime?: number;
    fileKey?: string;
}

const DrawioSplashScreen: React.FC<DrawioSplashScreenProps> = ({
    iframeLoaded,
    minDisplayTime = 500,
    fileKey
}) => {
    const [isVisible, setIsVisible] = useState(true);
    const [startTime, setStartTime] = useState(Date.now());

    useEffect(() => {
        setIsVisible(true);
        setStartTime(Date.now());
    }, [fileKey]);

    useEffect(() => {
        if (!iframeLoaded) return;

        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, minDisplayTime - elapsed);

        const timer = setTimeout(() => {
            setIsVisible(false);
        }, remainingTime);

        return () => clearTimeout(timer);
    }, [iframeLoaded, startTime, minDisplayTime]);

    if (!isVisible) return null;

    return (
        <div className="drawio-splash-screen">
            <div className="drawio-splash-content">
                <div className="drawio-splash-logo">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="64"
                        height="64"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect x="9" y="3" width="6" height="6" rx="1.5" />
                        <rect x="3" y="15" width="6" height="6" rx="1.5" />
                        <rect x="15" y="15" width="6" height="6" rx="1.5" />
                        <line x1="12" y1="9" x2="6" y2="15" />
                        <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                </div>
                <h2 className="drawio-splash-title">Draw.io</h2>
                <div className="drawio-splash-loading">
                    <div className="loading-spinner" />
                    <p>{t('Loading...')}</p>
                </div>
            </div>
        </div>
    );
};

export default DrawioSplashScreen;