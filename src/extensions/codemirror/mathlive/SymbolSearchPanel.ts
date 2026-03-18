// src/extensions/codemirror/mathlive/SymbolSearchPanel.ts
import { t } from '@/i18n';
import { Detypify, inferSyms, ortEnv, type Strokes } from 'detypify-service';

import {
    searchSymbols,
    symbolInfoToCandidate,
    getCommandForFileType,
    type SymbolCandidate,
} from './SymbolData';
import type { FileType } from './patterns';

const BASE_PATH = __BASE_PATH__

let detypifyInstance: Detypify | null = null;
let detypifyLoading: Promise<Detypify> | null = null;

async function getDetypify(): Promise<Detypify> {
    if (detypifyInstance) return detypifyInstance;
    if (!detypifyLoading) {
        detypifyLoading = (async () => {
            ortEnv.wasm.numThreads = 1;
            ortEnv.wasm.wasmPaths = BASE_PATH + '/core/detypify/';
            const response = await fetch(BASE_PATH + '/core/detypify/model.onnx');
            const modelData = await response.arrayBuffer();
            const { InferenceSession } = await import('onnxruntime-web/wasm');
            const session = await InferenceSession.create(modelData);
            detypifyInstance = new Detypify(session);
            return detypifyInstance;
        })();
        detypifyLoading.catch(() => {
            detypifyLoading = null;
        });
    }
    return detypifyLoading;
}

export class SymbolSearchPanel {
    private container: HTMLElement;
    private searchInput!: HTMLInputElement;
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private resultsContainer!: HTMLElement;
    private strokes: Strokes = [];
    private currentStroke: [number, number][] = [];
    private isDrawing = false;
    private classifyTimeout: ReturnType<typeof setTimeout> | null = null;
    private searchTimeout: ReturnType<typeof setTimeout> | null = null;
    private recognizedCandidates: SymbolCandidate[] = [];

    constructor(
        private fileType: FileType,
        private onInsert: (command: string) => void,
    ) {
        this.container = this.buildDOM();
        this.canvas = this.container.querySelector('.cm-symbol-canvas')!;
        this.ctx = this.canvas.getContext('2d')!;
        this.searchInput = this.container.querySelector('.cm-symbol-search-input')!;
        this.resultsContainer = this.container.querySelector('.cm-symbol-results')!;
        this.setupCanvasEvents();
        this.setupSearchEvents();
        this.renderEmpty();
        getDetypify();
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        if (this.classifyTimeout) clearTimeout(this.classifyTimeout);
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.container.remove();
    }

    private buildDOM(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'cm-symbol-search-panel';

        const searchBar = document.createElement('div');
        searchBar.className = 'cm-symbol-search-bar';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cm-symbol-search-input';
        input.placeholder = t('Search symbols (e.g. alpha, sum, arrow)...');
        searchBar.appendChild(input);

        const body = document.createElement('div');
        body.className = 'cm-symbol-body';

        const drawArea = document.createElement('div');
        drawArea.className = 'cm-symbol-draw-area';

        const drawLabel = document.createElement('div');
        drawLabel.className = 'cm-symbol-draw-label';
        drawLabel.textContent = t('Draw a symbol');

        const canvas = document.createElement('canvas');
        canvas.className = 'cm-symbol-canvas';
        canvas.width = 200;
        canvas.height = 200;

        const clearBtn = document.createElement('button');
        clearBtn.className = 'cm-symbol-clear-btn button';
        clearBtn.textContent = t('Clear');
        clearBtn.addEventListener('click', () => this.clearCanvas());

        drawArea.appendChild(drawLabel);
        drawArea.appendChild(canvas);
        drawArea.appendChild(clearBtn);

        const results = document.createElement('div');
        results.className = 'cm-symbol-results';

        body.appendChild(drawArea);
        body.appendChild(results);
        container.appendChild(searchBar);
        container.appendChild(body);

        return container;
    }

    private setupSearchEvents(): void {
        this.searchInput.addEventListener('input', () => {
            if (this.searchTimeout) clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.updateResults(), 150);
        });
        this.searchInput.addEventListener('keydown', (e) => e.stopPropagation());
    }

    private setupCanvasEvents(): void {
        const getPos = (e: MouseEvent | Touch): [number, number] => {
            const rect = this.canvas.getBoundingClientRect();
            return [
                (e.clientX - rect.left) * (this.canvas.width / rect.width),
                (e.clientY - rect.top) * (this.canvas.height / rect.height),
            ];
        };

        const startStroke = (pos: [number, number]) => {
            this.isDrawing = true;
            this.currentStroke = [pos];
            this.ctx.beginPath();
            this.ctx.moveTo(pos[0], pos[1]);
        };

        const continueStroke = (pos: [number, number]) => {
            if (!this.isDrawing) return;
            this.currentStroke.push(pos);
            this.ctx.lineTo(pos[0], pos[1]);
            this.ctx.strokeStyle = getComputedStyle(this.canvas).getPropertyValue('--cm-symbol-stroke-color').trim() || '#333';
            this.ctx.lineWidth = 3;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
        };

        const endStroke = () => {
            if (!this.isDrawing) return;
            this.isDrawing = false;
            if (this.currentStroke.length > 1) {
                this.strokes.push([...this.currentStroke]);
                this.scheduleClassify();
            }
            this.currentStroke = [];
        };

        this.canvas.addEventListener('mousedown', (e) => startStroke(getPos(e)));
        this.canvas.addEventListener('mousemove', (e) => continueStroke(getPos(e)));
        this.canvas.addEventListener('mouseup', endStroke);
        this.canvas.addEventListener('mouseleave', endStroke);

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startStroke(getPos(e.touches[0]));
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            continueStroke(getPos(e.touches[0]));
        }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            endStroke();
        });
    }

    private clearCanvas(): void {
        this.strokes = [];
        this.currentStroke = [];
        this.recognizedCandidates = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.updateResults();
    }

    private scheduleClassify(): void {
        if (this.classifyTimeout) clearTimeout(this.classifyTimeout);
        this.classifyTimeout = setTimeout(() => this.classify(), 400);
    }

    private async classify(): Promise<void> {
        if (this.strokes.length === 0) return;

        try {
            const detector = await getDetypify();
            const scores = await detector.infer(this.strokes);
            const ranked = Array.from(scores.keys())
                .sort((a, b) => scores[b] - scores[a])
                .slice(0, 20);

            this.recognizedCandidates = ranked
                .map(i => symbolInfoToCandidate(inferSyms[i], this.fileType))
                .filter((c): c is SymbolCandidate => c !== null);

            this.updateResults();
        } catch (err) {
            console.error('[SymbolSearchPanel] Classification error:', err);
            this.showError(String(err));
        }
    }

    private updateResults(): void {
        const query = this.searchInput.value.trim();
        const textResults = query ? searchSymbols(query, this.fileType) : [];

        const seen = new Set<string>();
        const merged: SymbolCandidate[] = [];
        for (const list of [this.recognizedCandidates, textResults]) {
            for (const c of list) {
                if (seen.has(c.char)) continue;
                seen.add(c.char);
                merged.push(c);
            }
        }

        this.renderResults(merged);
    }

    private renderEmpty(): void {
        this.resultsContainer.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'cm-symbol-hint';
        hint.textContent = t('Draw or search to find symbols');
        this.resultsContainer.appendChild(hint);
    }

    private showError(message?: string): void {
        this.resultsContainer.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'cm-symbol-hint cm-symbol-error';
        err.textContent = message
            ? t('Recognition failed: ') + message
            : t('Symbol recognition unavailable');
        this.resultsContainer.appendChild(err);
    }

    private renderResults(candidates: SymbolCandidate[]): void {
        this.resultsContainer.innerHTML = '';

        if (candidates.length === 0) {
            const query = this.searchInput.value.trim();
            if (!query && this.strokes.length === 0) {
                this.renderEmpty();
                return;
            }
            const empty = document.createElement('div');
            empty.className = 'cm-symbol-hint';
            empty.textContent = t('No symbols found');
            this.resultsContainer.appendChild(empty);
            return;
        }

        for (const candidate of candidates) {
            const command = getCommandForFileType(candidate, this.fileType);

            const btn = document.createElement('button');
            btn.className = 'cm-symbol-result-btn';
            btn.title = `${command} — ${candidate.typstName}`;

            const charSpan = document.createElement('span');
            charSpan.className = 'cm-symbol-result-char';
            charSpan.textContent = candidate.char;

            const label = document.createElement('span');
            label.className = 'cm-symbol-result-label';
            label.textContent = command;

            btn.appendChild(charSpan);
            btn.appendChild(label);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.onInsert(command);
            });

            this.resultsContainer.appendChild(btn);
        }
    }
}