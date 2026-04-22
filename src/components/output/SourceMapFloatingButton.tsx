// src/components/output/SourceMapFloatingButtons.tsx
import { t } from '@/i18n';
import type React from 'react';

import { useSourceMap } from '../../hooks/useSourceMap';
import { LocateIcon } from '../common/Icons';

interface SourceMapFloatingButtonsProps {
    onForwardSync: () => void;
    className?: string;
}

const SourceMapFloatingButton: React.FC<SourceMapFloatingButtonsProps> = ({
    onForwardSync,
    className = '',
}) => {
    const { isAvailable, showFloatingButtons } = useSourceMap();

    if (!isAvailable || !showFloatingButtons) return null;

    return (
        <div className={`sourcemap-floating-buttons ${className}`}>
            <button
                className="sourcemap-floating-btn"
                onClick={onForwardSync}
                title={t('Jump to PDF location from current editor position (SyncTeX)')}
            >
                <LocateIcon />
            </button>
        </div>
    );
};

export default SourceMapFloatingButton;