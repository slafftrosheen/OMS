import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

// The Toolkit root opens the real Canvas workspace, respecting base-path deploys.
export const load: PageServerLoad = () => { throw redirect(307, `${base}/toolkit/canvas`); };
