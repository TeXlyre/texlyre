// src/components/common/NumberInput.tsx
import { forwardRef, InputHTMLAttributes, useEffect, useState } from 'react';

type NumberInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'value' | 'type' | 'defaultValue'
> & {
    value: number;
    onChange: (value: number) => void;
    integer?: boolean;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
    ({ value, min, max, onChange, onBlur, integer = false, ...rest }, ref) => {
        const [draft, setDraft] = useState(String(value));

        useEffect(() => {
            setDraft(String(value));
        }, [value]);

        const minNum = min !== undefined ? Number(min) : -Infinity;
        const maxNum = max !== undefined ? Number(max) : Infinity;

        return (
            <input
                {...rest}
                ref={ref}
                type="number"
                min={min}
                max={max}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => {
                    const parsed = integer ? parseInt(draft, 10) : parseFloat(draft);
                    const fallback = Number.isFinite(minNum) ? minNum : value;
                    const clamped = Number.isNaN(parsed)
                        ? fallback
                        : Math.min(maxNum, Math.max(minNum, parsed));
                    setDraft(String(clamped));
                    if (clamped !== value) onChange(clamped);
                    onBlur?.(e);
                }}
            />
        );
    }
);

NumberInput.displayName = 'NumberInput';