import { fileCommentProcessor } from "../services/FileCommentProcessor";

export const copyCleanTextToClipboard = async (text: string): Promise<void> => {
	try {
		const cleanedText = fileCommentProcessor.processTextSelection(text);
		await navigator.clipboard.writeText(cleanedText);
	} catch (error) {
		console.error("Failed to copy to clipboard:", error);

		// Fallback for older browsers
		const textArea = document.createElement("textarea");
		textArea.value = fileCommentProcessor.processTextSelection(text);
		document.body.appendChild(textArea);
		textArea.select();
		try {
			document.execCommand("copy");
		} catch (fallbackError) {
			console.error("Fallback copy failed:", fallbackError);
		}
		document.body.removeChild(textArea);
	}
};
