/// Processed by wasm-debundle.mjs
let wasm;

let heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    if (typeof(heap_next) !== 'number') throw new Error('corrupt heap');

    heap[idx] = obj;
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export_0(addHeapObject(e));
    }
}

function logError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        let error = (function () {
            try {
                return e instanceof Error ? `${e.message}\n\nStack:\n${e.stack}` : e.toString();
            } catch(_) {
                return "<failed to stringify thrown value>";
            }
        }());
        console.error("wasm-bindgen: imported JS function that was not marked as `catch` threw an error:", error);
        throw e;
    }
}

function _assertNum(n) {
    if (typeof(n) !== 'number') throw new Error(`expected a number argument, found ${typeof(n)}`);
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

function passStringToWasm0(arg, malloc, realloc) {

    if (typeof(arg) !== 'string') throw new Error(`expected a string argument, found ${typeof(arg)}`);

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);
        if (ret.read !== arg.length) throw new Error('failed to pass whole string');
        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function _assertBoolean(n) {
    if (typeof(n) !== 'boolean') {
        throw new Error(`expected a boolean argument, found ${typeof(n)}`);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(
state => {
    wasm.__wbindgen_export_4.get(state.dtor)(state.a, state.b);
}
);

function makeClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        try {
            return f(state.a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_4.get(state.dtor)(state.a, state.b); state.a = 0;
                CLOSURE_DTORS.unregister(state);
            }
        }
    };
    real.original = state;
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_4.get(state.dtor)(a, state.b);
                CLOSURE_DTORS.unregister(state);
            } else {
                state.a = a;
            }
        }
    };
    real.original = state;
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
        mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}
/**
 * Return an object containing build info
 * CodeSize: 4KB
 * @returns {any}
 */
export function renderer_build_info() {
    const ret = wasm.renderer_build_info();
    return takeObject(ret);
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
function __wbg_adapter_8(arg0, arg1) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.__wbindgen_export_5(arg0, arg1);
}

function __wbg_adapter_11(arg0, arg1, arg2) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.__wbindgen_export_6(arg0, arg1, addHeapObject(arg2));
}

function __wbg_adapter_14(arg0, arg1, arg2) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.__wbindgen_export_7(arg0, arg1, addHeapObject(arg2));
}

function __wbg_adapter_324(arg0, arg1, arg2, arg3) {
    _assertNum(arg0);
    _assertNum(arg1);
    wasm.__wbindgen_export_8(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

const __wbindgen_enum_CanvasWindingRule = ["nonzero", "evenodd"];

const CreateSessionOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_createsessionoptions_free(ptr >>> 0, 1));

export class CreateSessionOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CreateSessionOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_createsessionoptions_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.createsessionoptions_new();
        this.__wbg_ptr = ret >>> 0;
        CreateSessionOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} format
     */
    set format(format) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len0 = WASM_VECTOR_LEN;
        wasm.createsessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {Uint8Array} artifact_content
     */
    set artifact_content(artifact_content) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_export_1);
        const len0 = WASM_VECTOR_LEN;
        wasm.createsessionoptions_set_artifact_content(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) CreateSessionOptions.prototype[Symbol.dispose] = CreateSessionOptions.prototype.free;

const IncrDomDocClientFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_incrdomdocclient_free(ptr >>> 0, 1));
/**
 * maintains the state of the incremental rendering at client side
 */
export class IncrDomDocClient {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IncrDomDocClient.prototype);
        obj.__wbg_ptr = ptr;
        IncrDomDocClientFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IncrDomDocClientFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_incrdomdocclient_free(ptr, 0);
    }
    /**
     * @param {any} functions
     */
    bind_functions(functions) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        wasm.incrdomdocclient_bind_functions(this.__wbg_ptr, addHeapObject(functions));
    }
    /**
     * Relayout the document in the given window.
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @returns {Promise<boolean>}
     */
    relayout(x, y, w, h) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.incrdomdocclient_relayout(this.__wbg_ptr, x, y, w, h);
        return takeObject(ret);
    }
    /**
     * @param {number} page_num
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} stage
     * @returns {boolean}
     */
    need_repaint(page_num, x, y, w, h, stage) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertNum(page_num);
            _assertNum(stage);
            wasm.incrdomdocclient_need_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} page_num
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} stage
     * @returns {any}
     */
    repaint(page_num, x, y, w, h, stage) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertNum(page_num);
            _assertNum(stage);
            wasm.incrdomdocclient_repaint(retptr, this.__wbg_ptr, page_num, x, y, w, h, stage);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) IncrDomDocClient.prototype[Symbol.dispose] = IncrDomDocClient.prototype.free;

const PageInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pageinfo_free(ptr >>> 0, 1));

export class PageInfo {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PageInfo.prototype);
        obj.__wbg_ptr = ptr;
        PageInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PageInfoFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pageinfo_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get page_off() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_page_off(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get width_pt() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_width_pt(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get height_pt() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pageinfo_height_pt(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PageInfo.prototype[Symbol.dispose] = PageInfo.prototype.free;

const PagesInfoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pagesinfo_free(ptr >>> 0, 1));

export class PagesInfo {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PagesInfo.prototype);
        obj.__wbg_ptr = ptr;
        PagesInfoFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PagesInfoFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pagesinfo_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get page_count() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_page_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} num
     * @returns {PageInfo | undefined}
     */
    page_by_number(num) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(num);
        const ret = wasm.pagesinfo_page_by_number(this.__wbg_ptr, num);
        return ret === 0 ? undefined : PageInfo.__wrap(ret);
    }
    /**
     * @param {number} i
     * @returns {PageInfo}
     */
    page(i) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(i);
        const ret = wasm.pagesinfo_page(this.__wbg_ptr, i);
        return PageInfo.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    width() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_width(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    height() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.pagesinfo_height(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PagesInfo.prototype[Symbol.dispose] = PagesInfo.prototype.free;

const RenderPageImageOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_renderpageimageoptions_free(ptr >>> 0, 1));

export class RenderPageImageOptions {

    static __unwrap(jsValue) {
        if (!(jsValue instanceof RenderPageImageOptions)) {
            return 0;
        }
        return jsValue.__destroy_into_raw();
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderPageImageOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_renderpageimageoptions_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.renderpageimageoptions_new();
        this.__wbg_ptr = ret >>> 0;
        RenderPageImageOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number | undefined}
     */
    get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_pixel_per_pt(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * @param {number | null} [pixel_per_pt]
     */
    set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
            _assertNum(pixel_per_pt);
        }
        wasm.renderpageimageoptions_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 0x100000001 : Math.fround(pixel_per_pt));
    }
    /**
     * @returns {string | undefined}
     */
    get background_color() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.renderpageimageoptions_background_color(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string | null} [background_color]
     */
    set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderpageimageoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number}
     */
    get page_off() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_page_off(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} page_off
     */
    set page_off(page_off) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertNum(page_off);
        wasm.renderpageimageoptions_set_page_off(this.__wbg_ptr, page_off);
    }
    /**
     * @returns {string | undefined}
     */
    get cache_key() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.renderpageimageoptions_cache_key(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string | null} [cache_key]
     */
    set cache_key(cache_key) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(cache_key) ? 0 : passStringToWasm0(cache_key, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.renderpageimageoptions_set_cache_key(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {number | undefined}
     */
    get data_selection() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.renderpageimageoptions_data_selection(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * @param {number | null} [data_selection]
     */
    set data_selection(data_selection) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(data_selection)) {
            _assertNum(data_selection);
        }
        wasm.renderpageimageoptions_set_data_selection(this.__wbg_ptr, isLikeNone(data_selection) ? 0x100000001 : (data_selection) >>> 0);
    }
}
if (Symbol.dispose) RenderPageImageOptions.prototype[Symbol.dispose] = RenderPageImageOptions.prototype.free;

const RenderSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rendersession_free(ptr >>> 0, 1));

export class RenderSession {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RenderSession.prototype);
        obj.__wbg_ptr = ptr;
        RenderSessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rendersession_free(ptr, 0);
    }
    /**
     * @param {number} rect_lo_x
     * @param {number} rect_lo_y
     * @param {number} rect_hi_x
     * @param {number} rect_hi_y
     * @returns {string}
     */
    render_in_window(rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.rendersession_render_in_window(retptr, this.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number | undefined}
     */
    get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pixel_per_pt(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * @param {number | null} [pixel_per_pt]
     */
    set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
            _assertNum(pixel_per_pt);
        }
        wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 0x100000001 : Math.fround(pixel_per_pt));
    }
    /**
     * @returns {string | undefined}
     */
    get background_color() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.rendersession_background_color(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string | null} [background_color]
     */
    set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersession_set_background_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {PagesInfo}
     */
    get pages_info() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pages_info(this.__wbg_ptr);
        return PagesInfo.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    get doc_width() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_doc_width(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get doc_height() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_doc_height(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Uint32Array} path
     * @returns {string | undefined}
     */
    source_span(path) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            const ptr0 = passArray32ToWasm0(path, wasm.__wbindgen_export_1);
            const len0 = WASM_VECTOR_LEN;
            wasm.rendersession_source_span(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            let v2;
            if (r0 !== 0) {
                v2 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) RenderSession.prototype[Symbol.dispose] = RenderSession.prototype.free;

const RenderSessionOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rendersessionoptions_free(ptr >>> 0, 1));

export class RenderSessionOptions {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderSessionOptionsFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rendersessionoptions_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.rendersessionoptions_new();
        this.__wbg_ptr = ret >>> 0;
        RenderSessionOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number | undefined}
     */
    get pixel_per_pt() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.rendersession_pixel_per_pt(this.__wbg_ptr);
        return ret === 0x100000001 ? undefined : ret;
    }
    /**
     * @param {number | null} [pixel_per_pt]
     */
    set pixel_per_pt(pixel_per_pt) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        if (!isLikeNone(pixel_per_pt)) {
            _assertNum(pixel_per_pt);
        }
        wasm.rendersession_set_pixel_per_pt(this.__wbg_ptr, isLikeNone(pixel_per_pt) ? 0x100000001 : Math.fround(pixel_per_pt));
    }
    /**
     * @returns {string | undefined}
     */
    get background_color() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.rendersessionoptions_background_color(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string | null} [background_color]
     */
    set background_color(background_color) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(background_color) ? 0 : passStringToWasm0(background_color, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersessionoptions_set_background_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string | undefined}
     */
    get format() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.rendersessionoptions_format(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            let v1;
            if (r0 !== 0) {
                v1 = getStringFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export_3(r0, r1 * 1, 1);
            }
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string | null} [format]
     */
    set format(format) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        var ptr0 = isLikeNone(format) ? 0 : passStringToWasm0(format, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len0 = WASM_VECTOR_LEN;
        wasm.rendersessionoptions_set_format(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) RenderSessionOptions.prototype[Symbol.dispose] = RenderSessionOptions.prototype.free;

const TypstRendererFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typstrenderer_free(ptr >>> 0, 1));

export class TypstRenderer {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TypstRenderer.prototype);
        obj.__wbg_ptr = ptr;
        TypstRendererFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstRendererFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstrenderer_free(ptr, 0);
    }
    /**
     * @param {RenderSession} session
     * @param {number} rect_lo_x
     * @param {number} rect_lo_y
     * @param {number} rect_hi_x
     * @param {number} rect_hi_y
     * @returns {string}
     */
    render_svg_diff(session, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y) {
        let deferred1_0;
        let deferred1_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertClass(session, RenderSession);
            if (session.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            wasm.typstrenderer_render_svg_diff(retptr, this.__wbg_ptr, session.__wbg_ptr, rect_lo_x, rect_lo_y, rect_hi_x, rect_hi_y);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export_3(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {RenderSession} session
     * @param {number | null} [parts]
     * @returns {string}
     */
    svg_data(session, parts) {
        let deferred2_0;
        let deferred2_1;
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertClass(session, RenderSession);
            if (session.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            if (!isLikeNone(parts)) {
                _assertNum(parts);
            }
            wasm.typstrenderer_svg_data(retptr, this.__wbg_ptr, session.__wbg_ptr, isLikeNone(parts) ? 0x100000001 : (parts) >>> 0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export_3(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {RenderSession} session
     * @returns {Array<any> | undefined}
     */
    get_customs(session) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertClass(session, RenderSession);
        if (session.__wbg_ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        const ret = wasm.typstrenderer_get_customs(this.__wbg_ptr, session.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {RenderSession} session
     * @param {HTMLElement} root
     * @returns {boolean}
     */
    render_svg(session, root) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertClass(session, RenderSession);
            if (session.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            wasm.typstrenderer_render_svg(retptr, this.__wbg_ptr, session.__wbg_ptr, addHeapObject(root));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {any} _w
     * @returns {Promise<TypstWorker>}
     */
    create_worker(_w) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrenderer_create_worker(this.__wbg_ptr, addHeapObject(_w));
        return takeObject(ret);
    }
    /**
     * @returns {WorkerBridge}
     */
    create_worker_bridge() {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const ptr = this.__destroy_into_raw();
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(ptr);
            wasm.typstrenderer_create_worker_bridge(retptr, ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WorkerBridge.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {any} _v
     */
    load_glyph_pack(_v) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            wasm.typstrenderer_load_glyph_pack(retptr, this.__wbg_ptr, addHeapObject(_v));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    constructor() {
        const ret = wasm.typstrenderer_new();
        this.__wbg_ptr = ret >>> 0;
        TypstRendererFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {CreateSessionOptions | null} [options]
     * @returns {RenderSession}
     */
    create_session(options) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            let ptr0 = 0;
            if (!isLikeNone(options)) {
                _assertClass(options, CreateSessionOptions);
                if (options.__wbg_ptr === 0) {
                    throw new Error('Attempt to use a moved value');
                }
                ptr0 = options.__destroy_into_raw();
            }
            wasm.typstrenderer_create_session(retptr, this.__wbg_ptr, ptr0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RenderSession.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {RenderSession} session
     */
    reset(session) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertClass(session, RenderSession);
            if (session.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            wasm.typstrenderer_reset(retptr, this.__wbg_ptr, session.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {RenderSession} session
     * @param {string} action
     * @param {Uint8Array} data
     */
    manipulate_data(session, action, data) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            _assertClass(session, RenderSession);
            if (session.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            const ptr0 = passStringToWasm0(action, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_export_1);
            const len1 = WASM_VECTOR_LEN;
            wasm.typstrenderer_manipulate_data(retptr, this.__wbg_ptr, session.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {Uint8Array} artifact_content
     * @param {string} decoder
     * @returns {RenderSession}
     */
    session_from_artifact(artifact_content, decoder) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            const ptr0 = passArray8ToWasm0(artifact_content, wasm.__wbindgen_export_1);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(decoder, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
            const len1 = WASM_VECTOR_LEN;
            wasm.typstrenderer_session_from_artifact(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return RenderSession.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {RenderSession} ses
     * @param {any} canvas
     * @param {RenderPageImageOptions | null} [options]
     * @returns {Promise<any>}
     */
    render_page_to_canvas(ses, canvas, options) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertClass(ses, RenderSession);
        if (ses.__wbg_ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        let ptr0 = 0;
        if (!isLikeNone(options)) {
            _assertClass(options, RenderPageImageOptions);
            if (options.__wbg_ptr === 0) {
                throw new Error('Attempt to use a moved value');
            }
            ptr0 = options.__destroy_into_raw();
        }
        const ret = wasm.typstrenderer_render_page_to_canvas(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject(canvas), ptr0);
        return takeObject(ret);
    }
    /**
     * @param {RenderSession} ses
     * @param {HTMLElement} elem
     * @returns {Promise<IncrDomDocClient>}
     */
    mount_dom(ses, elem) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        _assertClass(ses, RenderSession);
        if (ses.__wbg_ptr === 0) {
            throw new Error('Attempt to use a moved value');
        }
        const ret = wasm.typstrenderer_mount_dom(this.__wbg_ptr, ses.__wbg_ptr, addHeapObject(elem));
        return takeObject(ret);
    }
}
if (Symbol.dispose) TypstRenderer.prototype[Symbol.dispose] = TypstRenderer.prototype.free;

const TypstRendererBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typstrendererbuilder_free(ptr >>> 0, 1));

export class TypstRendererBuilder {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstRendererBuilderFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstrendererbuilder_free(ptr, 0);
    }
    constructor() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.typstrendererbuilder_new(retptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            this.__wbg_ptr = r0 >>> 0;
            TypstRendererBuilderFinalization.register(this, this.__wbg_ptr, this);
            return this;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Promise<TypstRenderer>}
     */
    build() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        const ptr = this.__destroy_into_raw();
        _assertNum(ptr);
        const ret = wasm.typstrendererbuilder_build(ptr);
        return takeObject(ret);
    }
    /**
     * @param {any} _pack
     * @returns {Promise<void>}
     */
    add_glyph_pack(_pack) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_glyph_pack(this.__wbg_ptr, addHeapObject(_pack));
        return takeObject(ret);
    }
    /**
     * @param {Uint8Array} _font_buffer
     * @returns {Promise<void>}
     */
    add_raw_font(_font_buffer) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_raw_font(this.__wbg_ptr, addHeapObject(_font_buffer));
        return takeObject(ret);
    }
    /**
     * @param {any} _font
     * @param {any} _blob
     * @returns {Promise<void>}
     */
    add_lazy_font(_font, _blob) {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstrendererbuilder_add_lazy_font(this.__wbg_ptr, addHeapObject(_font), addHeapObject(_blob));
        return takeObject(ret);
    }
}
if (Symbol.dispose) TypstRendererBuilder.prototype[Symbol.dispose] = TypstRendererBuilder.prototype.free;

const TypstWorkerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typstworker_free(ptr >>> 0, 1));

export class TypstWorker {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypstWorkerFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typstworker_free(ptr, 0);
    }
    /**
     * @param {string} _action
     * @param {Uint8Array} _data
     * @returns {Promise<any>}
     */
    manipulate_data(_action, _data) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            const ptr0 = passStringToWasm0(_action, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
            const len0 = WASM_VECTOR_LEN;
            wasm.typstworker_manipulate_data(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(_data));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Promise<any>}
     */
    get_pages_info() {
        if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
        _assertNum(this.__wbg_ptr);
        const ret = wasm.typstworker_get_pages_info(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {Uint8Array} _actions
     * @param {HTMLCanvasElement[]} _canvas_list
     * @param {RenderPageImageOptions[]} _data
     * @returns {Promise<any>}
     */
    render_canvas(_actions, _canvas_list, _data) {
        try {
            if (this.__wbg_ptr == 0) throw new Error('Attempt to use a moved value');
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            _assertNum(this.__wbg_ptr);
            const ptr0 = passArray8ToWasm0(_actions, wasm.__wbindgen_export_1);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArrayJsValueToWasm0(_canvas_list, wasm.__wbindgen_export_1);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArrayJsValueToWasm0(_data, wasm.__wbindgen_export_1);
            const len2 = WASM_VECTOR_LEN;
            wasm.typstworker_render_canvas(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) TypstWorker.prototype[Symbol.dispose] = TypstWorker.prototype.free;

const WorkerBridgeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_workerbridge_free(ptr >>> 0, 1));

export class WorkerBridge {

    constructor() {
        throw new Error('cannot invoke `new` directly');
    }

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WorkerBridge.prototype);
        obj.__wbg_ptr = ptr;
        WorkerBridgeFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WorkerBridgeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_workerbridge_free(ptr, 0);
    }
}
if (Symbol.dispose) WorkerBridge.prototype[Symbol.dispose] = WorkerBridge.prototype.free;

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_appendChild_87a6cc0aeb132c06 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).appendChild(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_13410aac570ffff7 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).call(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_641db1bb5db5a579 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_a5400b25a865cfd8 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_call_f1fd202ba222e0ec = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_clearRect_448c93ecc652d129 = function() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).clearRect(arg1, arg2, arg3, arg4);
    }, arguments) };
    imports.wbg.__wbg_clientWidth_8a498b7a82cae772 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).clientWidth;
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_clip_2009d02864d41d14 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).clip(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_clip_be4c2f92cf5ce700 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).clip(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_cloneNode_79d46b18d5619863 = function() { return handleError(function (arg0) {
        const ret = getObject(arg0).cloneNode();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_content_a26016a510c10d06 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).content;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_createElement_4909dfa2011f2abe = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_createImageBitmap_d788b02f79d6bb1c = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createImageBitmap(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_createImageBitmap_f0017ef8064b2e1d = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg0).createImageBitmap(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_createObjectURL_c80225986d2b928b = function() { return handleError(function (arg0, arg1) {
        const ret = URL.createObjectURL(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_document_7d29d139bd619045 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).document;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_drawImage_0fcff80aa0873c4e = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments) };
    imports.wbg.__wbg_drawImage_231d6a0afcfbfc3d = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments) };
    imports.wbg.__wbg_drawImage_285f406fd1771a6d = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments) };
    imports.wbg.__wbg_drawImage_4902f5efaec99256 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments) };
    imports.wbg.__wbg_drawImage_69a008f28f3150a9 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments) };
    imports.wbg.__wbg_drawImage_b8b2c11c9e042476 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3);
    }, arguments) };
    imports.wbg.__wbg_drawImage_e6fefc71cc7e1583 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
        getObject(arg0).drawImage(getObject(arg1), arg2, arg3, arg4, arg5);
    }, arguments) };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function() { return logError(function (arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_export_3(deferred0_0, deferred0_1, 1);
        }
    }, arguments) };
    imports.wbg.__wbg_fillRect_81988a39149f1e60 = function() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments) };
    imports.wbg.__wbg_fillRect_a160edfa11fce49b = function() { return logError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).fillRect(arg1, arg2, arg3, arg4);
    }, arguments) };
    imports.wbg.__wbg_fill_062772ac70d2abe5 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).fill(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_fill_3aba41a9072d4324 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).fill(getObject(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments) };
    imports.wbg.__wbg_fill_8fa14f899c13b2b8 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).fill(getObject(arg1), __wbindgen_enum_CanvasWindingRule[arg2]);
    }, arguments) };
    imports.wbg.__wbg_fill_a12dd0da87e4b294 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).fill(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_firstElementChild_27076cbfeed86254 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).firstElementChild;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_firstElementChild_d38fc714a20581dc = function() { return logError(function (arg0) {
        const ret = getObject(arg0).firstElementChild;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_getAttribute_8bfaf67e99ed2ee3 = function() { return logError(function (arg0, arg1, arg2, arg3) {
        const ret = getObject(arg1).getAttribute(getStringFromWasm0(arg2, arg3));
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_getContext_15e158d04230a6f6 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_getContext_8b08935510bf607c = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_get_458e874b43b18b25 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(getObject(arg0), getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_globalCompositeOperation_a9343749f60fc3c3 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg1).globalCompositeOperation;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_globalCompositeOperation_fca573f41169da73 = function() { return handleError(function (arg0, arg1) {
        const ret = getObject(arg1).globalCompositeOperation;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_height_dcede88ab14fa083 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).height;
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_incrdomdocclient_new = function() { return logError(function (arg0) {
        const ret = IncrDomDocClient.__wrap(arg0);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_instanceof_CanvasRenderingContext2d_8c616198ec03b12f = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof CanvasRenderingContext2D;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_Element_162e4334c7d6f450 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Element;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_HtmlCanvasElement_299c60950dbb3428 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof HTMLCanvasElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_HtmlDivElement_d375b5c79180c917 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof HTMLDivElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_HtmlElement_d60c51c41eb8699a = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof HTMLElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_HtmlTemplateElement_68e5e8157bcbd653 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof HTMLTemplateElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_ImageBitmap_e82e6a629ec3d3e8 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof ImageBitmap;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_OffscreenCanvasRenderingContext2d_6234c9d9a0c6958a = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof OffscreenCanvasRenderingContext2D;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_OffscreenCanvas_da9915e5258f24fb = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof OffscreenCanvas;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_Promise_3ec9e849bf41bdb6 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Promise;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_SvgGraphicsElement_50bb1acb75ae606a = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof SVGGraphicsElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_SvgsvgElement_b0e42b8ec77c0d1e = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof SVGSVGElement;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_Window_12d20d558ef92592 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Window;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_WorkerGlobalScope_85d487cc157fd065 = function() { return logError(function (arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof WorkerGlobalScope;
        } catch (_) {
            result = false;
        }
        const ret = result;
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_lastElementChild_7b35e6537e048254 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).lastElementChild;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_length_6bb7e81f9d7713e4 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).length;
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_log_6c7b5f4f00b8ce3f = function() { return logError(function (arg0) {
        console.log(getObject(arg0));
    }, arguments) };
    imports.wbg.__wbg_log_7917fde260a8fd39 = function() { return logError(function (arg0, arg1) {
        console.log(getObject(arg0), getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_measureText_ce63d5548118a11b = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).measureText(getStringFromWasm0(arg1, arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_19c25a3f2fa63a02 = function() { return logError(function () {
        const ret = new Object();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_1b0539a012a993e2 = function() { return handleError(function () {
        const ret = new Image();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_1f3a344cf3123716 = function() { return logError(function () {
        const ret = new Array();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_2e3c58a15f39f5f9 = function() { return logError(function (arg0, arg1) {
        try {
            var state0 = {a: arg0, b: arg1};
            var cb0 = (arg0, arg1) => {
                const a = state0.a;
                state0.a = 0;
                try {
                    return __wbg_adapter_324(a, state0.b, arg0, arg1);
                } finally {
                    state0.a = a;
                }
            };
            const ret = new Promise(cb0);
            return addHeapObject(ret);
        } finally {
            state0.a = state0.b = 0;
        }
    }, arguments) };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() { return logError(function () {
        const ret = new Error();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_da9dc54c5db29dfa = function() { return logError(function (arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_new_dd6c7b0f98f05245 = function() { return handleError(function (arg0, arg1) {
        const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_newfromslice_074c56947bd43469 = function() { return logError(function (arg0, arg1) {
        const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_newnoargs_254190557c45b4ec = function() { return logError(function (arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_newwithlength_a167dcc7aaa3ba77 = function() { return logError(function (arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_newwithpathstring_0dbb2ef6187c1fee = function() { return handleError(function (arg0, arg1) {
        const ret = new Path2D(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_newwithu8arraysequenceandoptions_2df1a97d9f42efa4 = function() { return handleError(function (arg0, arg1) {
        const ret = new Blob(getObject(arg0), getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_nextElementSibling_4b565fe9b7cdb849 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).nextElementSibling;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_push_330b2eb93e4e1212 = function() { return logError(function (arg0, arg1) {
        const ret = getObject(arg0).push(getObject(arg1));
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_putImageData_0324b5d1f2cb58d9 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
    }, arguments) };
    imports.wbg.__wbg_putImageData_3413ec0b4386cceb = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
    }, arguments) };
    imports.wbg.__wbg_queueMicrotask_25d0739ac89e8c88 = function() { return logError(function (arg0) {
        queueMicrotask(getObject(arg0));
    }, arguments) };
    imports.wbg.__wbg_queueMicrotask_4488407636f5bf24 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).queueMicrotask;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_removeProperty_8912427f4d0f6361 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = getObject(arg1).removeProperty(getStringFromWasm0(arg2, arg3));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_remove_fec7bce376b31b32 = function() { return logError(function (arg0) {
        getObject(arg0).remove();
    }, arguments) };
    imports.wbg.__wbg_renderpageimageoptions_unwrap = function() { return logError(function (arg0) {
        const ret = RenderPageImageOptions.__unwrap(takeObject(arg0));
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_replaceWith_b871dd8b39227476 = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).replaceWith(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_resolve_4055c623acdd6a1b = function() { return logError(function (arg0) {
        const ret = Promise.resolve(getObject(arg0));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_restore_1367a274a3a9c52f = function() { return logError(function (arg0) {
        getObject(arg0).restore();
    }, arguments) };
    imports.wbg.__wbg_restore_45dead792d0756f6 = function() { return logError(function (arg0) {
        getObject(arg0).restore();
    }, arguments) };
    imports.wbg.__wbg_revokeObjectURL_651b859c81bf1af0 = function() { return handleError(function (arg0, arg1) {
        URL.revokeObjectURL(getStringFromWasm0(arg0, arg1));
    }, arguments) };
    imports.wbg.__wbg_save_9c2af6c4f73acbb8 = function() { return logError(function (arg0) {
        getObject(arg0).save();
    }, arguments) };
    imports.wbg.__wbg_save_e5fc517a51a9e73d = function() { return logError(function (arg0) {
        getObject(arg0).save();
    }, arguments) };
    imports.wbg.__wbg_setAttribute_d1baf9023ad5696f = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments) };
    imports.wbg.__wbg_setLineDash_5c96338d7fd195f9 = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).setLineDash(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_setLineDash_7792494c18c240bc = function() { return handleError(function (arg0, arg1) {
        getObject(arg0).setLineDash(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_setProperty_a4431938dd3e6945 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
        getObject(arg0).setProperty(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    }, arguments) };
    imports.wbg.__wbg_setTransform_64b36b5b2fe7eb81 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        getObject(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments) };
    imports.wbg.__wbg_setTransform_e8b3bc7c8210c0e6 = function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        getObject(arg0).setTransform(arg1, arg2, arg3, arg4, arg5, arg6);
    }, arguments) };
    imports.wbg.__wbg_set_1353b2a5e96bc48c = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).set(getArrayU8FromWasm0(arg1, arg2));
    }, arguments) };
    imports.wbg.__wbg_set_453345bcda80b89a = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
        _assertBoolean(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_set_90f6c0f7bd8c0415 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    }, arguments) };
    imports.wbg.__wbg_setfillStyle_a9ad5b25cf62a5bc = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).fillStyle = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setfillStyle_dae40abc0110b0d0 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).fillStyle = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setfont_73ce8e14831e02ab = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).font = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setglobalCompositeOperation_e5ac8e2ee1998039 = function() { return handleError(function (arg0, arg1, arg2) {
        getObject(arg0).globalCompositeOperation = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setglobalCompositeOperation_e5ec3a5c4c8e9185 = function() { return handleError(function (arg0, arg1, arg2) {
        getObject(arg0).globalCompositeOperation = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setheight_4fce583024b2d088 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).height = arg1 >>> 0;
    }, arguments) };
    imports.wbg.__wbg_setinnerHTML_34e240d6b8e8260c = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).innerHTML = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setlineCap_8032972ab3563404 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).lineCap = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setlineCap_c4746ffc7c654931 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).lineCap = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setlineDashOffset_8e4721199e50ad71 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).lineDashOffset = arg1;
    }, arguments) };
    imports.wbg.__wbg_setlineDashOffset_f6bdd1bf33764013 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).lineDashOffset = arg1;
    }, arguments) };
    imports.wbg.__wbg_setlineJoin_2ff9aa15911a2360 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).lineJoin = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setlineJoin_30c59321fbc0bd3d = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).lineJoin = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setlineWidth_069d571345379833 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).lineWidth = arg1;
    }, arguments) };
    imports.wbg.__wbg_setlineWidth_c640999c86cc71b6 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).lineWidth = arg1;
    }, arguments) };
    imports.wbg.__wbg_setmiterLimit_4b89ef6d3f97e1b0 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).miterLimit = arg1;
    }, arguments) };
    imports.wbg.__wbg_setmiterLimit_b4aa08d1762d6104 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).miterLimit = arg1;
    }, arguments) };
    imports.wbg.__wbg_setonerror_6eedc824b763863d = function() { return logError(function (arg0, arg1) {
        getObject(arg0).onerror = getObject(arg1);
    }, arguments) };
    imports.wbg.__wbg_setonload_5f59eacd9a040d42 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).onload = getObject(arg1);
    }, arguments) };
    imports.wbg.__wbg_setsrc_953e439f2c70484a = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).src = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setstrokeStyle_3c450999cfcdcd2f = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).strokeStyle = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setstrokeStyle_e602cffe46d6113f = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).strokeStyle = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_settype_298968e371b58a33 = function() { return logError(function (arg0, arg1, arg2) {
        getObject(arg0).type = getStringFromWasm0(arg1, arg2);
    }, arguments) };
    imports.wbg.__wbg_setwidth_40a6ed203b92839d = function() { return logError(function (arg0, arg1) {
        getObject(arg0).width = arg1 >>> 0;
    }, arguments) };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function() { return logError(function (arg0, arg1) {
        const ret = getObject(arg1).stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    }, arguments) };
    imports.wbg.__wbg_static_accessor_GLOBAL_8921f820c2ce3f12 = function() { return logError(function () {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_f0a4409105898184 = function() { return logError(function () {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_static_accessor_SELF_995b214ae681ff99 = function() { return logError(function () {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_static_accessor_WINDOW_cde3890479c675ea = function() { return logError(function () {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_stringify_b98c93d0a190446a = function() { return handleError(function (arg0) {
        const ret = JSON.stringify(getObject(arg0));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_stroke_1682cb55b83fabcd = function() { return logError(function (arg0, arg1) {
        getObject(arg0).stroke(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_stroke_84ffe7bcfdec57c3 = function() { return logError(function (arg0, arg1) {
        getObject(arg0).stroke(getObject(arg1));
    }, arguments) };
    imports.wbg.__wbg_style_32a3c8393b46a115 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).style;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_then_b33a773d723afa3e = function() { return logError(function (arg0, arg1, arg2) {
        const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_then_e22500defe16819f = function() { return logError(function (arg0, arg1) {
        const ret = getObject(arg0).then(getObject(arg1));
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_transferToImageBitmap_ebacbcba8c548fc6 = function() { return handleError(function (arg0) {
        const ret = getObject(arg0).transferToImageBitmap();
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_typstrenderer_new = function() { return logError(function (arg0) {
        const ret = TypstRenderer.__wrap(arg0);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbg_warn_e2ada06313f92f09 = function() { return logError(function (arg0) {
        console.warn(getObject(arg0));
    }, arguments) };
    imports.wbg.__wbg_wbindgencbdrop_eb10308566512b88 = function(arg0) {
        const obj = getObject(arg0).original;
        if (obj.cnt-- == 1) {
            obj.a = 0;
            return true;
        }
        const ret = false;
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_wbindgendebugstring_99ef257a3ddda34d = function(arg0, arg1) {
        const ret = debugString(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_wbindgenisfunction_8cee7dce3725ae74 = function(arg0) {
        const ret = typeof(getObject(arg0)) === 'function';
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_wbindgenisundefined_c4b71d073b92f3c5 = function(arg0) {
        const ret = getObject(arg0) === undefined;
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_wbindgenjsvaleq_e6f2ad59ccae1b58 = function(arg0, arg1) {
        const ret = getObject(arg0) === getObject(arg1);
        _assertBoolean(ret);
        return ret;
    };
    imports.wbg.__wbg_wbindgenstringget_0f16a6ddddef376f = function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_1, wasm.__wbindgen_export_2);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_wbindgenthrow_451ec1a8469d7eb6 = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_width_5671cc92dc930a91 = function() { return logError(function (arg0) {
        const ret = getObject(arg0).width;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_width_cb2a94a03e71098c = function() { return logError(function (arg0) {
        const ret = getObject(arg0).width;
        _assertNum(ret);
        return ret;
    }, arguments) };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function() { return logError(function (arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_cast_36bec3cd00b60f09 = function() { return logError(function (arg0, arg1) {
        // Cast intrinsic for `Closure(Closure { dtor_idx: 450, function: Function { arguments: [Externref], shim_idx: 453, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
        const ret = makeClosure(arg0, arg1, 450, __wbg_adapter_11);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_cast_4d3bc2b370a03c03 = function() { return logError(function (arg0, arg1) {
        // Cast intrinsic for `Closure(Closure { dtor_idx: 469, function: Function { arguments: [Externref], shim_idx: 470, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
        const ret = makeMutClosure(arg0, arg1, 469, __wbg_adapter_14);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_cast_cde47249d0b2d427 = function() { return logError(function (arg0, arg1) {
        // Cast intrinsic for `Closure(Closure { dtor_idx: 450, function: Function { arguments: [], shim_idx: 451, ret: Unit, inner_ret: Some(Unit) }, mutable: false }) -> Externref`.
        const ret = makeClosure(arg0, arg1, 450, __wbg_adapter_8);
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function() { return logError(function (arg0) {
        // Cast intrinsic for `F64 -> Externref`.
        const ret = arg0;
        return addHeapObject(ret);
    }, arguments) };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;



    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = importWasmModule('typst_ts_renderer_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;


let importWasmModule = async function(wasm_name, url) {
    throw new Error('Cannot import wasm module without importer: ' + wasm_name + ' ' + url);
};
function setImportWasmModule(importer) {
  importWasmModule = importer;
}
export {
  setImportWasmModule
}
