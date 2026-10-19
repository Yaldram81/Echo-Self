import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabaseClient';
import { AuthContext, type AuthState } from './authContext';
import { profilesService } from './services';

/** Provides the verified session to the app. Hook: useAuth() from ./useAuth. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setState({ session: data.session, user: data.session?.user ?? null, loading: false });
          // Ensure profile exists for pre-migration users
          if (data.session?.user) {
            profilesService.ensureProfile().catch(console.warn);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState({ session: null, user: null, loading: false });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, user: session?.user ?? null, loading: false });
      // Ensure profile exists on login/signup
      if (session?.user) {
        profilesService.ensureProfile().catch(console.warn);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

