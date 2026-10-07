// Vitest runs outside SvelteKit, so its virtual $env module is unavailable.
// Browser-facing clients already provide safe fallbacks for every value used
// in unit tests.
export const env: Record<string, string | undefined> = {};
