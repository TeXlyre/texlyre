// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { openDB } from "idb";
import { authService } from "./services/AuthService";

async function clearExistingServiceWorkers() {
	if ("serviceWorker" in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		console.log("Found existing service workers:", registrations.length);
		for (const registration of registrations) {
			console.log("Unregistering existing SW:", registration.scope);
			await registration.unregister();
		}
	}
}

// Register service worker for offline support (only in HTTP mode)
const isHttpsMode =
	window.location.protocol === "https:" &&
	window.location.hostname !== "localhost";

const enableServiceWorkerForHttps = true; // Set to false to disable SW in HTTPS mode

if ("serviceWorker" in navigator && (!isHttpsMode || enableServiceWorkerForHttps)) {
	window.addEventListener("load", async () => {
		await clearExistingServiceWorkers();

		const swPath = "/texlyre/sw.js";
		const scope = "/texlyre/";

		console.log("=== Service Worker Registration ===");
		console.log("SW Path:", swPath);
		console.log("Scope:", scope);
		console.log("Full SW URL:", window.location.origin + swPath);

		try {
			console.log("Attempting service worker registration...");
			const registration = await navigator.serviceWorker.register(swPath, {
				scope,
			});
			console.log("SW registered successfully:", registration.scope);

			if (registration.active) {
				registration.active.postMessage({
					type: "CACHE_URLS",
					urls: ["/texlyre/src/assets/images/TeXlyre_notext.png"],
				});
			}
		} catch (error) {
			console.error("SW registration failed:", error);
		}
	});
} else {
	window.addEventListener("load", async () => {
		await clearExistingServiceWorkers();
		console.log(
			"Service worker registration skipped. HTTPS mode:",
			isHttpsMode,
			"Enable SW for HTTPS:",
			enableServiceWorkerForHttps,
		);
	});
}

async function initDatabases() {
	try {
		await openDB("texlyre-auth", 1, {
			upgrade(db) {
				if (!db.objectStoreNames.contains("users")) {
					const userStore = db.createObjectStore("users", { keyPath: "id" });
					userStore.createIndex("username", "username", { unique: true });
					userStore.createIndex("email", "email", { unique: true });
				}

				if (!db.objectStoreNames.contains("projects")) {
					const projectStore = db.createObjectStore("projects", {
						keyPath: "id",
					});
					projectStore.createIndex("ownerId", "ownerId", { unique: false });
					projectStore.createIndex("tags", "tags", {
						unique: false,
						multiEntry: true,
					});
				}
			},
		});
	} catch (error) {
		console.error("Failed to initialize databases:", error);
	}
}

async function startApp() {
	try {
		await Promise.all([initDatabases(), authService.initialize()]);
	} catch (error) {
		console.error("Error during initialization:", error);
	}

	ReactDOM.createRoot(document.getElementById("root")!).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

startApp();
