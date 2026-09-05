import { useCallback, useEffect, useState } from 'react';

export function useLocalStorage(key, initial) {
  const readValue = useCallback(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState(readValue);

  const setStored = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          }
        } catch {
          // Ignore
        }
        return resolved;
      });
    },
    [key],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (event.key !== key || event.storageArea !== window.localStorage) return;
      try {
        setValue(event.newValue === null ? initial : JSON.parse(event.newValue));
      } catch {
        setValue(initial);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key, initial]);

  return [value, setStored];
}
