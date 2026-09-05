import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { useAuth } from './AuthContext.jsx';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { updatePreferences as updatePreferencesService } from '../api/user.service.js';
import { DEFAULT_PREFERENCES, STORAGE_KEYS } from '../utils/constants.js';

const PreferencesContext = createContext(null);

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', Boolean(prefersDark));
  }
};

const applyFontSize = (size) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('fs-sm', 'fs-md', 'fs-lg');
  root.classList.add(`fs-${size}`);
};

const applyDensity = (density) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('density-compact', 'density-comfortable');
  root.classList.add(`density-${density}`);
};

const applyAnimations = (animations) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('no-anim', animations === false);
};

const setByPath = (obj, path, value) => {
  const keys = path.split('.');
  if (keys.length === 1) {
    return { ...obj, [keys[0]]: value };
  }
  if (keys.length === 2) {
    const [outer, inner] = keys;
    return {
      ...obj,
      [outer]: { ...(obj?.[outer] ?? {}), [inner]: value },
    };
  }
  throw new Error(`Unsupported preference path depth: ${path}`);
};

const getByPath = (obj, path) => {
  const keys = path.split('.');
  return keys.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

export const PreferencesProvider = ({ children }) => {
  const { user, updateUser } = useAuth();

  const [guestPreferences, setGuestPreferences] = useLocalStorage(
    STORAGE_KEYS.GUEST_PREFERENCES,
    DEFAULT_PREFERENCES,
  );

  const preferences = useMemo(() => {
    const source = user?.preferences ?? guestPreferences ?? DEFAULT_PREFERENCES;
    return {
      ...DEFAULT_PREFERENCES,
      ...source,
      notifications: {
        ...DEFAULT_PREFERENCES.notifications,
        ...(source?.notifications ?? {}),
      },
    };
  }, [user, guestPreferences]);

  useEffect(() => {
    applyTheme(preferences.theme);

    if (preferences.theme !== 'system') return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    if (media.addEventListener) {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, [preferences.theme]);

  useEffect(() => {
    applyFontSize(preferences.fontSize);
  }, [preferences.fontSize]);

  useEffect(() => {
    applyDensity(preferences.contentDensity);
  }, [preferences.contentDensity]);

  useEffect(() => {
    applyAnimations(preferences.animations);
  }, [preferences.animations]);

  const updatePreference = useCallback(
    async (path, value) => {
      const previousValue = getByPath(preferences, path);
      const optimistic = setByPath(preferences, path, value);

      if (user) {
        updateUser({ preferences: optimistic });
      } else {
        setGuestPreferences(optimistic);
      }

      if (!user) return optimistic;

      try {
        const patch = setByPath({}, path, value);
        const result = await updatePreferencesService(patch);

        const persisted = result?.data?.preferences ?? optimistic;
        updateUser({ preferences: persisted });
        return persisted;
      } catch (error) {
        const rolledBack = setByPath(preferences, path, previousValue);
        updateUser({ preferences: rolledBack });
        throw error;
      }
    },
    [preferences, user, updateUser, setGuestPreferences],
  );

  const value = useMemo(
    () => ({ preferences, updatePreference }),
    [preferences, updatePreference],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a <PreferencesProvider>');
  }
  return ctx;
};

export default PreferencesContext;
