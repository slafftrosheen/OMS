/// <reference types="svelte" />
/// <reference types="vite/client" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Locals {
      user?: {
        id: number;
        username: string;
        name: string;
        displayName: string;
        primarySection: string;
        sections: string[];
        roles: Record<string, string>;
        stations: string[];
        role: string; // Computed highest role
      };
    }
    // interface Error {}
    // interface PageData {}
    // interface Platform {}
  }
}

export {};
