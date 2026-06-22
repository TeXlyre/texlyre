/* tslint:disable */
/* eslint-disable */

export class CreateSessionOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    set artifact_content(value: Uint8Array);
    set format(value: string);
}

/**
 * maintains the state of the incremental rendering at client side
 */
export class IncrDomDocClient {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    bind_functions(functions: any): void;
    need_repaint(page_num: number, x: number, y: number, w: number, h: number, stage: number): boolean;
    /**
     * Relayout the document in the given window.
     */
    relayout(x: number, y: number, w: number, h: number): Promise<boolean>;
    repaint(page_num: number, x: number, y: number, w: number, h: number, stage: number): any;
}

export class PageInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly height_pt: number;
    readonly page_off: number;
    readonly width_pt: number;
}

export class PagesInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    height(): number;
    page(i: number): PageInfo;
    page_by_number(num: number): PageInfo | undefined;
    width(): number;
    readonly page_count: number;
}

export class RenderPageImageOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    get background_color(): string | undefined;
    set background_color(value: string | null | undefined);
    get cache_key(): string | undefined;
    set cache_key(value: string | null | undefined);
    get data_selection(): number | undefined;
    set data_selection(value: number | null | undefined);
    page_off: number;
    get pixel_per_pt(): number | undefined;
    set pixel_per_pt(value: number | null | undefined);
}

export class RenderSession {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    render_in_window(rect_lo_x: number, rect_lo_y: number, rect_hi_x: number, rect_hi_y: number): string;
    source_span(path: Uint32Array): string | undefined;
    get background_color(): string | undefined;
    set background_color(value: string | null | undefined);
    readonly doc_height: number;
    readonly doc_width: number;
    readonly pages_info: PagesInfo;
    get pixel_per_pt(): number | undefined;
    set pixel_per_pt(value: number | null | undefined);
}

export class RenderSessionOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    get background_color(): string | undefined;
    set background_color(value: string | null | undefined);
    get format(): string | undefined;
    set format(value: string | null | undefined);
    get pixel_per_pt(): number | undefined;
    set pixel_per_pt(value: number | null | undefined);
}

export class TypstRenderer {
    free(): void;
    [Symbol.dispose](): void;
    create_session(options?: CreateSessionOptions | null): RenderSession;
    create_worker(_w: any): Promise<TypstWorker>;
    create_worker_bridge(): WorkerBridge;
    get_customs(session: RenderSession): Array<any> | undefined;
    load_glyph_pack(_v: any): void;
    manipulate_data(session: RenderSession, action: string, data: Uint8Array): void;
    mount_dom(ses: RenderSession, elem: HTMLElement): Promise<IncrDomDocClient>;
    constructor();
    render_page_to_canvas(ses: RenderSession, canvas: any, options?: RenderPageImageOptions | null): Promise<any>;
    render_svg(session: RenderSession, root: HTMLElement): boolean;
    render_svg_diff(session: RenderSession, rect_lo_x: number, rect_lo_y: number, rect_hi_x: number, rect_hi_y: number): string;
    reset(session: RenderSession): void;
    session_from_artifact(artifact_content: Uint8Array, decoder: string): RenderSession;
    svg_data(session: RenderSession, parts?: number | null): string;
}

export class TypstRendererBuilder {
    free(): void;
    [Symbol.dispose](): void;
    add_glyph_pack(_pack: any): Promise<void>;
    add_lazy_font(_font: any, _blob: any): Promise<void>;
    add_raw_font(_font_buffer: Uint8Array): Promise<void>;
    build(): Promise<TypstRenderer>;
    constructor();
}

export class TypstWorker {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get_pages_info(): Promise<any>;
    manipulate_data(_action: string, _data: Uint8Array): Promise<any>;
    render_canvas(_actions: Uint8Array, _canvas_list: HTMLCanvasElement[], _data: RenderPageImageOptions[]): Promise<any>;
}

export class WorkerBridge {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Return an object containing build info
 * CodeSize: 4KB
 */
export function renderer_build_info(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_renderpageimageoptions_free: (a: number, b: number) => void;
    readonly __wbg_typstrenderer_free: (a: number, b: number) => void;
    readonly renderer_build_info: () => number;
    readonly renderpageimageoptions_background_color: (a: number, b: number) => void;
    readonly renderpageimageoptions_cache_key: (a: number, b: number) => void;
    readonly renderpageimageoptions_data_selection: (a: number) => number;
    readonly renderpageimageoptions_new: () => number;
    readonly renderpageimageoptions_page_off: (a: number) => number;
    readonly renderpageimageoptions_pixel_per_pt: (a: number) => number;
    readonly renderpageimageoptions_set_background_color: (a: number, b: number, c: number) => void;
    readonly renderpageimageoptions_set_cache_key: (a: number, b: number, c: number) => void;
    readonly renderpageimageoptions_set_data_selection: (a: number, b: number) => void;
    readonly renderpageimageoptions_set_page_off: (a: number, b: number) => void;
    readonly renderpageimageoptions_set_pixel_per_pt: (a: number, b: number) => void;
    readonly typstrenderer_create_session: (a: number, b: number, c: number) => void;
    readonly typstrenderer_load_glyph_pack: (a: number, b: number, c: number) => void;
    readonly typstrenderer_manipulate_data: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly typstrenderer_reset: (a: number, b: number, c: number) => void;
    readonly typstrenderer_session_from_artifact: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly typstrendererbuilder_add_glyph_pack: (a: number, b: number) => number;
    readonly typstrendererbuilder_add_lazy_font: (a: number, b: number, c: number) => number;
    readonly typstrendererbuilder_add_raw_font: (a: number, b: number) => number;
    readonly typstrenderer_new: () => number;
    readonly __wbg_typstrendererbuilder_free: (a: number, b: number) => void;
    readonly __wbg_typstworker_free: (a: number, b: number) => void;
    readonly __wbg_workerbridge_free: (a: number, b: number) => void;
    readonly rendersession_render_in_window: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly typstrenderer_create_worker: (a: number, b: number) => number;
    readonly typstrenderer_create_worker_bridge: (a: number, b: number) => void;
    readonly typstrenderer_get_customs: (a: number, b: number) => number;
    readonly typstrenderer_render_svg: (a: number, b: number, c: number, d: number) => void;
    readonly typstrenderer_render_svg_diff: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly typstrenderer_svg_data: (a: number, b: number, c: number, d: number) => void;
    readonly typstrendererbuilder_build: (a: number) => number;
    readonly typstrendererbuilder_new: (a: number) => void;
    readonly typstworker_get_pages_info: (a: number) => number;
    readonly typstworker_manipulate_data: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly typstworker_render_canvas: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly __wbg_createsessionoptions_free: (a: number, b: number) => void;
    readonly __wbg_pageinfo_free: (a: number, b: number) => void;
    readonly __wbg_pagesinfo_free: (a: number, b: number) => void;
    readonly __wbg_rendersession_free: (a: number, b: number) => void;
    readonly __wbg_rendersessionoptions_free: (a: number, b: number) => void;
    readonly createsessionoptions_new: () => number;
    readonly createsessionoptions_set_artifact_content: (a: number, b: number, c: number) => void;
    readonly createsessionoptions_set_format: (a: number, b: number, c: number) => void;
    readonly pageinfo_height_pt: (a: number) => number;
    readonly pageinfo_page_off: (a: number) => number;
    readonly pageinfo_width_pt: (a: number) => number;
    readonly pagesinfo_height: (a: number) => number;
    readonly pagesinfo_page: (a: number, b: number) => number;
    readonly pagesinfo_page_by_number: (a: number, b: number) => number;
    readonly pagesinfo_page_count: (a: number) => number;
    readonly pagesinfo_width: (a: number) => number;
    readonly rendersession_background_color: (a: number, b: number) => void;
    readonly rendersession_doc_height: (a: number) => number;
    readonly rendersession_doc_width: (a: number) => number;
    readonly rendersession_pages_info: (a: number) => number;
    readonly rendersession_pixel_per_pt: (a: number) => number;
    readonly rendersession_set_background_color: (a: number, b: number, c: number) => void;
    readonly rendersession_set_pixel_per_pt: (a: number, b: number) => void;
    readonly rendersession_source_span: (a: number, b: number, c: number, d: number) => void;
    readonly rendersessionoptions_background_color: (a: number, b: number) => void;
    readonly rendersessionoptions_format: (a: number, b: number) => void;
    readonly rendersessionoptions_new: () => number;
    readonly rendersessionoptions_set_background_color: (a: number, b: number, c: number) => void;
    readonly rendersessionoptions_set_format: (a: number, b: number, c: number) => void;
    readonly typstrenderer_mount_dom: (a: number, b: number, c: number) => number;
    readonly rendersessionoptions_pixel_per_pt: (a: number) => number;
    readonly rendersessionoptions_set_pixel_per_pt: (a: number, b: number) => void;
    readonly typstrenderer_render_page_to_canvas: (a: number, b: number, c: number, d: number) => number;
    readonly __wbg_incrdomdocclient_free: (a: number, b: number) => void;
    readonly incrdomdocclient_bind_functions: (a: number, b: number) => void;
    readonly incrdomdocclient_need_repaint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly incrdomdocclient_relayout: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly incrdomdocclient_repaint: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly __wasm_bindgen_func_elem_4016: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_4008: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_1049: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_1051: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export5: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
