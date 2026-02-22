// src/components/common/TagInput.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

const COMMA_CHARS = /[,،、。，]/;

interface TagInputProps {
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    allowedValues?: string[];
    disabled?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({
    values,
    onChange,
    placeholder,
    allowedValues,
    disabled = false,
}) => {
    const [inputValue, setInputValue] = useState('');

    const addTag = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (allowedValues && !allowedValues.includes(trimmed)) return;
        if (values.includes(trimmed)) return;
        onChange([...values, trimmed]);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(inputValue);
            setInputValue('');
        } else if (e.key === 'Backspace' && !inputValue && values.length > 0) {
            onChange(values.slice(0, -1));
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const lastChar = val[val.length - 1];
        if (lastChar && COMMA_CHARS.test(lastChar)) {
            addTag(val.slice(0, -1));
            setInputValue('');
        } else {
            setInputValue(val);
        }
    };

    const removeTag = (tag: string) => {
        onChange(values.filter((v) => v !== tag));
    };

    return (
        <div className="tag-input-field">
            <div className="tag-input-tags">
                {values.map((tag) => (
                    <span key={tag} className="tag-input-tag" onClick={(e) => e.stopPropagation()}>
                        {tag}
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="tag-input-remove"
                                aria-label={t('Remove {tag}', { tag })}
                            >
                                ×
                            </button>
                        )}
                    </span>
                ))}
                {!disabled && (
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder={values.length === 0 ? placeholder : undefined}
                        className="tag-input-inner"
                    />
                )}
            </div>
        </div>
    );
};