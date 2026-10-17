import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthState {
  /** Null while the first session check is still running. */
  session: Session | null;
  user: User | null;
  /** True until the initial session lookup completes. */
  loading: boolean;
}

export const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
});
