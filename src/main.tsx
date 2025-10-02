/*
 * TeXlyre - Collaborative LaTeX and Typst Editor
 * Copyright (C) 2025 Fares Abawi
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import { openDB } from "idb";
import { authService } from "./services/AuthService";

const BASE_PATH = __BASE_PATH__

// Guest account cleanup - runs every hour when app is active
const setupGuestCleanup = () => {
	let cleanupInterval: NodeJS.Timeout;

	const runCleanup = async () => {
		try {
			const { authService } = await import("./services/AuthService");
			await authService.cleanupExpiredGuests();
		} catch (error) {
			console.warn("Guest cleanup failed:", error);
		}
	};

	const startCleanup = () => {
		cleanupInterval = setInterval(runCleanup, 60 * 60 * 1000); // Every hour
	};

	const stopCleanup = () => {
		if (cleanupInterval) {
			clearInterval(cleanupInterval);
		}
	};
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			runCleanup();
		}
	});
	startCleanup();
	runCleanup();
	return stopCleanup;
};

async function clearExistingServiceWorkers() {
	if ("serviceWorker" in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		console.log("[ServiceWroker] Found existing service workers:", registrations.length);
		for (const registration of registrations) {
			console.log("[ServiceWroker] Unregistering existing service worker:", registration.scope);
			await registration.unregister();
		}
	}
}

// Register service worker for offline support (only in HTTP mode)
const isHttpsMode =
	window.location.protocol === "https:" &&
	window.location.hostname !== "localhost";

const enableServiceWorkerForHttps = true; // Set to false to disable SW in HTTPS mode
const enableServiceWorkerForHttp = false; // Set to false to disable SW in HTTP mode
const clearServiceWorkerOnLoad = false; // Set to true to clear existing SWs on load

if (
	"serviceWorker" in navigator &&
	((isHttpsMode && enableServiceWorkerForHttps) || (!isHttpsMode && enableServiceWorkerForHttp))
) {
	window.addEventListener("load", async () => {
		if (clearServiceWorkerOnLoad) {
			console.log("[ServiceWroker] Clearing existing service workers...");
			await clearExistingServiceWorkers();
		} else {
			console.log("[ServiceWroker] Skipping clearing existing service workers");
		}

		const swPath = `${BASE_PATH}/sw.js`;
		const scope = `${BASE_PATH}/`;

		console.log("[ServiceWroker] ]Service Worker Registration ===");
		console.log("Service Worker Path:", swPath);
		console.log("Scope:", scope);
		console.log("Full Service Worker URL:", window.location.origin + swPath);

		try {
			console.log("[ServiceWroker] Attempting service worker registration...");
			const registration = await navigator.serviceWorker.register(swPath, {
				scope,
			});
			console.log("[ServiceWroker] Service worker registered successfully:", registration.scope);

			if (registration.active) {
				registration.active.postMessage({
					type: "CACHE_URLS",
					urls: [`${BASE_PATH}/src/assets/images/TeXlyre_notext.png`],
				});
			}
		} catch (error) {
			console.error("Service worker registration failed:", error);
		}
	});
} else {
	window.addEventListener("load", async () => {
		await clearExistingServiceWorkers();
		console.log(
			"[ServiceWroker] Service worker registration skipped. HTTPS mode:",
			isHttpsMode,
			"Enable Service worker for HTTPS:",
			enableServiceWorkerForHttps,
			"Enable Service worker for HTTP:",
			enableServiceWorkerForHttp,
		);
	});
}

async function initUserData(): Promise<void> {
	const settingsKey = 'texlyre-settings';
	const propertiesKey = 'texlyre-properties';

	const existingSettings = localStorage.getItem(settingsKey);
	const existingProperties = localStorage.getItem(propertiesKey);

	if (!existingSettings || !existingProperties) {
		try {
			const response = await fetch(`${BASE_PATH}/userdata.json`);
			const userData = await response.json();

			if (!existingSettings && userData.settings) {
				const mergedSettings = existingSettings
					? { ...JSON.parse(existingSettings), ...userData.settings }
					: userData.settings;
				localStorage.setItem(settingsKey, JSON.stringify(mergedSettings));
			}

			if (!existingProperties && userData.properties) {
				const mergedProperties = existingProperties
					? { ...JSON.parse(existingProperties), ...userData.properties }
					: userData.properties;
				localStorage.setItem(propertiesKey, JSON.stringify(mergedProperties));
			}
		} catch (error) {
			console.warn('Failed to load default user data:', error);
		}
	}
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
		await Promise.all([initDatabases(), authService.initialize(), initUserData()]);
	} catch (error) {
		console.error("Error during initialization:", error);
	}

	ReactDOM.createRoot(document.getElementById("root")!).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

setupGuestCleanup();
startApp();
