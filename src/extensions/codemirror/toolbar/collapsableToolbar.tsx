// src/extensions/codemirror/toolbar/collapsableToolbar.tsx
import { t } from '@/i18n';
import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { ViewPlugin } from '@codemirror/view';
import toolbar from 'codemirror-toolbar';
import type { ToolbarItem, ToolbarSplit, ToolbarSpace } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';

import { MoreHorizontalIcon } from '../../../components/common/Icons';
import { OverflowMenu, type CollapsedGroup } from './overflowMenu';

type ToolbarEntry = ToolbarItem | ToolbarSplit | ToolbarSpace;

const OVERFLOW_KEY = 'toolbar-overflow';
const overflowMenus = new WeakMap<EditorView, OverflowMenu>();
const collapsedGroupsByView = new WeakMap<EditorView, CollapsedGroup[]>();

function splitGroups(entries: ToolbarEntry[]): { groups: ToolbarItem[][]; tail: ToolbarEntry[] } {
    let tailStart = entries.length;
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if ('type' in e && e.type === 'space') {
            tailStart = i;
            break;
        }
    }

    const groups: ToolbarItem[][] = [];
    let current: ToolbarItem[] = [];
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
}

function createOverflowItem(): ToolbarItem {
    return {
        key: OVERFLOW_KEY,
        label: t('More'),
        icon: renderToString(<MoreHorizontalIcon />),
        command: (v: EditorView) => {
            const button = v.dom.querySelector(`.codemirror-toolbar [data-item="${OVERFLOW_KEY}"]`) as HTMLElement | null;
            if (!button) return false;

            let menu = overflowMenus.get(v);
            if (menu && !document.body.contains(menu.container)) {
                menu.destroy();
                menu = undefined;
            }
            if (!menu) {
                menu = new OverflowMenu(v, button, {
                    getGroups: () => collapsedGroupsByView.get(v) ?? [],
                });
                overflowMenus.set(v, menu);
            }
            menu.toggle();
            return true;
        },
    };
}

function buildItems(entries: ToolbarEntry[], collapsedIdx: Set<number>, view: EditorView): ToolbarEntry[] {
    if (collapsedIdx.size === 0) {
        collapsedGroupsByView.delete(view);
        return entries;
    }

    const { groups, tail } = splitGroups(entries);
    const collapsed: ToolbarItem[][] = [];
    const visible: ToolbarItem[][] = [];

    groups.forEach((g, i) => {
        if (collapsedIdx.has(i)) collapsed.push(g);
        else visible.push(g);
    });

    collapsedGroupsByView.set(view, collapsed.map((items) => ({ items })));

    const split: ToolbarSplit = { type: 'split' };
    const result: ToolbarEntry[] = [];

    visible.forEach((group, idx) => {
        if (idx > 0) result.push(split);
        result.push(...group);
    });

    if (visible.length > 0) result.push(split);
    result.push(createOverflowItem());
    result.push(...tail);

    return result;
}

export function createCollapsableToolbar(getEntries: () => ToolbarEntry[],
    compartment: Compartment,
    getProtectedTailGroups: () => number = () => 0
) {
    let view: EditorView | null = null;
    let toolbarEl: HTMLElement | null = null;
    let currentCollapse = 0;
    let widthCache: { byKey: Map<string, number>; split: number; overflow: number } | null = null;
    const observer = new ResizeObserver(() => measure());

    const measureItems = (el: HTMLElement) => {
        const byKey = new Map<string, number>();
        el.querySelectorAll<HTMLElement>('[data-item]').forEach((node) => {
            if (node.dataset.item) byKey.set(node.dataset.item, node.offsetWidth);
        });
        return {
            byKey,
            split: el.querySelector<HTMLElement>('.cm-toolbar-split')?.offsetWidth ?? 8,
            overflow: byKey.get(OVERFLOW_KEY) ?? 32,
        };
    };

    const measure = () => {
        if (!view) return;
        if (!toolbarEl?.isConnected) {
            toolbarEl = view.dom.querySelector('.codemirror-toolbar');
            if (!toolbarEl) return;
            observer.disconnect();
            observer.observe(toolbarEl);
        }

        const available = toolbarEl.clientWidth;
        if (available <= 0) return;

        if (currentCollapse === 0) widthCache = measureItems(toolbarEl);
        if (!widthCache) return;

        const entries = getEntries();
        const { groups, tail } = splitGroups(entries);
        const { byKey, split: splitWidth, overflow: overflowWidth } = widthCache;

        const groupWidths = groups.map((g) => g.reduce((sum, item) => sum + (byKey.get(item.key) ?? 32), 0));
        const tailWidth = tail.reduce((sum, e) => {
            if ('type' in e) return sum + (e.type === 'split' ? splitWidth : 0);
            return sum + (byKey.get(e.key) ?? 32);
        }, 0);

        let total = groupWidths.reduce((a, b) => a + b, 0)
            + Math.max(0, groups.length - 1) * splitWidth
            + tailWidth;
        const fitLimit = available - overflowWidth - 150;

        const protectedCount = Math.min(getProtectedTailGroups(), groups.length);
        const baseCount = groups.length - protectedCount;
        const collapsedIdx = new Set<number>();

        const collapseAt = (idx: number) => {
            total -= groupWidths[idx];
            total += collapsedIdx.size === 0 ? overflowWidth : -splitWidth;
            collapsedIdx.add(idx);
        };

        if (protectedCount > 0 && total > fitLimit) {
            for (let i = baseCount - 1; i >= 0; i--) collapseAt(i);
        }

        let next = collapsedIdx.size === 0 ? groups.length - 1 : -1;
        while (total > fitLimit && collapsedIdx.size < groups.length) {
            while (next >= 0 && collapsedIdx.has(next)) next--;
            if (next < 0) break;
            collapseAt(next);
            next--;
        }

        if (collapsedIdx.size !== currentCollapse) {
            currentCollapse = collapsedIdx.size;
            view.dispatch({ effects: compartment.reconfigure(toolbar({ items: buildItems(entries, collapsedIdx, view) })) });
        }

    };

    window.addEventListener('resize', measure);

    const reset = () => {
        currentCollapse = 0;
        widthCache = null;
        queueMicrotask(measure);
    };

    const plugin = ViewPlugin.fromClass(
        class {
            constructor(v: EditorView) {
                view = v;
                queueMicrotask(measure);
            }

            destroy() {
                observer.disconnect();
                if (!view) return;
                overflowMenus.get(view)?.destroy();
                overflowMenus.delete(view);
                collapsedGroupsByView.delete(view);
            }
        },
    );
    return { plugin, reset };
}
