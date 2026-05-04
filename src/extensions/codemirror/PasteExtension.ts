import { EditorView } from '@codemirror/view';

import { detectFileType } from '../../utils/fileUtils';
import { uploadPastedFile } from '../../utils/clipboardUtils';
import { runToolbarCommand } from './ToolbarExtension';

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

                    const fileType = detectFileType(fileName);
                    const toolbar_command = runToolbarCommand(view, `${fileType}-figure`);
                    if (!toolbar_command) {
                        console.warn('Figure command not found in toolbar');
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