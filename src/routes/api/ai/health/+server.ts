import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
  const isConfigured = !!env.DASHSCOPE_API_KEY;
  
  return json({
    status: isConfigured ? 'ok' : 'missing_config',
    service: 'DashScope/Qwen',
    model: env.QWEN_MODEL || 'qwen-plus',
    timestamp: new Date().toISOString()
  });
};
