import { useCallback, useEffect, useState } from 'react';
import { AuthView, type AuthMode } from './components/AuthView';
import { LandingPage } from './components/LandingPage';
import { OfflinePage } from './components/OfflinePage';
import { OwnerDashboard } from './components/OwnerDashboard';
import { PublicQrPage } from './components/PublicQrPage';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { api, getStoredToken, setStoredToken } from './lib/api';
import type { UserProfile } from './types';

type RouteState =
  | { view: 'landing' }
  | { view: 'auth'; mode: AuthMode }
  | { view: 'dashboard' }
  | { view: 'public-tag'; slug: string }
  | { view: 'offline' };

function parseLocation(pathname: string): RouteState {
  if (pathname.startsWith('/t/')) {
    const slug = pathname.slice(3).split('/')[0]?.trim();
    if (slug) return { view: 'public-tag', slug };
  }
  if (pathname === '/login') return { view: 'auth', mode: 'login' };
  if (pathname === '/signup') return { view: 'auth', mode: 'signup' };
  if (pathname === '/forgot-password') return { view: 'auth', mode: 'forgot' };
  if (pathname === '/dashboard') return { view: 'dashboard' };
  if (pathname === '/offline') return { view: 'offline' };
  return { view: 'landing' };
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [route, setRoute] = useState<RouteState>(() => parseLocation(window.location.pathname));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const navigate = useCallback((path: string, nextRoute: RouteState) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseLocation(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setAuthChecked(true);
      return;
    }
    const token = getStoredToken();
    if (!token) {
      // Still attempt cookie-backed session check cleanly
      api
        .getMe()
        .then((res) => setUser(res.user))
        .catch(() => setUser(null))
        .finally(() => setAuthChecked(true));
      return;
    }

    api
      .getMe()
      .then((res) => setUser(res.user))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, [isOnline]);

  if (!isOnline || route.view === 'offline') {
    return (
      <OfflinePage
        onRetry={() => {
          if (navigator.onLine) {
            if (route.view === 'offline') {
              navigate('/', { view: 'landing' });
            } else {
              window.location.reload();
            }
          }
        }}
      />
    );
  }

  if (route.view === 'public-tag') {
    return (
      <PublicQrPage
        slug={route.slug}
        onGoHome={() => navigate('/', { view: 'landing' })}
      />
    );
  }

  if (route.view === 'auth') {
    return (
      <AuthView
        initialMode={route.mode}
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          navigate('/dashboard', { view: 'dashboard' });
        }}
        onBackHome={() => navigate('/', { view: 'landing' })}
      />
    );
  }

  if (route.view === 'dashboard') {
    if (!authChecked) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
          <div className="text-sm font-medium text-slate-500">Loading TAGBACKLY...</div>
        </div>
      );
    }
    if (!user) {
      return (
        <AuthView
          initialMode="login"
          onSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            navigate('/dashboard', { view: 'dashboard' });
          }}
          onBackHome={() => navigate('/', { view: 'landing' })}
        />
      );
    }
    return (
      <OwnerDashboard
        user={user}
        onUserUpdated={setUser}
        onSignedOut={() => {
          setUser(null);
          navigate('/', { view: 'landing' });
        }}
        onGoHome={() => navigate('/', { view: 'landing' })}
        onOpenPublicPreview={(slug) => navigate(`/t/${slug}`, { view: 'public-tag', slug })}
      />
    );
  }

  return (
    <LandingPage
      isAuthenticated={Boolean(user)}
      onGoAuth={(mode) => navigate(mode === 'signup' ? '/signup' : '/login', { view: 'auth', mode })}
      onGoDashboard={() => navigate('/dashboard', { view: 'dashboard' })}
      onOpenTagSlug={(slug) => navigate(`/t/${slug}`, { view: 'public-tag', slug })}
    />
  );
}
