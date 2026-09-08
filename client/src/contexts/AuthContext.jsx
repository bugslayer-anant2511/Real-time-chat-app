import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import * as authService from '../api/auth.service.js';
import { ROUTES, STORAGE_KEYS } from '../utils/constants.js';

const AuthContext = createContext(null);

const readToken = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEYS.TOKEN);
};

const writeToken = (value) => {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(STORAGE_KEYS.TOKEN, value);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.TOKEN);
  }
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(readToken()));

  const bootstrappedRef = useRef(false);

  const applyAuthResult = useCallback(
    (result, { redirect = true, redirectTo } = {}) => {
      const nextToken = result?.data?.token ?? result?.token ?? null;
      const nextUser = result?.data?.user ?? result?.user ?? null;
      if (!nextToken || !nextUser) {
        throw new Error('Auth response missing token or user');
      }
      writeToken(nextToken);
      setToken(nextToken);
      setUser(nextUser);
      if (redirect) {
        navigate(redirectTo || ROUTES.CHAT, { replace: true });
      }
    },
    [navigate],
  );

  const login = useCallback(
    async (email, password, options = {}) => {
      const result = await authService.login({ email, password });
      applyAuthResult(result, options);
      return result;
    },
    [applyAuthResult],
  );

  const register = useCallback(
    async (payload, options = {}) => {
      const result = await authService.register(payload);
      applyAuthResult(result, options);
      return result;
    },
    [applyAuthResult],
  );

  const logout = useCallback(
    ({ redirect = true } = {}) => {
      writeToken(null);
      setToken(null);
      setUser(null);
      if (redirect) {
        navigate(ROUTES.LOGIN, { replace: true });
      }
    },
    [navigate],
  );

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = typeof partial === 'function' ? partial(prev) : { ...prev, ...partial };
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!readToken()) return null;
    try {
      const result = await authService.getMe();
      const nextUser = result?.data?.user ?? null;
      if (nextUser) setUser(nextUser);
      return nextUser;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        logout({ redirect: false });
      }
      return null;
    }
  }, [logout]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const storedToken = readToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const result = await authService.getMe();
        const nextUser = result?.data?.user ?? null;
        if (nextUser) {
          setUser(nextUser);
        } else {
          writeToken(null);
          setToken(null);
        }
      } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          writeToken(null);
          setToken(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (event.key !== STORAGE_KEYS.TOKEN) return;
      if (event.newValue === null) {
        setToken(null);
        setUser(null);
      } else if (event.newValue !== token) {
        setToken(event.newValue);
        refresh();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [token, refresh]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      updateUser,
      refresh,
    }),
    [user, token, loading, login, register, logout, updateUser, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
};

export default AuthContext;
