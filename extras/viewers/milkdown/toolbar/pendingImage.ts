// extras/viewers/milkdown/toolbar/pendingImage.ts
let pendingImagePath: string | null = null;

export function setPendingMilkdownImagePath(path: string | null): void {
	pendingImagePath = path;
}

export function getPendingMilkdownImagePath(): string | null {
	const path = pendingImagePath;
	pendingImagePath = null;
	return path;
}
