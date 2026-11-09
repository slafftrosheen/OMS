import {createProviderModelHandlers} from '$lib/server/ai/provider-model-handler';
const handlers = createProviderModelHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
