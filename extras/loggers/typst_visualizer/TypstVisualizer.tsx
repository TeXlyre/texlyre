// extras/loggers/typst_visualizer/TypstVisualizer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { PluginHeader } from '@/components/common/PluginHeader';
import type { LoggerProps } from '@/plugins/PluginInterface';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './TypstVisualizerPlugin';

interface ParsedDiagnostic {
  type: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  file?: string;
  hints?: string[];
  fullMessage?: string;
}

const TypstVisualizer: React.FC<LoggerProps> = ({ log, onLineClick }) => {
  const [parsedDiagnostics, setParsedDiagnostics] = useState<ParsedDiagnostic[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

  useEffect(() => {
    if (!log) {
      setParsedDiagnostics([]);
      return;
    }

    const diagnostics = parseTypstLog(log);
    setParsedDiagnostics(diagnostics);
  }, [log]);

  const filteredDiagnostics = parsedDiagnostics.filter((diagnostic) => {
    if (filter === 'all') return true;
    return diagnostic.type === filter;
  });

  const handleFilterClick = (type: 'error' | 'warning') => {
    setFilter((current) => current === type ? 'all' : type);
  };

  const parseTypstLog = (log: string): ParsedDiagnostic[] => {
    const result: ParsedDiagnostic[] = [];
    const lines = log.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const errorMatch = line.match(/^error(?:\[([^\]]+)\])?\s*:\s*(.+)$/);
      const warningMatch = line.match(/^warning(?:\[([^\]]+)\])?\s*:\s*(.+)$/);
      const infoMatch = line.match(/^info(?:\[([^\]]+)\])?\s*:\s*(.+)$/);

      let diagnostic: ParsedDiagnostic | null = null;

      if (errorMatch) {
        diagnostic = {
          type: 'error',
          message: errorMatch[2].trim(),
          file: undefined,
          line: undefined,
          hints: []
        };

        if (errorMatch[1]) {
          const location = parseLocation(errorMatch[1]);
          diagnostic.file = location.file;
          diagnostic.line = location.line;
        }
      } else if (warningMatch) {
        diagnostic = {
          type: 'warning',
          message: warningMatch[2].trim(),
          file: undefined,
          line: undefined,
          hints: []
        };

        if (warningMatch[1]) {
          const location = parseLocation(warningMatch[1]);
          diagnostic.file = location.file;
          diagnostic.line = location.line;
        }
      } else if (infoMatch) {
        diagnostic = {
          type: 'info',
          message: infoMatch[2].trim(),
          file: undefined,
          line: undefined,
          hints: []
        };

        if (infoMatch[1]) {
          const location = parseLocation(infoMatch[1]);
          diagnostic.file = location.file;
          diagnostic.line = location.line;
        }
      }

      if (diagnostic) {
        let fullMessage = diagnostic.message;

        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();

          if (nextLine.startsWith('hint:')) {
            const hint = nextLine.substring(5).trim();
            diagnostic.hints?.push(hint);
            continue;
          }

          if (nextLine.match(/^(error|warning|info)(?:\[|:)/)) {
            break;
          }

          if (nextLine && !nextLine.startsWith('hint:')) {
            fullMessage += ` ${nextLine}`;
          }
        }

        diagnostic.fullMessage = fullMessage.replace(/\s+/g, ' ').trim();
        result.push(diagnostic);
      }
    }

    return result;
  };

  const parseLocation = (location: string): { file?: string; line?: number; } => {
    const match = location.match(/^([^:]+)(?::(\d+))?/);
    if (!match) return {};

    return {
      file: match[1],
      line: match[2] ? Number.parseInt(match[2], 10) + 1 : undefined
    };
  };

  const handleDiagnosticClick = (diagnostic: ParsedDiagnostic) => {
    if (diagnostic.line && onLineClick) {
      onLineClick(diagnostic.line);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '•';
    }
  };

  const tooltipInfo = [
    t('Total errors: {count}', { count: parsedDiagnostics.filter((d) => d.type === 'error').length }),
    t('Total warnings: {count}', { count: parsedDiagnostics.filter((d) => d.type === 'warning').length }),
    t('Log size: {size}', { size: log ? `${Math.round(log.length / 1024)} KB` : '0 KB' }),
    t('Click error items to navigate to line')
  ];

  const headerControls =
    <div className="error-stats">
      <span
        className={`error-count ${filter === 'error' ? 'active' : ''}`}
        onClick={() => handleFilterClick('error')}
        title={t('Click to filter errors')}>

        {getTypeIcon('error')}{' '}
        {parsedDiagnostics.filter((d) => d.type === 'error').length}
      </span>
      <span
        className={`warning-count ${filter === 'warning' ? 'active' : ''}`}
        onClick={() => handleFilterClick('warning')}
        title={t('Click to filter warnings')}>

        {getTypeIcon('warning')}{' '}
        {parsedDiagnostics.filter((d) => d.type === 'warning').length}
      </span>
    </div>;


  return (
    <div className="typst-visualizer">
      <PluginHeader
        fileName="Typst Log"
        filePath="Typst Compilation Output"
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        tooltipInfo={tooltipInfo}
        controls={headerControls} />


      <div className="typst-visualizer-content">
        {filteredDiagnostics.length === 0 ?
          <div className="no-errors">
            <div className="success-icon">✅</div>
            <div>
              {parsedDiagnostics.length === 0 ?
                t('No errors or warnings found.') :
                t(`No {filter} found.`, { filter })}
            </div>
            <div className="success-subtitle">
              {parsedDiagnostics.length === 0 ?
                t('Compilation appears successful!') :
                t(`Showing {filter} items only.`, { filter })}
            </div>
          </div> :

          <ul className="diagnostic-list">
            {filteredDiagnostics.map((diagnostic, index) =>
              <li
                key={index}
                className={`diagnostic-item ${diagnostic.type} ${diagnostic.line ? 'clickable' : ''}`}
                onClick={() => handleDiagnosticClick(diagnostic)}
                title={
                  diagnostic.line ? t(`Click to go to line {errorLine}`, { errorLine: diagnostic.line }) : undefined
                }>

                <div className="diagnostic-header">
                  <span className="diagnostic-type-badge">
                    <span className="diagnostic-icon">
                      {getTypeIcon(diagnostic.type)}
                    </span>
                    <span className="diagnostic-type-text">{diagnostic.type}</span>
                  </span>
                  <div className="diagnostic-location">
                    {diagnostic.file &&
                      <span
                        className="diagnostic-file"
                        title={t(`File: {errorFile}`, { errorFile: diagnostic.file })}>{t('\uD83D\uDCC4')}

                        {diagnostic.file}
                      </span>
                    }
                    {diagnostic.line &&
                      <span className="diagnostic-line">{t('Line')}{diagnostic.line}</span>
                    }
                  </div>
                </div>
                <div className="typst-diagnostic-message">
                  {diagnostic.fullMessage || diagnostic.message}
                </div>
                {diagnostic.hints && diagnostic.hints.length > 0 &&
                  <div className="diagnostic-hints">
                    {diagnostic.hints.map((hint, hintIndex) =>
                      <div key={hintIndex} className="diagnostic-hint">{t('\uD83D\uDCA1')}
                        {hint}
                      </div>
                    )}
                  </div>
                }
              </li>
            )}
          </ul>
        }
      </div>
    </div>);

};

export default TypstVisualizer;