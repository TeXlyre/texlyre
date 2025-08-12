// src/components/settings/SettingsCodeMirror.tsx
import React, { useRef, useEffect, useContext } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';

import type { Setting } from '../../contexts/SettingsContext';
import { ThemeContext } from '../../contexts/ThemeContext';

interface SettingsCodeMirrorProps {
  setting: Setting;
  value: string;
  onChange: (value: string) => void;
}

const DEFAULT_OPTIONS = {
  language: 'javascript',
  height: 10,
  lineNumbers: true,
  resizable: false,
  theme: 'auto',
  readOnly: false,
  wordWrap: true,
};

const getLanguageExtension = (language: string) => {
  switch (language) {
    case 'javascript':
    case 'js':
      return javascript();
    case 'python':
      return python();
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    default:
      return javascript();
  }
};

const isDarkTheme = (currentVariant: string): boolean => {
  if (currentVariant === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return currentVariant === 'dark';
};

export const SettingsCodeMirror: React.FC<SettingsCodeMirrorProps> = ({
  setting,
  value,
  onChange,
}) => {
  const options = { ...DEFAULT_OPTIONS, ...setting.codeMirrorOptions };
  const { currentVariant } = useContext(ThemeContext);
  const editorViewRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const isInternalUpdateRef = useRef(false);
  const languageCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());
  const heightCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const getThemeExtension = () => {
    if (options.theme === 'dark') return oneDark;
    if (options.theme === 'light') return [];
    return isDarkTheme(currentVariant) ? oneDark : [];
  };

  useEffect(() => {
    if (!containerRef.current || editorViewRef.current) return;

    const baseExtensions = [
      basicSetup,
      languageCompartmentRef.current.of(getLanguageExtension(options.language)),
      themeCompartmentRef.current.of(getThemeExtension()),
      heightCompartmentRef.current.of(options.height ? EditorView.theme({
        '&': { height: `${options.height * 1.5}em` },
        '.cm-scroller': { overflow: 'auto' }
      }) : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          isInternalUpdateRef.current = true;
          onChangeRef.current(update.state.doc.toString());
          requestAnimationFrame(() => {
            isInternalUpdateRef.current = false;
          });
        }
      })
    ];

    if (!options.lineNumbers) {
      baseExtensions.push(EditorView.lineNumbers.of([]));
    }

    if (options.wordWrap) {
      baseExtensions.push(EditorView.lineWrapping);
    }

    const state = EditorState.create({
      doc: value || '',
      extensions: baseExtensions,
    });

    editorViewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editorViewRef.current || isInternalUpdateRef.current) return;

    const currentDoc = editorViewRef.current.state.doc.toString();
    if (currentDoc !== value) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value || '',
        }
      });
    }
  }, [value]);

  useEffect(() => {
    if (!editorViewRef.current) return;

    editorViewRef.current.dispatch({
      effects: languageCompartmentRef.current.reconfigure(
        getLanguageExtension(options.language)
      )
    });
  }, [options.language]);

  useEffect(() => {
    if (!editorViewRef.current) return;

    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(getThemeExtension())
    });
  }, [options.theme, currentVariant]);

  useEffect(() => {
    if (!editorViewRef.current) return;

    editorViewRef.current.dispatch({
      effects: heightCompartmentRef.current.reconfigure(
        options.height ? EditorView.theme({
          '&': { height: `${options.height * 1.5}em` },
          '.cm-scroller': { overflow: 'auto' }
        }) : []
      )
    });
  }, [options.height]);

  return (
    <div className="settings-codemirror">
      <label className="setting-label">
        {setting.label}
        {setting.description && (
          <span className="setting-description">{setting.description}</span>
        )}
      </label>
      <div 
        ref={containerRef}
        className={`settings-codemirror-container ${options.resizable ? 'resizable' : ''}`}
        style={{
          border: '1px solid #ddd',
          borderRadius: '4px',
          ...(options.resizable && { resize: 'vertical', overflow: 'auto' })
        }}
      />
    </div>
  );
};