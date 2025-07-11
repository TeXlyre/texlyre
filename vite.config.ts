import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import wasm from "vite-plugin-wasm";

const useHttps = process.env.VITE_USE_HTTPS === "true";

// @ts-ignore
export default defineConfig({
	base: "/texlyre/",

	define: {
		"process.env.npm_package_version": JSON.stringify(
			process.env.npm_package_version || "1.0.0",
		),
	},

	build: {
		target: "esnext",
		commonjsOptions: {
			esmExternals: true,
		},
		rollupOptions: {
			output: {
				manualChunks: {
					vendor: ["react", "react-dom"],
					pdfjs: ["pdfjs-dist"],
					codemirror: ["@codemirror/state", "@codemirror/view"],
					yjs: ["yjs", "y-indexeddb", "y-webrtc"],
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
					dest: "cmaps/",
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
			extras: path.resolve(__dirname, "./extras"),
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
	},
});
