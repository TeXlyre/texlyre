// src/components/common/PluginToolbar.tsx
import type React from 'react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import { MoreHorizontalIcon } from './Icons';

export interface ToolbarButton {
    key: string;
    label: string;
    icon?: string;
}

export type ToolbarEntry = ToolbarButton | { type: 'split' } | { type: 'space' };

interface PluginToolbarProps {
    items: ToolbarEntry[];
    onRun: (key: string) => void;
    disabled?: boolean;
    protectedTailGroups?: number;
}

const OVERFLOW_KEY = 'toolbar-overflow';
const DEFAULT_ITEM_WIDTH = 32;
const DEFAULT_SPLIT_WIDTH = 8;
const FIT_PADDING = 150;

const groupKey = (items: ToolbarButton[]): string =>
    items.map((item) => item.key).join('-') || 'empty';

const splitGroups = (
    entries: ToolbarEntry[],
): { groups: ToolbarButton[][]; tail: ToolbarEntry[] } => {
    let tailStart = entries.length;
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if ('type' in entry && entry.type === 'space') {
            tailStart = i;
            break;
        }
    }

    const groups: ToolbarButton[][] = [];
    let current: ToolbarButton[] = [];

    for (const entry of entries.slice(0, tailStart)) {
        if ('type' in entry) {
            if (current.length > 0) groups.push(current);
            current = [];
        } else {
            current.push(entry);
        }
    }
    if (current.length > 0) groups.push(current);

    return { groups, tail: entries.slice(tailStart) };
};

const PluginToolbar: React.FC<PluginToolbarProps> = ({
    items,
    onRun,
    disabled,
    protectedTailGroups = 0,
}) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const overflowMenuRef = useRef<HTMLDivElement>(null);
    const isBaselineRef = useRef(true);
    const widthCacheRef = useRef<{
        byKey: Map<string, number>;
        split: number;
        overflow: number;
    } | null>(null);

    const [collapsedIdx, setCollapsedIdx] = useState<Set<number>>(new Set());
    const [overflowOpen, setOverflowOpen] = useState(false);

    const overflowIcon = renderToString(<MoreHorizontalIcon />);

    const measure = useCallback(() => {
        const el = toolbarRef.current;
        if (!el) return;

        const available = el.clientWidth;
        if (available <= 0) return;

        if (isBaselineRef.current) {
            const byKey = new Map<string, number>();
            el.querySelectorAll<HTMLElement>('[data-item]').forEach((node) => {
                if (node.dataset.item) byKey.set(node.dataset.item, node.offsetWidth);
            });
            widthCacheRef.current = {
                byKey,
                split:
                    el.querySelector<HTMLElement>('.plugin-toolbar__split')
                        ?.offsetWidth ?? DEFAULT_SPLIT_WIDTH,
                overflow: byKey.get(OVERFLOW_KEY) ?? DEFAULT_ITEM_WIDTH,
            };
        }

        const cache = widthCacheRef.current;
        if (!cache) return;

        const { groups, tail } = splitGroups(items);
        const { byKey, split: splitWidth, overflow: overflowWidth } = cache;
        const widthOf = (key: string) => byKey.get(key) ?? DEFAULT_ITEM_WIDTH;

        const groupWidths = groups.map((group) =>
            group.reduce((sum, item) => sum + widthOf(item.key), 0),
        );
        const tailWidth = tail.reduce(
            (sum, entry) =>
                'type' in entry
                    ? sum + (entry.type === 'split' ? splitWidth : 0)
                    : sum + widthOf(entry.key),
            0,
        );

        let total =
            groupWidths.reduce((a, b) => a + b, 0) +
            Math.max(0, groups.length - 1) * splitWidth +
            tailWidth;
        const fitLimit = available - overflowWidth - FIT_PADDING;

        const protectedCount = Math.min(protectedTailGroups, groups.length);
        const nextCollapsed = new Set<number>();

        const collapseAt = (idx: number) => {
            total -= groupWidths[idx];
            total += nextCollapsed.size === 0 ? overflowWidth : -splitWidth;
            nextCollapsed.add(idx);
        };

        if (protectedCount > 0 && total > fitLimit) {
            for (let i = groups.length - protectedCount - 1; i >= 0; i--) {
                collapseAt(i);
            }
        }

        let next = nextCollapsed.size === 0 ? groups.length - 1 : -1;
        while (total > fitLimit && nextCollapsed.size < groups.length) {
            while (next >= 0 && nextCollapsed.has(next)) next--;
            if (next < 0) break;
            collapseAt(next);
            next--;
        }

        isBaselineRef.current = nextCollapsed.size === 0;

        setCollapsedIdx((prev) =>
            prev.size === nextCollapsed.size &&
                [...prev].every((idx) => nextCollapsed.has(idx))
                ? prev
                : nextCollapsed,
        );
    }, [items, protectedTailGroups]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: items is a reset trigger, not read in body
    useLayoutEffect(() => {
        widthCacheRef.current = null;
        isBaselineRef.current = true;
        setCollapsedIdx(new Set());
    }, [items]);

    useEffect(() => {
        const el = toolbarRef.current;
        if (!el) return;

        const observer = new ResizeObserver(() => measure());
        observer.observe(el);
        measure();

        return () => observer.disconnect();
    }, [measure]);

    useLayoutEffect(() => {
        if (!overflowOpen) return;

        const root = toolbarRef.current;
        const menu = overflowMenuRef.current;
        const button = root?.querySelector<HTMLElement>(
            `[data-item="${OVERFLOW_KEY}"]`,
        );
        if (!root || !menu || !button) return;

        const rootRect = root.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        menu.style.left = `${buttonRect.left - rootRect.left}px`;
    }, [overflowOpen]);

    useEffect(() => {
        if (!overflowOpen) return;

        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as Node;
            const root = toolbarRef.current;
            if (!root) return;
            const button = root.querySelector(`[data-item="${OVERFLOW_KEY}"]`);
            if (
                !button?.contains(target) &&
                !overflowMenuRef.current?.contains(target)
            ) {
                setOverflowOpen(false);
            }
        };

        document.addEventListener('click', handleDocumentClick);
        return () => document.removeEventListener('click', handleDocumentClick);
    }, [overflowOpen]);

    const { groups, tail } = splitGroups(items);
    const collapsedGroups: ToolbarButton[][] = [];
    const visibleGroups: ToolbarButton[][] = [];

    groups.forEach((group, idx) => {
        (collapsedIdx.has(idx) ? collapsedGroups : visibleGroups).push(group);
    });

    const renderButton = (
        item: ToolbarButton,
        icon = item.icon,
        onClick: (event: React.MouseEvent) => void = () => onRun(item.key),
    ) => (
        <button
            key={item.key}
            type='button'
            className='plugin-toolbar__item'
            data-item={item.key}
            title={item.label}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
        >
            <i
                className='plugin-toolbar__icon'
                // biome-ignore lint/security/noDangerouslySetInnerHtml: icons are trusted pre-rendered SVG strings
                dangerouslySetInnerHTML={{ __html: icon || '' }}
            />
        </button>
    );

    const runOverflowItem = (key: string) => {
        const trigger = toolbarRef.current?.querySelector<HTMLElement>(
            `[data-item="${OVERFLOW_KEY}"]`,
        );
        const original = trigger?.dataset.item;
        if (trigger) trigger.dataset.item = key;
        setOverflowOpen(false);
        onRun(key);
        queueMicrotask(() => {
            if (!trigger) return;
            if (original) trigger.dataset.item = original;
            else delete trigger.dataset.item;
        });
    };

    return (
        <div ref={toolbarRef} className='plugin-toolbar'>
            {visibleGroups.map((group, idx) => (
                <span key={`group-${groupKey(group)}`} style={{ display: 'contents' }}>
                    {idx > 0 && <span className='plugin-toolbar__split' />}
                    {group.map((item) => renderButton(item))}
                </span>
            ))}

            {collapsedGroups.length > 0 && (
                <>
                    {visibleGroups.length > 0 && (
                        <span className='plugin-toolbar__split' />
                    )}
                    {renderButton(
                        { key: OVERFLOW_KEY, label: t('More'), icon: overflowIcon },
                        overflowIcon,
                        (event) => {
                            event.stopPropagation();
                            setOverflowOpen((open) => !open);
                        },
                    )}
                </>
            )}

            {tail.map((entry) =>
                'type' in entry ? (
                    <span
                        key={`tail-${entry.type}`}
                        className={`plugin-toolbar__${entry.type}`}
                    />
                ) : (
                    renderButton(entry)
                ),
            )}

            {overflowOpen && collapsedGroups.length > 0 && (
                <div
                    ref={overflowMenuRef}
                    className='plugin-toolbar-overflow-menu dropdown-menu'
                >
                    {collapsedGroups.map((group, groupIdx) => (
                        <div key={`section-${groupKey(group)}`}>
                            <div className='plugin-toolbar-overflow-section'>
                                {group.map((item) => (
                                    <button
                                        key={item.key}
                                        type='button'
                                        className='dropdown-item plugin-toolbar-overflow-item'
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => runOverflowItem(item.key)}
                                    >
                                        <span
                                            className='plugin-toolbar-overflow-icon'
                                            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted pre-rendered icon
                                            dangerouslySetInnerHTML={{ __html: item.icon || '' }}
                                        />
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </div>
                            {groupIdx < collapsedGroups.length - 1 && (
                                <div className='plugin-toolbar-overflow-separator' />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PluginToolbar;
