import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Globe2,
  Lock,
  MessagesSquare,
  Sparkles,
  Users,
  Zap,
  Zap as Lightning,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext.jsx';
import Spinner from '../components/common/Spinner.jsx';
import { ROUTES } from '../utils/constants.js';

const FEATURES = [
  {
    icon: Zap,
    title: 'Real-time messaging',
    description:
      'Powered by Socket.io with sub-100ms delivery, typing indicators and read receipts.',
  },
  {
    icon: Users,
    title: 'Group conversations',
    description:
      'Create rooms with up to 100 members, share images and stay in sync across devices.',
  },
  {
    icon: BellRing,
    title: 'Smart notifications',
    description:
      'Browser, sound and in-app alerts you can fine-tune per channel — never miss what matters.',
  },
  {
    icon: Lock,
    title: 'Privacy first',
    description:
      'JWT auth, hashed passwords, rate limiting and granular block controls keep you safe.',
  },
  {
    icon: Globe2,
    title: 'Works anywhere',
    description:
      'Responsive UI tuned for mobile, tablet and desktop with full dark mode support.',
  },
  {
    icon: Sparkles,
    title: 'Built for speed',
    description:
      'React 19, Vite and Tailwind v4 — fast on first paint, faster on every interaction.',
  },
];

/* ── WhisperWire Logo Mark ─────────────────────────────────────── */
const LogoMark = ({ size = 8 }) => (
  <span
    className={`inline-flex h-${size} w-${size} items-center justify-center rounded-xl ww-gradient-bg shadow-lg`}
    style={{ boxShadow: '0 4px 16px rgba(124,58,237,0.45)' }}
  >
    <Lightning className={`h-${size / 2} w-${size / 2} text-white`} aria-hidden="true" />
  </span>
);

/* ── Hero Illustration ─────────────────────────────────────────── */
const HeroIllustration = () => (
  <svg
    viewBox="0 0 480 360"
    role="img"
    aria-labelledby="heroIllustrationTitle"
    className="h-full w-full"
  >
    <title id="heroIllustrationTitle">
      Illustration of overlapping chat bubbles representing live conversation
    </title>
    <defs>
      <linearGradient id="heroBg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.20" />
        <stop offset="100%" stopColor="#ec4899" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="bubbleOwn2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
      <filter id="glow2">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <circle cx="240" cy="180" r="170" fill="url(#heroBg2)" />

    {/* Floating dots */}
    <g opacity="0.7">
      <circle cx="80"  cy="60"  r="3" fill="#8b5cf6" />
      <circle cx="420" cy="90"  r="4" fill="#ec4899" opacity="0.7" />
      <circle cx="60"  cy="280" r="3" fill="#8b5cf6" opacity="0.6" />
      <circle cx="430" cy="300" r="2" fill="#ec4899" />
      <circle cx="380" cy="40"  r="2" fill="#a78bfa" />
    </g>

    {/* Others bubble */}
    <rect
      x="60" y="80" width="220" height="70" rx="20"
      fill="rgba(255,255,255,0.06)"
      stroke="rgba(124,58,237,0.25)" strokeWidth="1.5"
    />
    <circle cx="92" cy="115" r="14" fill="rgba(124,58,237,0.25)" />
    <text x="86" y="120" fill="#a78bfa" fontSize="14" fontWeight="600" fontFamily="Inter, sans-serif">
      A
    </text>
    <rect x="118" y="100" width="140" height="9" rx="5" fill="rgba(255,255,255,0.12)" />
    <rect x="118" y="118" width="100" height="9" rx="5" fill="rgba(255,255,255,0.08)" />

    {/* Own bubble (gradient) */}
    <rect x="200" y="170" width="220" height="70" rx="20" fill="url(#bubbleOwn2)" filter="url(#glow2)" />
    <rect x="220" y="190" width="160" height="9" rx="5" fill="white" opacity="0.85" />
    <rect x="220" y="208" width="120" height="9" rx="5" fill="white" opacity="0.60" />

    {/* Others bubble 2 */}
    <rect
      x="60" y="250" width="200" height="70" rx="20"
      fill="rgba(255,255,255,0.06)"
      stroke="rgba(124,58,237,0.25)" strokeWidth="1.5"
    />
    <circle cx="92" cy="285" r="14" fill="rgba(236,72,153,0.20)" />
    <text x="87" y="290" fill="#f472b6" fontSize="14" fontWeight="600" fontFamily="Inter, sans-serif">
      M
    </text>
    <rect x="118" y="270" width="120" height="9" rx="5" fill="rgba(255,255,255,0.12)" />
    <rect x="118" y="288" width="80" height="9" rx="5" fill="rgba(255,255,255,0.08)" />

    {/* Typing bubble animated */}
    <g transform="translate(360 280)" filter="url(#glow2)">
      <circle r="22" fill="url(#bubbleOwn2)" />
      <circle r="22" fill="url(#bubbleOwn2)" opacity="0.3">
        <animate attributeName="r" values="22;32;22" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="-7" cy="0" r="2.5" fill="white" />
      <circle cx="0"  cy="0" r="2.5" fill="white" />
      <circle cx="7"  cy="0" r="2.5" fill="white" />
    </g>
  </svg>
);

/* ── Landing Page ──────────────────────────────────────────────── */
const LandingPage = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <Spinner fullPage size="lg" />;
  if (isAuthenticated) return <Navigate to={ROUTES.CHAT} replace />;

  const year = new Date().getFullYear();

  return (
    <div
      className="h-full overflow-y-auto bg-gray-50 dark:bg-ww-void text-gray-900 dark:text-white scrollbar-hide"
    >
      {/* ── Mesh backdrop ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 15% 20%, rgba(124,58,237,0.18) 0%, transparent 60%),' +
            'radial-gradient(ellipse 50% 40% at 85% 80%, rgba(236,72,153,0.12) 0%, transparent 60%)',
        }}
      />

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 ww-glass"
        style={{ borderBottom: '1px solid rgba(124,58,237,0.18)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <LogoMark size={8} />
            <span
              className="text-lg font-bold"
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
            >
              <span className="ww-gradient-text">Whisper</span>
              <span className="text-gray-900 dark:text-white">Wire</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to={ROUTES.LOGIN}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ color: '#a78bfa' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.background = ''; }}
            >
              Sign in
            </Link>
            <Link
              to={ROUTES.REGISTER}
              className="hidden sm:inline-flex ww-btn-primary items-center gap-1.5 text-sm"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Main ── */}
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:items-center">
            <div className="text-center lg:text-left ww-slide-up">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: 'rgba(124,58,237,0.35)',
                  background: 'rgba(124,58,237,0.10)',
                  color: '#c4b5fd',
                }}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Now with real-time presence
              </span>

              <h1
                className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
                style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
              >
                <span className="text-white">Conversations that feel</span>{' '}
                <span className="ww-gradient-text">instant</span>
                <span className="text-white">.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed sm:text-lg lg:mx-0" style={{ color: '#9090b8' }}>
                A modern chat experience built for teams, communities and friends.
                Real-time messaging, group rooms and a polished interface — without the bloat.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  to={ROUTES.CHAT}
                  className="group inline-flex items-center justify-center gap-2 ww-btn-primary ww-shimmer text-sm"
                >
                  <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                  <span>Open Chat</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link
                  to={ROUTES.REGISTER}
                  className="inline-flex items-center justify-center gap-2 ww-btn-ghost text-sm"
                >
                  Create an account
                </Link>
              </div>

              <p className="mt-4 text-xs" style={{ color: '#6b6b8a' }}>
                Free forever for personal use • No credit card required
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none ww-float">
              <div className="relative aspect-4/3 w-full">
                <HeroIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          aria-labelledby="featuresHeading"
          style={{ borderTop: '1px solid rgba(124,58,237,0.12)', background: 'rgba(22,22,42,0.5)' }}
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="featuresHeading"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
              >
                <span className="ww-gradient-text">Everything</span>
                <span className="text-white"> you need to stay in touch</span>
              </h2>
              <p className="mt-3 text-base leading-relaxed" style={{ color: '#9090b8' }}>
                Thoughtful defaults, fast performance and zero noise. WhisperWire ships with
                the features you&apos;d expect — and none of the ones you wouldn&apos;t.
              </p>
            </div>

            <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li
                  key={title}
                  className="group rounded-2xl p-6 transition-all duration-300 ww-glass-light cursor-default"
                  style={{ border: '1px solid rgba(124,58,237,0.12)' }}
                  onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(124,58,237,0.30)'; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(124,58,237,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.border = '1px solid rgba(124,58,237,0.12)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ww-gradient-bg">
                    <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: '#9090b8' }}>
                    {description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-14 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(236,72,153,0.18) 100%)',
              border: '1px solid rgba(124,58,237,0.30)',
              boxShadow: '0 0 80px rgba(124,58,237,0.15), inset 0 0 40px rgba(124,58,237,0.05)',
            }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(124,58,237,0.20)' }} />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,0.15)' }} />

            <h2
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
              style={{ fontFamily: "'Plus Jakarta Sans', Inter, sans-serif" }}
            >
              Ready to start chatting?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: '#c4b5fd' }}>
              Jump straight into the conversation. It only takes a few seconds.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={ROUTES.CHAT}
                className="group inline-flex items-center justify-center gap-2 ww-btn-primary ww-shimmer text-sm"
              >
                <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                <span>Open Chat</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link
                to={ROUTES.LOGIN}
                className="inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.25)', color: '#e2e2f0' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-10" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <p className="text-sm" style={{ color: '#9090b8' }}>
            &copy; {year} WhisperWire. All rights reserved.
          </p>
          <p className="text-sm" style={{ color: '#c4b5fd' }}>
            Designed & Built by <span className="font-semibold text-white">Anant Kumar Singh</span>
          </p>
          <div className="flex items-center gap-6 text-sm" style={{ color: '#6b6b8a' }}>
            <span className="hover:text-white transition-colors cursor-not-allowed">Terms</span>
            <span className="hover:text-white transition-colors cursor-not-allowed">Privacy</span>
            <span className="hover:text-white transition-colors cursor-not-allowed">Status</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
