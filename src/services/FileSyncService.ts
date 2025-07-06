import { FilePizzaDownloader, FilePizzaUploader } from "filepizza-client";
// src/services/FileSyncService.ts
import { nanoid } from "nanoid";

import type {
	FileSyncHoldSignal,
	FileSyncInfo,
	FileSyncNotification,
	FileSyncRequest,
	FileSyncVerification,
} from "../types/fileSync";
import type { FileNode } from "../types/files";
import { isBinaryFile, isTemporaryFile } from "../utils/fileUtils.ts";
import { fileStorageService } from "./FileStorageService";
import { notificationService } from "./NotificationService";

export type ConflictResolution = "prefer-latest" | "prefer-local" | "notify";

class FileSyncService {
	private activeUploaders = new Map<string, FilePizzaUploader>();
	private activeDownloaders = new Map<string, FilePizzaDownloader>();
	private listeners: Array<(notification: FileSyncNotification) => void> = [];

	private getFilePizzaServerUrl(): string {
		return (
			localStorage.getItem("texlyre-file-sync-server") ||
			"https://filepizza.emaily.re"
		);
	}

	private getConflictResolution(): ConflictResolution {
		return (
			(localStorage.getItem(
				"texlyre-file-sync-conflict-resolution",
			) as ConflictResolution) || "prefer-latest"
		);
	}

	showLoadingNotification(message: string, operationId?: string): void {
		notificationService.showLoading(message, operationId);
	}

	showSuccessNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			data?: Record<string, any>;
		} = {},
	): void {
		notificationService.showSuccess(message, options);
	}

	showErrorNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			data?: Record<string, any>;
		} = {},
	): void {
		notificationService.showError(message, options);
	}

	showInfoNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			data?: Record<string, any>;
		} = {},
	): void {
		notificationService.showInfo(message, options);
	}

	showSyncNotification(
		message: string,
		options: {
			operationId?: string;
			duration?: number;
			data?: Record<string, any>;
		} = {},
	): void {
		notificationService.showSync(message, options);
	}

	trackSyncFailure(peerId: string): boolean {
		const key = `sync-failures-${peerId}`;
		const failures = Number.parseInt(localStorage.getItem(key) || "0") + 1;
		localStorage.setItem(key, failures.toString());

		if (failures >= 3) {
			localStorage.setItem(`sync-disabled-${peerId}`, "true");
			return true;
		}
		return false;
	}

	clearSyncFailures(peerId: string): void {
		localStorage.removeItem(`sync-failures-${peerId}`);
		localStorage.removeItem(`sync-disabled-${peerId}`);
	}

	isSyncDisabledForPeer(peerId: string): boolean {
		return localStorage.getItem(`sync-disabled-${peerId}`) === "true";
	}

	async calculateFileChecksum(content: ArrayBuffer): Promise<string> {
		const hashBuffer = await crypto.subtle.digest("SHA-256", content);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	async getLocalFileSyncInfo(
		userId: string,
		username: string,
	): Promise<FileSyncInfo[]> {
		try {
			const allFiles = await fileStorageService.getAllFiles(true, true);
			const relevantFiles = allFiles.filter(
				(file) => file.type === "file" && !isTemporaryFile(file.path),
			);

			const syncInfo: FileSyncInfo[] = [];

			for (const file of relevantFiles) {
				const content = file.isDeleted
					? new ArrayBuffer(0)
					: file.content
						? file.content instanceof ArrayBuffer
							? file.content
							: new TextEncoder().encode(file.content).buffer
						: new ArrayBuffer(0);

				const checksum = await this.calculateFileChecksum(content);

				syncInfo.push({
					fileId: file.id,
					fileName: file.name,
					filePath: file.path,
					lastModified: file.lastModified,
					size: file.isDeleted ? 0 : file.size || content.byteLength,
					checksum,
					userId,
					username,
					documentId: file.documentId,
					deleted: file.isDeleted,
				});
			}

			return syncInfo;
		} catch (error) {
			console.error("Error getting local file sync info:", error);
			return [];
		}
	}

	shouldIgnoreFileForSync(
		localFile: FileSyncInfo,
		remoteFile: FileSyncInfo,
	): boolean {
		const localIsLinked = !!localFile.documentId;
		const remoteIsLinked = !!remoteFile.documentId;

		return (
			localIsLinked &&
			remoteIsLinked &&
			localFile.checksum !== remoteFile.checksum
		);
	}

	shouldTriggerSync(
		localFiles: FileSyncInfo[],
		remoteFiles: FileSyncInfo[],
	): boolean {
		const localFileMap = new Map(localFiles.map((f) => [f.filePath, f]));

		for (const remoteFile of remoteFiles) {
			const localFile = localFileMap.get(remoteFile.filePath);

			if (!localFile) {
				if (!remoteFile.deleted) return true;
			} else {
				if (
					remoteFile.deleted &&
					!localFile.deleted &&
					remoteFile.lastModified > localFile.lastModified
				) {
					return true;
				} else if (!remoteFile.deleted && !localFile.deleted) {
					if (
						localFile.checksum !== remoteFile.checksum &&
						!this.shouldIgnoreFileForSync(localFile, remoteFile)
					) {
						return true;
					}
				} else if (
					!remoteFile.deleted &&
					localFile.deleted &&
					remoteFile.lastModified > localFile.lastModified
				) {
					return true;
				}
			}
		}

		return false;
	}

	determineFilesToRequest(
		localFiles: FileSyncInfo[],
		remoteFiles: FileSyncInfo[],
		conflictResolution: ConflictResolution,
	): {
		remoteFileId: string;
		filePath: string;
		lastModified: number;
		documentId?: string;
		isDeleted?: boolean;
	}[] {
		const localFileMap = new Map(localFiles.map((f) => [f.filePath, f]));
		const filesToRequest: {
			remoteFileId: string;
			filePath: string;
			lastModified: number;
			documentId?: string;
			isDeleted?: boolean;
		}[] = [];

		for (const remoteFile of remoteFiles) {
			const localFile = localFileMap.get(remoteFile.filePath);

			if (!localFile) {
				if (!remoteFile.deleted) {
					filesToRequest.push({
						remoteFileId: remoteFile.fileId,
						filePath: remoteFile.filePath,
						lastModified: remoteFile.lastModified,
						documentId: remoteFile.documentId,
						isDeleted: false,
					});
				}
			} else {
				if (
					remoteFile.deleted &&
					!localFile.deleted &&
					remoteFile.lastModified > localFile.lastModified
				) {
					filesToRequest.push({
						remoteFileId: remoteFile.fileId,
						filePath: remoteFile.filePath,
						lastModified: remoteFile.lastModified,
						documentId: remoteFile.documentId,
						isDeleted: true,
					});
				} else if (!remoteFile.deleted && !localFile.deleted) {
					if (localFile.checksum !== remoteFile.checksum) {
						const localIsLinked = !!localFile.documentId;
						const remoteIsLinked = !!remoteFile.documentId;

						if (localIsLinked && remoteIsLinked) {
							continue;
						}

						if (conflictResolution === "prefer-latest") {
							const shouldRequest =
								((!localIsLinked && !remoteIsLinked) ||
									(localIsLinked &&
										!remoteIsLinked &&
										remoteFile.lastModified > localFile.lastModified) ||
									(!localIsLinked &&
										remoteIsLinked &&
										remoteFile.lastModified > localFile.lastModified)) &&
								remoteFile.lastModified > localFile.lastModified;

							if (shouldRequest) {
								filesToRequest.push({
									remoteFileId: remoteFile.fileId,
									filePath: remoteFile.filePath,
									lastModified: remoteFile.lastModified,
									documentId: remoteFile.documentId,
									isDeleted: false,
								});
							}
						}
					}
				} else if (
					!remoteFile.deleted &&
					localFile.deleted &&
					remoteFile.lastModified > localFile.lastModified
				) {
					filesToRequest.push({
						remoteFileId: remoteFile.fileId,
						filePath: remoteFile.filePath,
						lastModified: remoteFile.lastModified,
						documentId: remoteFile.documentId,
						isDeleted: false,
					});
				}
			}
		}

		return filesToRequest;
	}

	async uploadFiles(
		fileIds: string[],
		requestId: string,
		filePizzaServerUrl?: string,
	): Promise<{ link: string }> {
		try {
			console.log(
				`[FileSyncService] Uploading ${fileIds.length} files for request ${requestId}`,
			);

			const uploader = new FilePizzaUploader({
				filePizzaServerUrl: filePizzaServerUrl || this.getFilePizzaServerUrl(),
				sharedSlug: `file-sync-${requestId}`,
			});

			await uploader.initialize();

			const filesToUpload: File[] = [];
			const filesFromDb = await fileStorageService.getFilesByIds(fileIds);

			for (const file of filesFromDb) {
				if (!file) {
					console.warn(`File data not found for one of the IDs`);
					continue;
				}

				const fileContent = file.isDeleted
					? new ArrayBuffer(0)
					: file.content instanceof ArrayBuffer
						? file.content
						: file.content
							? new TextEncoder().encode(file.content).buffer
							: new ArrayBuffer(0);

				const fileObj = new File([fileContent], file.path.substring(1), {
					type: file.mimeType || "application/octet-stream",
				});

				Object.defineProperty(fileObj, "metadata", {
					value: {
						isDeleted: file.isDeleted,
						documentId: file.documentId,
					},
					enumerable: false,
					writable: false,
				});

				filesToUpload.push(fileObj);
			}

			if (filesToUpload.length === 0) {
				throw new Error("No valid files to upload");
			}

			uploader.setFiles(filesToUpload);
			const shareableLinks = uploader.getShareableLinks();

			if (!shareableLinks) {
				throw new Error("Failed to generate shareable links");
			}

			console.log(
				`[FileSyncService] Generated shareable link: ${shareableLinks.short}`,
			);

			const uploadId = nanoid();
			this.activeUploaders.set(uploadId, uploader);

			return { link: shareableLinks.short };
		} catch (error) {
			console.error("Error uploading files:", error);
			throw error;
		}
	}

	async downloadFiles(
		filePizzaLink: string,
		expectedFiles: string[],
		remoteTimestamps: Map<string, number>,
		remoteDocumentIds: Map<string, string>,
		remoteDeletionStates: Map<string, boolean>,
		filePizzaServerUrl?: string,
	): Promise<void> {
		console.log(`[FileSyncService] Downloading files from: ${filePizzaLink}`);
		console.log(`[FileSyncService] Expecting files:`, expectedFiles);

		await this.downloadFromLink(
			filePizzaLink,
			expectedFiles,
			remoteTimestamps,
			remoteDocumentIds,
			remoteDeletionStates,
			filePizzaServerUrl,
		);
	}

	private async prepareFileNodeForStorage(
		downloadedFile: any,
		expectedPath: string,
		remoteTimestamp: number,
		remoteDocumentId?: string,
		isDeleted?: boolean,
	): Promise<FileNode | null> {
		try {
			await fileStorageService.createDirectoryPath(expectedPath);

			const fileContent = downloadedFile.content || downloadedFile.data;
			let processedContent: ArrayBuffer;

			if (!fileContent) {
				processedContent = new ArrayBuffer(0);
			} else if (fileContent instanceof ArrayBuffer) {
				processedContent = fileContent;
			} else if (fileContent instanceof Uint8Array) {
				processedContent = fileContent.buffer.slice(
					fileContent.byteOffset,
					fileContent.byteOffset + fileContent.byteLength,
				);
			} else if (fileContent instanceof Blob) {
				processedContent = await fileContent.arrayBuffer();
			} else if (typeof fileContent === "string") {
				processedContent = new TextEncoder().encode(fileContent).buffer;
			} else if (
				fileContent.buffer &&
				fileContent.buffer instanceof ArrayBuffer
			) {
				processedContent = fileContent.buffer.slice(
					fileContent.byteOffset,
					fileContent.byteOffset + fileContent.byteLength,
				);
			} else {
				console.warn(
					`[FileSyncService] Unknown content type, attempting direct use:`,
					fileContent,
				);
				processedContent = fileContent;
			}

			const existingFile = await fileStorageService.getFileByPath(
				expectedPath,
				true,
			);

			const newFile: FileNode = {
				id: existingFile?.id || nanoid(),
				name:
					downloadedFile.fileName.split("/").pop() || downloadedFile.fileName,
				path: expectedPath,
				type: "file",
				content: processedContent,
				lastModified: remoteTimestamp,
				size: downloadedFile.size || processedContent.byteLength,
				mimeType:
					downloadedFile.mimeType ||
					downloadedFile.type ||
					"application/octet-stream",
				isBinary: isBinaryFile(downloadedFile.fileName),
				isDeleted: false,
				documentId: remoteDocumentId,
			};

			return newFile;
		} catch (error) {
			console.error(
				`Error preparing file ${downloadedFile.fileName} for storage:`,
				error,
			);
			return null;
		}
	}

	private async downloadFromLink(
		link: string,
		expectedFiles: string[],
		remoteTimestamps: Map<string, number>,
		remoteDocumentIds: Map<string, string>,
		remoteDeletionStates: Map<string, boolean>,
		filePizzaServerUrl?: string,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			console.log(`[FileSyncService] Starting download from: ${link}`);

			const downloader = new FilePizzaDownloader({
				filePizzaServerUrl: filePizzaServerUrl || this.getFilePizzaServerUrl(),
			});

			let isResolved = false;
			const receivedFiles: any[] = [];
			let expectedFileCount = 0;

			const cleanup = () => {
				if (this.activeDownloaders.has(link)) {
					try {
						downloader.cancelDownload?.();
					} catch (e) {
						console.warn("Error during downloader cleanup:", e);
					}
					this.activeDownloaders.delete(link);
				}
			};

			const resolveOnce = (result?: any) => {
				if (!isResolved) {
					isResolved = true;
					cleanup();
					resolve(result);
				}
			};

			const rejectOnce = (error: any) => {
				if (!isResolved) {
					isResolved = true;
					cleanup();
					reject(error);
				}
			};

			const checkIfAllFilesReceived = async () => {
				if (
					receivedFiles.length >= expectedFileCount &&
					expectedFileCount > 0
				) {
					console.log(
						`[FileSyncService] All ${expectedFileCount} files received, processing for batch save...`,
					);

					try {
						const filesToStore: FileNode[] = [];
						const filesToDelete: string[] = [];

						for (const file of receivedFiles) {
							const expectedPath = expectedFiles.find(
								(path) =>
									path === file.fileName ||
									path.endsWith(file.fileName) ||
									path === `/${file.fileName}`,
							);

							if (expectedPath) {
								file.fileName = file.fileName.split("/").pop();
								const remoteTimestamp =
									remoteTimestamps.get(expectedPath) || Date.now();
								const remoteDocumentId = remoteDocumentIds.get(expectedPath);
								const isDeleted =
									remoteDeletionStates.get(expectedPath) ||
									file.metadata?.isDeleted ||
									false;

								if (isDeleted) {
									console.log(
										`[FileSyncService] Marking file for deletion: ${expectedPath}`,
									);
									filesToDelete.push(expectedPath);
								} else {
									const fileNode = await this.prepareFileNodeForStorage(
										file,
										expectedPath,
										remoteTimestamp,
										remoteDocumentId,
										false,
									);
									if (fileNode) {
										filesToStore.push(fileNode);
									}
								}
							} else {
								console.warn(
									`[FileSyncService] Unexpected file received: ${file.fileName}`,
								);
							}
						}

						if (filesToStore.length > 0) {
							await fileStorageService.batchStoreFiles(filesToStore, {
								preserveTimestamp: true,
								showConflictDialog: false,
								preserveDeletionStatus: false,
							});
						}

						if (filesToDelete.length > 0) {
							for (const filePath of filesToDelete) {
								try {
									await fileStorageService.deleteFileByPath(filePath, {
										showDeleteDialog: false,
										hardDelete: false,
										allowLinkedFileDelete: true,
									});
									console.log(
										`[FileSyncService] Successfully deleted file: ${filePath}`,
									);
								} catch (error) {
									console.warn(
										`[FileSyncService] Failed to delete file ${filePath}:`,
										error,
									);
								}
							}
						}

						const totalProcessed = filesToStore.length + filesToDelete.length;
						this.notifyListeners({
							id: nanoid(),
							type: "sync_complete",
							message: `Successfully processed ${totalProcessed} file(s) (${filesToStore.length} stored, ${filesToDelete.length} deleted)`,
							timestamp: Date.now(),
							data: {
								fileCount: totalProcessed,
								stored: filesToStore.length,
								deleted: filesToDelete.length,
							},
						});

						resolveOnce();
					} catch (error) {
						rejectOnce(error);
					}
				}
			};

			const timeout = setTimeout(() => {
				rejectOnce(new Error("Download timeout after 60 seconds"));
			}, 60000);

			downloader
				.initialize()
				.then(() => {
					console.log(
						`[FileSyncService] Downloader initialized, setting up event handlers`,
					);

					downloader.on("error", (error) => {
						console.error("[FileSyncService] Downloader error:", error);
						clearTimeout(timeout);
						rejectOnce(error);
					});

					downloader.on("passwordRequired", () => {
						console.log("[FileSyncService] Password required for download");
						clearTimeout(timeout);
						rejectOnce(new Error("Password required for download"));
					});

					downloader.on("passwordInvalid", (message) => {
						console.log("[FileSyncService] Invalid password:", message);
						clearTimeout(timeout);
						rejectOnce(new Error(`Invalid password: ${message}`));
					});

					downloader.on("info", (filesInfo) => {
						console.log(
							`[FileSyncService] Received file info, ${filesInfo.length} files available`,
						);
						if (filesInfo.length === 0) {
							clearTimeout(timeout);
							rejectOnce(new Error("No files available for download"));
							return;
						}

						expectedFileCount = filesInfo.length;
						const availableFiles = filesInfo.map((f) => f.fileName);
						console.log(`[FileSyncService] Available files:`, availableFiles);
						console.log(`[FileSyncService] Expected files:`, expectedFiles);

						downloader.startDownload().catch((error) => {
							console.error(
								"[FileSyncService] Error starting download:",
								error,
							);
							clearTimeout(timeout);
							rejectOnce(error);
						});
					});

					downloader.on("fileComplete", (file) => {
						console.log(`[FileSyncService] File completed: ${file.fileName}`);
						receivedFiles.push(file);
						checkIfAllFilesReceived();
					});

					downloader.on("complete", (files) => {
						console.log(
							`[FileSyncService] Download complete event, files array length: ${files.length}`,
						);
						console.log(
							`[FileSyncService] Received files from fileComplete events: ${receivedFiles.length}`,
						);
						clearTimeout(timeout);

						if (files.length > 0) {
							receivedFiles.push(
								...files.filter(
									(f) =>
										!receivedFiles.some((rf) => rf.fileName === f.fileName),
								),
							);
						}

						checkIfAllFilesReceived();
					});

					this.activeDownloaders.set(link, downloader);

					console.log(`[FileSyncService] Connecting to: ${link}`);
					return downloader.connect(link);
				})
				.then((connected) => {
					if (!connected) {
						clearTimeout(timeout);
						rejectOnce(new Error("Failed to connect to FilePizza link"));
					}
					console.log(
						"[FileSyncService] Connected successfully, waiting for file info...",
					);
				})
				.catch((error) => {
					console.error(
						"[FileSyncService] Connection/initialization error:",
						error,
					);
					clearTimeout(timeout);
					rejectOnce(error);
				});
		});
	}

	cleanup(): void {
		console.log("[FileSyncService] Cleaning up active connections");

		this.activeUploaders.forEach((uploader) => {
			try {
				uploader.stop?.();
			} catch (error) {
				console.error("Error stopping uploader:", error);
			}
		});

		this.activeDownloaders.forEach((downloader) => {
			try {
				downloader.cancelDownload?.();
			} catch (error) {
				console.error("Error canceling downloader:", error);
			}
		});

		this.activeUploaders.clear();
		this.activeDownloaders.clear();
	}

	addListener(
		callback: (notification: FileSyncNotification) => void,
	): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	private notifyListeners(notification: FileSyncNotification): void {
		this.listeners.forEach((listener) => listener(notification));

		switch (notification.type) {
			case "sync_error":
				this.showErrorNotification(notification.message, {
					data: notification.data,
					duration: 5000,
				});
				break;
			case "sync_complete":
				this.showSuccessNotification(notification.message, {
					data: notification.data,
					duration: 3000,
				});
				break;
			case "sync_progress":
				this.showSyncNotification(notification.message, {
					data: notification.data,
					duration: 4000,
				});
				break;
			case "sync_request":
				this.showSyncNotification(notification.message, {
					data: notification.data,
					duration: 4000,
				});
				break;
			case "verification":
				if (notification.data?.status === "success") {
					this.showSuccessNotification(notification.message, {
						data: notification.data,
						duration: 3000,
					});
				} else {
					this.showErrorNotification(notification.message, {
						data: notification.data,
						duration: 5000,
					});
				}
				break;
			default:
				this.showInfoNotification(notification.message, {
					data: notification.data,
					duration: 3000,
				});
				break;
		}
	}
}

export const fileSyncService = new FileSyncService();
