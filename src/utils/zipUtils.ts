// src/utils/zipUtils.ts
import JSZip from "jszip";
import { nanoid } from "nanoid";

import type { FileNode } from "../types/files";
import {
	getMimeType,
	getParentPath,
	isBinaryFile,
	joinPaths,
} from "./fileUtils";

export const extractZip = async (
	zipFile: File,
	currentPath: string,
): Promise<FileNode[]> => {
	const zip = new JSZip();
	const content = await zipFile.arrayBuffer();
	const zipContents = await zip.loadAsync(content);
	const files: FileNode[] = [];

	const processPromises = Object.keys(zipContents.files).map(
		async (relativePath) => {
			const zipEntry = zipContents.files[relativePath];

			if (zipEntry.dir) return;

			const fullPath = joinPaths(currentPath, relativePath);
			const parentDir = getParentPath(fullPath);

			let currentDir = "";
			const pathSegments = parentDir.split("/").filter((segment) => segment);
			for (const segment of pathSegments) {
				if (!segment) continue;

				currentDir =
					currentDir === "" ? `/${segment}` : `${currentDir}/${segment}`;

				if (
					!files.some((f) => f.path === currentDir && f.type === "directory")
				) {
					files.push({
						id: nanoid(),
						name: segment,
						path: currentDir,
						type: "directory",
						lastModified: Date.now(),
					});
				}
			}

			const fileContent = await zipEntry.async("arraybuffer");
			const fileName = relativePath.split("/").pop() || "";
			const fileMimeType = getMimeType(fileName);
			const fileBinary = isBinaryFile(fileName);

			files.push({
				id: nanoid(),
				name: fileName,
				path: fullPath,
				type: "file",
				content: fileContent,
				lastModified: Date.now(),
				size: fileContent.byteLength,
				mimeType: fileMimeType,
				isBinary: fileBinary,
			});
		},
	);

	await Promise.all(processPromises);
	return files;
};

export const batchExtractZip = async (
	zipFile: File,
	currentPath: string,
): Promise<{ files: FileNode[]; directories: FileNode[] }> => {
	const files = await extractZip(zipFile, currentPath);
	return {
		files: files.filter((f) => f.type === "file"),
		directories: files.filter((f) => f.type === "directory"),
	};
};
