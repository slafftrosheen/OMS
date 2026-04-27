// /ai-dashboard → /ai-lab. The legacy single-pane dashboard was superseded
// by the multi-surface Reclame AI Lab. Keep this redirect so old bookmarks
// and any embedded links keep working.

import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';

export const prerender = false;

export const load = () => {
    throw redirect(308, `${base}/ai-lab`);
};
