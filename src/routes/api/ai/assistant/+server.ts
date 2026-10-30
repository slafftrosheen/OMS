import { error, json, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { aiRateLimit, rateLimitIdentifier } from '$lib/server/api/helpers';
import { listTools, executeTool, normalizeToolStation } from '$lib/server/ai/tools-registry';
import { openRouterChat } from '$lib/server/ai/openrouter';
import { screenAssistantRequest, selectScreenTools, runScreenAssistant, AssistantToolsUnsupported } from '$lib/server/ai/screen-assistant';

const headers = { 'Cache-Control': 'private, no-store' };
function stationFor(path: string, user: NonNullable<App.Locals['user']>) {
  const station = normalizeToolStation(/^\/station\/([a-z_]+)\/?$/i.exec(path)?.[1]);
  if (station && !['RD','Boss','HeadOfProduction'].includes(user.role) &&
    !user.stations?.some(assignment => normalizeToolStation(assignment.stationId) === station)) {
    throw error(403, 'Station assignment required');
  }
  return station;
}

export function _createAssistantHandlers(dependencies = { listTools, executeTool, openRouterChat }) {
  const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const path = url.searchParams.get('path') ?? '/';
    if (path.length > 300 || !/^\/(?!\/)[^?#]*$/.test(path)) throw error(400, 'Invalid screen path');
    const station = stationFor(path, locals.user);
    const available = selectScreenTools(await dependencies.listTools({ role: locals.user.role, station }), path);
    return json({ tools: available.map(tool => ({ id: tool.slug, label: tool.label })) }, { headers });
  };
  const POST: RequestHandler = async event => {
    const { request, locals } = event;
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');
    aiRateLimit(rateLimitIdentifier(event));
    const raw = await request.text();
    if (raw.length > 42000) throw error(413, 'Assistant context is too large');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw error(400, 'Invalid assistant request'); }
    const parsed = screenAssistantRequest.safeParse(body);
    if (!parsed.success) throw error(400, 'Invalid assistant request or consent');
    const input = parsed.data;
    if (JSON.stringify(input.screen.data).length > 14000) throw error(413, 'Screen context is too large');
    const station = stationFor(input.screen.path, user);
    const available = await dependencies.listTools({ role: user.role, station });
    try {
      const result = await runScreenAssistant(input, {
        tools: available, locale: input.language, signal: request.signal,
        chat: async (messages, tools, final) => {
          const { response } = await dependencies.openRouterChat({ messages, tools,
            toolChoice: final ? 'none' : 'auto', stream: false, temperature: 0.3,
            maxTokens: 2200, timeoutMs: 60000, signal: request.signal });
          if (!response.ok) {
            if (response.status === 429) throw error(429, 'Assistant rate limit reached. Try again later.');
            if (tools.length && [400,404,422].includes(response.status)) {
              const detail = await response.text();
              if (/tool|no endpoints/i.test(detail)) throw new AssistantToolsUnsupported();
            }
            throw new Error('Assistant provider unavailable');
          }
          const result = await response.json();
          return result?.choices?.[0]?.message ?? {};
        },
        execute: async (tool, args) => {
          // Re-read registry permissions for each call; context can never grant access.
          const current = await dependencies.listTools({ role: user.role, station });
          if (!selectScreenTools(current, input.screen.path).some(item => item.slug === tool.slug)) throw new Error('Tool no longer available');
          return dependencies.executeTool(tool.slug, args, { userId: user.id, role: user.role,
            stations: user.stations?.map(assignment => assignment.stationId.toUpperCase()),
            station, signal: request.signal, supabase: locals.supabase });
        }
      });
      return json(result, { headers });
    } catch (err) {
      if (isHttpError(err)) throw err;
      return json({ error: 'Assistant unavailable. Try again or continue working.' }, { status: 503, headers });
    }
  };
  return { GET, POST };
}
export const { GET, POST } = _createAssistantHandlers();
