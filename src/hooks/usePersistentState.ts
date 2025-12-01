// src/hooks/usePersistentState.ts
import { useCallback, useReducer } from 'react';

const persistentStates = new Map<string, any>();

export function usePersistentState<T>(
    key: string,
    initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
    if (!persistentStates.has(key)) {
        persistentStates.set(key, initialValue);
    }

    const [, forceUpdate] = useReducer((x) => x + 1, 0);

    const setValue = useCallback(
        (newValue: T | ((prev: T) => T)) => {
            const currentValue = persistentStates.get(key);
            const valueToSet = typeof newValue === 'function'
                ? (newValue as (prev: T) => T)(currentValue)
                : newValue;
            persistentStates.set(key, valueToSet);
            forceUpdate();
        },
        [key]
    );

    return [persistentStates.get(key), setValue];
}