import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  MessageCircle,
  Settings as SettingsIcon,
  Shield,
  User as UserIcon,
  X,
  ArrowLeft,
} from 'lucide-react';
import clsx from 'clsx';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useOnClickOutside } from '../../hooks/useOnClickOutside.js';
import Avatar from '../common/Avatar.jsx';
import NotificationsDropdown from './NotificationsDropdown.jsx';
import Tooltip from '../common/Tooltip.jsx';

const navLinkClass = ({ isActive }) =>
  clsx(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
  );

const Navbar = () => {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const menuRef = useRef(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));

  useEffect(() => {
    setMenuOpen(false);
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = drawerOpen ? 'hidden' : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [drawerOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    setDrawerOpen(false);
    logout();
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {location.pathname !== '/chat' && (
              <Tooltip content="Back to Chat" position="bottom">
                <button
                  type="button"
                  onClick={() => navigate('/chat')}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                  aria-label="Go back to chat"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
            <Link
              to="/chat"
              className="flex items-center gap-2 text-brand-600 transition-opacity hover:opacity-80 dark:text-brand-400"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                Chat App
              </span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            <NavLink to="/chat" className={navLinkClass} end={false}>
              Chat
            </NavLink>
            {isAdmin ? (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            ) : null}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationsDropdown />

            <div className="relative hidden md:block" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Avatar
                  src={user?.avatarUrl}
                  name={user?.displayName || user?.username}
                  size="sm"
                />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="border-b border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
                    <p className="truncate font-semibold text-gray-900 dark:text-white">
                      {user?.displayName || user?.username || 'Account'}
                    </p>
                    {user?.email ? (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {user.email}
                      </p>
                    ) : null}
                  </div>
                  <ul className="py-1 text-sm">
                    {user?.username ? (
                      <li>
                        <MenuLink to={`/u/${user.username}`} icon={UserIcon}>
                          Profile
                        </MenuLink>
                      </li>
                    ) : null}
                    <li>
                      <MenuLink to="/settings" icon={SettingsIcon}>
                        Settings
                      </MenuLink>
                    </li>
                    {isAdmin ? (
                      <li>
                        <MenuLink to="/admin" icon={Shield}>
                          Admin
                        </MenuLink>
                      </li>
                    ) : null}
                    <li className="my-1 border-t border-gray-100 dark:border-gray-800" />
                    <li>
                      <button
                        type="button"
                        onClick={handleLogout}
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        <span>Log out</span>
                      </button>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute top-0 right-0 flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <Avatar
                src={user?.avatarUrl}
                name={user?.displayName || user?.username}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {user?.displayName || user?.username || 'Account'}
                </p>
                {user?.email ? (
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {user.email}
                  </p>
                ) : null}
              </div>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Mobile">
              <DrawerLink to="/chat" icon={MessageCircle}>
                Chat
              </DrawerLink>
              {user?.username ? (
                <DrawerLink to={`/u/${user.username}`} icon={UserIcon}>
                  Profile
                </DrawerLink>
              ) : null}
              <DrawerLink to="/settings" icon={SettingsIcon}>
                Settings
              </DrawerLink>
              {isAdmin ? (
                <DrawerLink to="/admin" icon={Shield}>
                  Admin
                </DrawerLink>
              ) : null}
            </nav>

            <div className="border-t border-gray-200 p-3 dark:border-gray-800">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
};

const MenuLink = ({ to, icon: Icon, children }) => (
  <Link
    to={to}
    role="menuitem"
    className="flex items-center gap-2 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
  >
    {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
    <span>{children}</span>
  </Link>
);

const DrawerLink = ({ to, icon: Icon, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
      )
    }
  >
    {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
    <span>{children}</span>
  </NavLink>
);

export default Navbar;
