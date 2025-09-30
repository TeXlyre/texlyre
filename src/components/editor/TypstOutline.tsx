// src/components/editor/TypstOutline.tsx
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useProperties } from "../../hooks/useProperties";
import { TypstOutlineParser } from "../../utils/typstOutlineParser";
import { ChevronDownIcon, ChevronRightIcon, RefreshIcon } from "../common/Icons";
import TypstOutlineItem from "./TypstOutlineItem";

interface TypstOutlineProps {
    content: string;
    currentLine?: number;
    onSectionClick: (line: number) => void;
    onRefresh?: () => Promise<void>;
}

const TypstOutline: React.FC<TypstOutlineProps> = ({
    content,
    currentLine = 1,
    onSectionClick,
    onRefresh
}) => {
    const { getProperty, setProperty, registerProperty } = useProperties();
    const propertiesRegistered = useRef(false);
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: "typst-outline-collapsed",
            category: "UI",
            subcategory: "Layout",
            defaultValue: true,
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedCollapsed = getProperty("typst-outline-collapsed");

        if (storedCollapsed !== undefined) {
            setIsCollapsed(Boolean(storedCollapsed));
        }

        setPropertiesLoaded(true);
    }, [getProperty, propertiesLoaded]);

    const sections = useMemo(() => {
        if (!content.trim()) return [];
        return TypstOutlineParser.parse(content);
    }, [content, refreshKey]);

    const currentSection = useMemo(() => {
        return TypstOutlineParser.getCurrentSection(sections, currentLine);
    }, [sections, currentLine]);

    const handleRefresh = async () => {
        if (onRefresh) {
            await onRefresh();
        }
        setRefreshKey(prev => prev + 1);
    };

    const handleToggleCollapse = () => {
        const newCollapsed = !isCollapsed;
        setIsCollapsed(newCollapsed);
        setProperty("typst-outline-collapsed", newCollapsed);
    };

    if (sections.length === 0) {
        return (
            <div className="typst-outline">
                <div className="typst-outline-header">
                    <button
                        className="outline-toggle-btn"
                        onClick={handleToggleCollapse}
                    >
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                    </button>
                    <span className="outline-header-title">OUTLINE</span>
                    <button
                        className="action-btn"
                        title="Refresh Outline"
                        onClick={handleRefresh}
                    >
                        <RefreshIcon />
                    </button>
                </div>
                {!isCollapsed && (
                    <div className="outline-empty-state">
                        <p>No headings found</p>
                        <small>Use = for headings</small>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="typst-outline">
            <div className="typst-outline-header">
                <button
                    className="outline-toggle-btn"
                    onClick={handleToggleCollapse}
                >
                    {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </button>
                <span className="outline-header-title">OUTLINE</span>
                <span className="outline-section-count">
                    {sections.length}
                </span>
                <button
                    className="action-btn"
                    title="Refresh Outline"
                    onClick={handleRefresh}
                >
                    <RefreshIcon />
                </button>
            </div>

            {!isCollapsed && (
                <div className="outline-content">
                    {sections.map((section) => (
                        <TypstOutlineItem
                            key={section.id}
                            section={section}
                            currentSection={currentSection}
                            onSectionClick={onSectionClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default TypstOutline;