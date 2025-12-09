import { EditorView } from '@codemirror/view';
import { detectFileType } from '../../utils/fileUtils';
import { uploadPastedFile } from '../../utils/clipboardUtils';

let pendingImagePath: string | null = null;

export function getPendingImagePath(): string | null {
    const path = pendingImagePath;
    pendingImagePath = null;
    return path;
}

export const createPasteExtension = (currentFileId?: string, fileName?: string) => {
    return EditorView.domEventHandlers({
        paste: (event, view) => {
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find(item => item.type.startsWith('image/'));
            const pdfItem = items.find(item => item.type === 'application/pdf');

            const fileItem = imageItem || pdfItem;
            if (!fileItem) return false;

            event.preventDefault();
            const blob = fileItem.getAsFile();
            if (!blob) return false;

            uploadPastedFile(blob, currentFileId)
                .then(uploadedPath => {
                    pendingImagePath = uploadedPath;

                    const toolbar = view.dom.querySelector('.codemirror-toolbar');
                    const fileType = detectFileType(fileName);
                    const figureButton = toolbar?.querySelector(`[data-item="${fileType}-figure"]`) as HTMLElement;

                    if (figureButton) {
                        figureButton.click();
                    } else {
                        console.warn('Figure button not found in toolbar');
                        pendingImagePath = null;
                    }
                })
                .catch(error => {
                    console.error('Error handling pasted file:', error);
                });

            return true;
        }
    });
};