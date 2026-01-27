// src/lib/stores/auth.ts
import { writable, derived } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    avatar_url?: string;
    roles: {
        Admin?: 'SuperAdmin' | 'Admin';
        Production?: 'ProductionManager' | 'Operator';
        Design?: 'Designer' | 'Viewer';
    };
    notification_preferences?: {
        email: boolean;
        push: boolean;
        dailyDigest: boolean;
        dueDateReminders: boolean;
    };
}

interface AuthState {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
}

function createAuthStore() {
    const { subscribe, set, update } = writable<AuthState>({
        user: null,
        profile: null,
        session: null,
        loading: true
    });

    return {
        subscribe,
        setUser: (user: User | null, profile: UserProfile | null, session: Session | null) => {
            set({ user, profile, session, loading: false });
        },
        setLoading: (loading: boolean) => {
            update(state => ({ ...state, loading }));
        },
        updateProfile: (profile: Partial<UserProfile>) => {
            update(state => ({
                ...state,
                profile: state.profile ? { ...state.profile, ...profile } : null
            }));
        },
        signOut: () => {
            set({ user: null, profile: null, session: null, loading: false });
        }
    };
}

export const auth = createAuthStore();

// Derived stores
export const isAuthenticated = derived(auth, $auth => !!$auth.user);
export const currentUser = derived(auth, $auth => $auth.user);
export const currentProfile = derived(auth, $auth => $auth.profile);

export const isAdmin = derived(auth, $auth => 
    !!$auth.profile?.roles?.Admin
);

export const isSuperAdmin = derived(auth, $auth => 
    $auth.profile?.roles?.Admin === 'SuperAdmin'
);

export const hasRole = derived(auth, $auth => ({
    admin: !!$auth.profile?.roles?.Admin,
    production: !!$auth.profile?.roles?.Production,
    design: !!$auth.profile?.roles?.Design
}));