
import { setImportWasmModule } from './typst_ts_renderer.mjs';
import _default from './typst_ts_renderer.mjs';
export * from './typst_ts_renderer.mjs';
export default _default;

let nodeJsImportWasmModule = async function(wasm_name, url) {
  const escapeImport = new Function('m', 'return import(m)');
  const { readFileSync } = await escapeImport('fs');

  const wasmPath = new URL(wasm_name, url);
  return await readFileSync(wasmPath).buffer;
};

// nodejs
const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

if (isNode) {
  setImportWasmModule(nodeJsImportWasmModule);
}

