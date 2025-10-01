// src/components/common/TypesetterInfo.tsx
import type React from "react";
import { useState, useRef, useEffect } from "react";

interface TypesetterInfoProps {
    type: "latex" | "typst";
}

interface TooltipPosition {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    transform?: string;
}

const TypesetterInfo: React.FC<TypesetterInfoProps> = ({ type }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({});
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!showTooltip || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const tooltipWidth = 320;
        const tooltipHeight = 200;
        const spacing = 12;
        const padding = 8;

        const position: TooltipPosition = {};

        const preferHorizontal = window.innerWidth - rect.right > rect.left;

        if (preferHorizontal) {
            position.left = `calc(100% + ${spacing}px)`;
        } else {
            position.right = `calc(100% + ${spacing}px)`;
        }

        const centerY = rect.top + rect.height / 2 - tooltipHeight / 2;
        const clampedY = Math.max(padding, Math.min(centerY, window.innerHeight - tooltipHeight - padding));
        position.top = `${clampedY - rect.top}px`;

        setTooltipPosition(position);
    }, [showTooltip]);

    const getTooltipContent = () => {
        if (type === "latex") {
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
                {type === "latex" ? "LaTeX" : "Typst"}
            </button>
            {showTooltip && (
                <div className="typesetter-tooltip" style={tooltipPosition}>
                    {getTooltipContent()}
                </div>
            )}
        </div>
    );
};

export default TypesetterInfo;