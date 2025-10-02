// src/components/common/TypesetterInfo.tsx
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

interface TypesetterInfoProps {
    type: 'latex' | 'typst';
}

interface TooltipPosition {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    transform?: string;
    position?: 'fixed';
}

const TypesetterInfo: React.FC<TypesetterInfoProps> = ({ type }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showTooltip || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const spacing = 12;
        const padding = 8;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let tooltipWidth = 320;
        let tooltipHeight = 200;

        if (tooltipRef.current) {
            const el = tooltipRef.current;
            const prev = {
                position: el.style.position,
                left: el.style.left,
                top: el.style.top,
                visibility: el.style.visibility,
            };
            el.style.position = 'fixed';
            el.style.left = '-9999px';
            el.style.top = '-9999px';
            el.style.visibility = 'hidden';
            tooltipWidth = el.offsetWidth || tooltipWidth;
            tooltipHeight = el.offsetHeight || tooltipHeight;
            el.style.position = prev.position;
            el.style.left = prev.left;
            el.style.top = prev.top;
            el.style.visibility = prev.visibility;
        }

        const position: TooltipPosition = { position: 'fixed' };

        const preferHorizontal = vw - rect.right > rect.left;

        const placements = {
            right: {
                x: rect.right + spacing,
                y: rect.top + rect.height / 2 - tooltipHeight / 2,
            },
            left: {
                x: rect.left - spacing - tooltipWidth,
                y: rect.top + rect.height / 2 - tooltipHeight / 2,
            },
        } as const;

        const fits = (p: { x: number; y: number }) =>
            p.x >= padding &&
            p.y >= padding &&
            p.x + tooltipWidth <= vw - padding &&
            p.y + tooltipHeight <= vh - padding;

        const order = preferHorizontal ? ['right', 'left'] : ['left', 'right'] as const;

        let chosen = placements[order[0]];
        if (!fits(chosen) && fits(placements[order[1]])) {
            chosen = placements[order[1]];
        }

        const clamped = {
            x: Math.min(Math.max(chosen.x, padding), vw - tooltipWidth - padding),
            y: Math.min(Math.max(chosen.y, padding), vh - tooltipHeight - padding),
        };

        position.left = `${Math.round(clamped.x)}px`;
        position.top = `${Math.round(clamped.y)}px`;

        setTooltipPosition(position);
    }, [showTooltip]);

    const getTooltipContent = () => {
        if (type === 'latex') {
            return (
                <>
                    <h4 className="typesetter-tooltip-title">LaTeX</h4>
                    <div className="typesetter-tooltip-section">
                        <strong>Engine:</strong> SwiftLaTeX
                    </div>
                    <div className="typesetter-tooltip-section">
                        <strong>Compilers:</strong>
                        <ul>
                            <li>pdfTeX (2020)</li>
                            <li>XeTeX (2020)</li>
                        </ul>
                    </div>
                    <div className="typesetter-tooltip-section">
                        <strong>Output:</strong> PDF
                    </div>
                </>
            );
        }

        return (
            <>
                <h4 className="typesetter-tooltip-title">Typst</h4>
                <div className="typesetter-tooltip-section">
                    <strong>Engine:</strong> @myriaddreamin/typst.ts
                </div>
                <div className="typesetter-tooltip-section">
                    <strong>Version:</strong> 0.13.1
                </div>
                <div className="typesetter-tooltip-section">
                    <strong>Output Formats:</strong>
                    <ul>
                        <li>PDF</li>
                        <li>SVG</li>
                        <li>Canvas (HTML)</li>
                    </ul>
                </div>
            </>
        );
    };

    return (
        <div className="typesetter-info-container">
            <button
                ref={buttonRef}
                type="button"
                className="type-info-help"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
            >
                {type === 'latex' ? 'LaTeX' : 'Typst'}
            </button>
            {showTooltip && (
                <div className="typesetter-tooltip" ref={tooltipRef} style={tooltipPosition}>
                    {getTooltipContent()}
                </div>
            )}
        </div>
    );
};

export default TypesetterInfo;