import { Link, Outlet } from 'react-router-dom';
import { Zap as Lightning } from 'lucide-react';

const AuthLayout = () => {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-gray-50 dark:bg-ww-void px-4 py-8 relative"
    >
      {/* Mesh backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 10% 15%, rgba(124,58,237,0.20) 0%, transparent 60%),' +
            'radial-gradient(ellipse 50% 40% at 90% 85%, rgba(236,72,153,0.14) 0%, transparent 60%)',
        }}
      />

      {/* Floating blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-32 -left-32 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgba(124,58,237,0.15)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-32 -right-32 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgba(236,72,153,0.12)' }}
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10">
        {/* Logo */}
        <Link
          to="/"
          className="mb-8 flex items-center gap-2.5 transition-opacity hover:opacity-85"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
              boxShadow: '0 4px 20px rgba(124,58,237,0.50)',
            }}
          >
            <Lightning className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <span
            className="text-xl font-bold"
            style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
          >
            <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Whisper
            </span>
            <span className="text-gray-900 dark:text-white">Wire</span>
          </span>
        </Link>

        {/* Card */}
        <main className="w-full max-w-md ww-scale-in">
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: 'rgba(22,22,42,0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(124,58,237,0.20)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(124,58,237,0.10)',
            }}
          >
            <Outlet />
          </div>
        </main>

        <div className="mt-6 flex flex-col items-center gap-1 text-xs" style={{ color: '#6b6b8a' }}>
          <p>© {new Date().getFullYear()} WhisperWire</p>
          <p style={{ color: '#9090b8' }}>
            Developer: <span className="font-semibold text-white">Anant Kumar Singh</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
