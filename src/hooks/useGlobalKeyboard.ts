// src/hooks/useGlobalKeyboard.ts
import { useEffect } from 'react';

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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
};