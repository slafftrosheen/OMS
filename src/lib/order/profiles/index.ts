import Profile7st from './Profile7st.svelte';

// Profile types for order forms
export type ProfileType = '7st' | 'future_profile_2' | 'future_profile_3';

export interface ProfileConfig {
  id: ProfileType;
  name: string;
  component: any;
  icon?: string;
}

export interface ProfileData {
  id: string;
  type: ProfileType;
  data: any;
}

// Registry of available profile types
export const PROFILE_REGISTRY: ProfileConfig[] = [
  { 
    id: '7st', 
    name: 'Profile 7st - Outdoor/Indoor Sign', 
    component: Profile7st 
  }
];
