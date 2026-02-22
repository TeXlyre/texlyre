// extras/viewers/bibtex/TidyOptionsPanel.tsx
import { t } from '@/i18n';
import type React from 'react';

import { TagInput } from '@/components/common/TagInput';
import { CleanIcon, ResetIcon } from '@/components/common/Icons';
import type { TidyOptions } from './tidyOptions';

interface TidyOptionsPanelProps {
  options: TidyOptions;
  onOptionsChange: (options: TidyOptions) => void;
  onResetToDefaults: () => void;
  onProcessBibtex: () => void;
  isProcessing: boolean;
}

const DUPLICATE_RULES = ['doi', 'key', 'abstract', 'citation'] as const;

export const TidyOptionsPanel: React.FC<TidyOptionsPanelProps> = ({
  options,
  onOptionsChange,
  onResetToDefaults,
  onProcessBibtex,
  isProcessing
}) => {
  const updateOption = (key: keyof TidyOptions, value: unknown) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <div className="bibtex-sidebar">
      <div className="sidebar-header">
        <h4>{t('Tidy Options')}</h4>
        <div className="header-buttons">
          <button
            className="reset-button"
            onClick={onResetToDefaults}
            title={t('Reset to Standard Preset')}>
            <ResetIcon />
          </button>
          <button
            onClick={onProcessBibtex}
            disabled={isProcessing}
            title={t('Process BibTeX with Current Settings')}
            className="tidy-button">
            <CleanIcon />{t('Tidy')}
          </button>
        </div>
      </div>

      <div className="options-container">
        <div className="option-group">
          <h5>{t('Fields')}</h5>

          <label className="option-item">
            <span>{t('Remove fields:')}</span>
            <TagInput
              values={options.omit || []}
              onChange={(vals) => updateOption('omit', vals)}
              placeholder={t('Add keys (press Enter or comma to add)')}
            />
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.removeEmptyFields)}
              onChange={(e) => updateOption('removeEmptyFields', e.target.checked)}
            />
            <span>{t('Remove empty fields')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.removeDuplicateFields)}
              onChange={(e) => updateOption('removeDuplicateFields', e.target.checked)}
            />
            <span>{t('Remove duplicate fields')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.sortFields)}
              onChange={(e) => updateOption('sortFields', e.target.checked ? true : false)}
            />
            <span>{t('Sort fields within entries')}</span>
          </label>

          {options.sortFields && (
            <label className="option-item sub-option">
              <span>{t('Field order:')}</span>
              <TagInput
                values={Array.isArray(options.sortFields) ? options.sortFields : []}
                onChange={(vals) => updateOption('sortFields', vals.length > 0 ? vals : true)}
                placeholder={t('Add keys (press Enter or comma to add)')}
              />
              <div className="info-message">
                {t('Leave empty to use default order: title, author, year, journal, …')}
              </div>
            </label>
          )}
        </div>

        <div className="option-group">
          <h5>{t('Values')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.curly)}
              onChange={(e) => updateOption('curly', e.target.checked)}
            />
            <span>{t('Enclose values in braces')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.numeric)}
              onChange={(e) => updateOption('numeric', e.target.checked)}
            />
            <span>{t('Use numeric values')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.months)}
              onChange={(e) => updateOption('months', e.target.checked)}
            />
            <span>{t('Abbreviate months')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.stripEnclosingBraces)}
              onChange={(e) => updateOption('stripEnclosingBraces', e.target.checked)}
            />
            <span>{t('Strip double braces')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.dropAllCaps)}
              onChange={(e) => updateOption('dropAllCaps', e.target.checked)}
            />
            <span>{t('Convert ALL CAPS to Title Case')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.escape)}
              onChange={(e) => updateOption('escape', e.target.checked)}
            />
            <span>{t('Escape special characters')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.lowercase)}
              onChange={(e) => updateOption('lowercase', e.target.checked)}
            />
            <span>{t('Lowercase field names')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.trailingCommas)}
              onChange={(e) => updateOption('trailingCommas', e.target.checked)}
            />
            <span>{t('Trailing commas')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.encodeUrls)}
              onChange={(e) => updateOption('encodeUrls', e.target.checked)}
            />
            <span>{t('Encode URLs')}</span>
          </label>
        </div>

        <div className="option-group">
          <h5>{t('Braces')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.enclosingBraces)}
              onChange={(e) =>
                updateOption('enclosingBraces', e.target.checked ? ['title'] : false)
              }
            />
            <span>{t('Enclose in double braces')}</span>
          </label>

          {options.enclosingBraces && (
            <label className="option-item sub-option">
              <span>{t('Fields to enclose:')}</span>
              <TagInput
                values={Array.isArray(options.enclosingBraces) ? options.enclosingBraces : ['title']}
                onChange={(vals) =>
                  updateOption('enclosingBraces', vals.length > 0 ? vals : ['title'])
                }
                placeholder={t('Add keys (press Enter or comma to add)')}
              />
            </label>
          )}

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.removeBraces)}
              onChange={(e) =>
                updateOption('removeBraces', e.target.checked ? ['title'] : false)
              }
            />
            <span>{t('Remove braces')}</span>
          </label>

          {options.removeBraces && (
            <label className="option-item sub-option">
              <span>{t('Fields to remove braces from:')}</span>
              <TagInput
                values={Array.isArray(options.removeBraces) ? options.removeBraces : ['title']}
                onChange={(vals) =>
                  updateOption('removeBraces', vals.length > 0 ? vals : ['title'])
                }
                placeholder={t('Add keys (press Enter or comma to add)')}
              />
            </label>
          )}
        </div>

        <div className="option-group">
          <h5>{t('Formatting')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.tab)}
              onChange={(e) => updateOption('tab', e.target.checked)}
            />
            <span>{t('Use tabs for indentation')}</span>
          </label>

          {!options.tab && (
            <label className="option-item sub-option">
              <span>{t('Space indentation:')}</span>
              <input
                type="number"
                min="1"
                max="8"
                value={typeof options.space === 'number' ? options.space : 2}
                onChange={(e) => updateOption('space', Number.parseInt(e.target.value))}
              />
            </label>
          )}

          <label className="option-item">
            <span>{t('Align values:')}</span>
            <input
              type="number"
              min="0"
              max="50"
              value={typeof options.align === 'number' ? options.align : 14}
              onChange={(e) => updateOption('align', Number.parseInt(e.target.value))}
            />
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.blankLines)}
              onChange={(e) => updateOption('blankLines', e.target.checked)}
            />
            <span>{t('Insert blank lines between entries')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.wrap)}
              onChange={(e) => updateOption('wrap', e.target.checked ? 80 : false)}
            />
            <span>{t('Wrap long values')}</span>
          </label>

          {options.wrap && (
            <label className="option-item sub-option">
              <span>{t('Wrap at column:')}</span>
              <input
                type="number"
                min="40"
                max="200"
                value={typeof options.wrap === 'number' ? options.wrap : 80}
                onChange={(e) => updateOption('wrap', Number.parseInt(e.target.value))}
              />
            </label>
          )}
        </div>

        <div className="option-group">
          <h5>{t('Sorting')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.sort)}
              onChange={(e) => updateOption('sort', e.target.checked ? ['key'] : false)}
            />
            <span>{t('Sort entries')}</span>
          </label>

          {options.sort && (
            <label className="option-item sub-option">
              <span>{t('Sort by fields:')}</span>
              <TagInput
                values={Array.isArray(options.sort) ? options.sort : ['key']}
                onChange={(vals) => updateOption('sort', vals.length > 0 ? vals : ['key'])}
                placeholder={t('Add keys (press Enter or comma to add)')}
              />
              <div className="info-message">
                {t('Prefix a field with - for descending order (e.g. -year). Use key for citation key or type for entry type.')}
              </div>
            </label>
          )}
        </div>

        <div className="option-group">
          <h5>{t('Duplicates')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.duplicates)}
              onChange={(e) =>
                updateOption(
                  'duplicates',
                  e.target.checked ? ['doi', 'citation', 'abstract'] : false
                )
              }
            />
            <span>{t('Check for duplicates')}</span>
          </label>

          {options.duplicates && (
            <>
              <label className="option-item sub-option">
                <span>{t('Check by:')}</span>
                <TagInput
                  values={
                    Array.isArray(options.duplicates)
                      ? options.duplicates
                      : ['doi', 'citation', 'abstract']
                  }
                  onChange={(vals) => {
                    const filtered = vals.filter((v) =>
                      (DUPLICATE_RULES as readonly string[]).includes(v)
                    ) as typeof DUPLICATE_RULES[number][];
                    updateOption('duplicates', filtered.length > 0 ? filtered : ['doi', 'citation', 'abstract']);
                  }}
                  allowedValues={[...DUPLICATE_RULES]}
                  placeholder={t('Add keys (press Enter or comma to add)')}
                />
                <div className="info-message">
                  {t('Allowed values: doi, key, abstract, citation')}
                </div>
              </label>

              <label className="option-item sub-option">
                <span>{t('Merge strategy:')}</span>
                <select
                  value={typeof options.merge === 'string' ? options.merge : 'false'}
                  onChange={(e) =>
                    updateOption('merge', e.target.value === 'false' ? false : e.target.value)
                  }>
                  <option value="false">{t("Don't merge")}</option>
                  <option value="first">{t('Keep first')}</option>
                  <option value="last">{t('Keep last')}</option>
                  <option value="combine">{t('Combine fields')}</option>
                  <option value="overwrite">{t('Overwrite fields')}</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="option-group">
          <h5>{t('Comments')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.stripComments)}
              onChange={(e) => updateOption('stripComments', e.target.checked)}
            />
            <span>{t('Remove comments')}</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.tidyComments)}
              onChange={(e) => updateOption('tidyComments', e.target.checked)}
            />
            <span>{t('Tidy comments')}</span>
          </label>
        </div>

        <div className="option-group">
          <h5>{t('Advanced')}</h5>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.generateKeys)}
              onChange={(e) =>
                updateOption(
                  'generateKeys',
                  e.target.checked
                    ? '[auth:required:lower][year:required][veryshorttitle:lower][duplicateNumber]'
                    : false
                )
              }
            />
            <span>{t('Generate citation keys')}</span>
          </label>

          {options.generateKeys && (
            <label className="option-item sub-option">
              <span>{t('Key template:')}</span>
              <input
                type="text"
                value={
                  typeof options.generateKeys === 'string'
                    ? options.generateKeys
                    : '[auth:required:lower][year:required][veryshorttitle:lower][duplicateNumber]'
                }
                onChange={(e) => updateOption('generateKeys', e.target.value)}
                placeholder={t('JabRef pattern')}
              />
              <div className="warning-message">
                {t('This is an experimental feature and may change without notice.')}
              </div>
              <div className="info-message">
                {t('Uses JabRef citation key patterns, e.g. [auth:lower][year][veryshorttitle:lower]')}
                <br />
                <a
                  href="https://flamingtempura.github.io/bibtex-tidy/manual/key-generation.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-link">
                  {t('Learn more about key patterns')}
                </a>
              </div>
            </label>
          )}

          <label className="option-item">
            <span>{t('Max authors:')}</span>
            <input
              type="number"
              min="1"
              max="20"
              value={options.maxAuthors || ''}
              onChange={(e) =>
                updateOption(
                  'maxAuthors',
                  e.target.value ? Number.parseInt(e.target.value) : undefined
                )
              }
              placeholder={t('No limit')}
            />
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={Boolean(options.lookupDois)}
              onChange={(e) => updateOption('lookupDois', e.target.checked)}
            />
            <span>{t('Lookup missing DOIs')}</span>
          </label>

          {options.lookupDois && (
            <div className="warning-message">
              {t('Queries CrossRef API for each entry missing a DOI. May be slow for large files.')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};