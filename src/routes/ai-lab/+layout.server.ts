import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
// Preserve bookmarks and deep links from the old workspace.
export const load: LayoutServerLoad = ({ url }) => {
  const next = url.pathname.replace(/\/ai-lab(?=\/|$)/, '/toolkit');
  throw redirect(308, next + url.search + url.hash);
};