// src/hooks/useGlobalKeyboard.ts
import { useEffect } from 'react';

const getSelectedText = (): string => {
  const selection = window.getSelection();
  return selection?.toString().trim() || '';
};

export const useGlobalKeyboard = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F9 - Regular compile
      if (event.key === 'F9' && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('trigger-compile'));
        return;
      }

      // Shift+F9 - Compile with clear cache
      if (event.key === 'F9' && event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('trigger-compile-clean'));
        return;
      }

      // F8 - Stop compilation
      if (event.key === 'F8' && !event.shiftKey && !event.ctrlKey) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('trigger-stop-compilation'));
        return;
      }

      // Ctrl+Shift+F - Open search panel (search mode)
      if (event.code === 'KeyF' && event.shiftKey && event.ctrlKey) {
        event.preventDefault();
        const selectedText = getSelectedText();
        document.dispatchEvent(new CustomEvent('open-search-panel', {
          detail: { mode: 'search', selectedText }
        }));
        return;
      }

      // Ctrl+Shift+H - Open search panel (replace mode)
      if (event.code === 'KeyH' && event.shiftKey && event.ctrlKey) {
        event.preventDefault();
        const selectedText = getSelectedText();
        document.dispatchEvent(new CustomEvent('open-search-panel', {
          detail: { mode: 'replace', selectedText }
        }));
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
};