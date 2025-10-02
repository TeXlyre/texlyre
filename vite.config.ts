import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import wasm from "vite-plugin-wasm";

const useHttps = process.env.VITE_USE_HTTPS === "true";

const basePath = "/texlyre/";

// @ts-ignore
export default defineConfig({
	base: basePath,

	define: {
		"process.env.npm_package_version": JSON.stringify(
			process.env.npm_package_version || "1.0.0",
		),
		__BASE_PATH__: JSON.stringify(basePath.slice(0, -1)),
	},

	build: {
		target: "esnext",
		commonjsOptions: {
			esmExternals: true,
		},
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html')
			},
			output: {
				manualChunks: {
					vendor: ["react", "react-dom"],
					pdfjs: ["pdfjs-dist"],
					codemirror: ["@codemirror/state", "@codemirror/view"],
					yjs: ["yjs", "y-indexeddb", "y-webrtc"],
					typst: ["@myriaddreamin/typst.ts"],
				},
			},
		},
	},

	plugins: [
		wasm(),
		react(),
		...(useHttps ? [basicSsl()] : []),
		viteStaticCopy({
			targets: [
				{
					src: "node_modules/pdfjs-dist/cmaps/*",
					dest: "assets/cmaps/",
				},
				{
					src: "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/*",
					dest: "core/typst-ts-web-compiler/pkg/",
				},
				{
					src: "node_modules/@myriaddreamin/typst-ts-renderer/pkg/*",
					dest: "core/typst-ts-renderer/pkg/",
				},
				{
					src: "userdata.json",
					dest: "",
				},
			],
		}),
	],

	server: {
		host: true,
		https: useHttps,
		hmr: {
			port: 5173,
			clientPort: 5173,
		},
	},

	worker: {
		format: "es",
		plugins: () => [wasm()],
	},

	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@codemirror/state": path.resolve("./node_modules/@codemirror/state"),
			"@codemirror/view": path.resolve("./node_modules/@codemirror/view"),
			yjs: path.resolve("./node_modules/yjs"),
			"y-codemirror.next": path.resolve("./node_modules/y-codemirror.next"),
		},
		dedupe: [
			"@codemirror/state",
			"@codemirror/view",
			"yjs",
			"y-codemirror.next",
		],
	},
	optimizeDeps: {
		include: [
			"@codemirror/state",
			"@codemirror/view",
			"@codemirror/lang-javascript",
			"codemirror",
			"yjs",
			"y-codemirror.next",
			"pdfjs-dist",
		],
		exclude: [
			"@myriaddreamin/typst.ts",
		],
	},
});