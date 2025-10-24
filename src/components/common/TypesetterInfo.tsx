// src/components/common/TypesetterInfo.tsx
import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TypesetterInfoProps {
    type: 'latex' | 'typst';
}

const TypesetterInfo: React.FC<TypesetterInfoProps> = ({ type }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showTooltip || !buttonRef.current || !tooltipRef.current) return;

        const updatePosition = () => {
            if (!buttonRef.current || !tooltipRef.current) return;

            const buttonRect = buttonRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            const spacing = 12;
            const padding = 8;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const spaceRight = viewportWidth - buttonRect.right;
            const spaceLeft = buttonRect.left;
            const spaceBelow = viewportHeight - buttonRect.bottom;
            const spaceAbove = buttonRect.top;

            let top = 0;
            let left = 0;

            if (spaceRight >= tooltipRect.width + spacing) {
                left = buttonRect.right + spacing;
                top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
            } else if (spaceLeft >= tooltipRect.width + spacing) {
                left = buttonRect.left - tooltipRect.width - spacing;
                top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
            } else if (spaceBelow >= tooltipRect.height + spacing) {
                top = buttonRect.bottom + spacing;
                left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
            } else if (spaceAbove >= tooltipRect.height + spacing) {
                top = buttonRect.top - tooltipRect.height - spacing;
                left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
            } else {
                left = buttonRect.right + spacing;
                top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
            }

            top = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));
            left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));

            setPosition({ top, left });
        };

        updatePosition();

        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [showTooltip]);

    const getTooltipContent = () => {
        if (type === 'latex') {
            return (
                <>
                    <h4 className="typesetter-tooltip-title">LaTeX</h4>
                    <div className="typesetter-tooltip-section">
                        <strong>Engine:</strong> SwiftLaTeX v20/02/2022
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
                    <strong>Engine:</strong> @myriaddreamin/typst.ts v0.6.1-rc3
                </div>
                <div className="typesetter-tooltip-section">
                    <strong>Renderer:</strong> @myriaddreamin/typst-ts-renderer v0.6.1-rc3
                </div>
                <div className="typesetter-tooltip-section">
                    <strong>Typst Version:</strong> 0.13.1 (2025)
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
        <>
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
            {showTooltip &&
                createPortal(
                    <div
                        className="typesetter-tooltip"
                        ref={tooltipRef}
                        style={{
                            top: `${position.top}px`,
                            left: `${position.left}px`,
                        }}
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                    >
                        {getTooltipContent()}
                    </div>,
                    document.body
                )}
        </>
    );
};

export default TypesetterInfo;