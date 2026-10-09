import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { planLumiGrid, LUMIGRID_CAPACITY } from '../../src/lib/server/ai/tools-registry/signage';
import { mayUseTool, type ToolRow } from '../../src/lib/server/ai/tools-registry';
import { isBlockedCrawlAddress, validatePublicCrawlUrl } from '../../src/lib/server/ai/tools-registry/web-search';
import { openRouterChat, type OpenRouterClientConfig } from '../../src/lib/server/ai/openrouter';

const src = (p: string) => readFileSync(p, 'utf8');
const fakeTool = (slug: string): ToolRow => ({
  slug, label: slug, description: null, icon: null, category: 'data', enabled: true,
  roles: [], stations: [], endpoint: '/api/ai/test',
  schema: { name: slug.replaceAll('.', '_'), parameters: { type: 'object' } }
});

describe('OMS-R04 LumiGrid hardware-contract math', () => {
  it('models 8 PWM and 8 addressable outputs independently', () => {
    expect(LUMIGRID_CAPACITY.pwm_outputs).toBe(8);
    expect(LUMIGRID_CAPACITY.addressable_lanes).toBe(8);
    const plan = planLumiGrid({
      channels: 8, channel_ma: 250, volts: 24, pwm_hz: 2000, pwm_bits: 12,
      addressable_lanes: 8, pixels_per_lane: 60, pixel_ma: 60, pixel_volts: 5
    });
    expect(plan.channels).toBe(8);
    expect(plan.addressable_lanes).toBe(8);
    expect(plan.pixels_total).toBe(480);
    expect(plan.peak_amps).toBe(2);
    expect(plan.psu_watts).toBe(60);
    expect(plan.addressable_peak_amps).toBe(28.8);
    expect(plan.addressable_psu_watts).toBe(180);
    expect(plan.total_psu_watts).toBe(240);
    expect(plan.timer_ok).toBeNull();
  });

  it('refuses an impossible lane/channel/pixel count instead of clamping', () => {
    expect(() => planLumiGrid({ channels: 9, channel_ma: 100 })).toThrow();
    expect(() => planLumiGrid({ channels: 1, channel_ma: 100, addressable_lanes: 9 })).toThrow();
    expect(() => planLumiGrid({ channels: 1, channel_ma: 100, addressable_lanes: 1, pixels_per_lane: 257, pixel_ma: 60, pixel_volts: 5 })).toThrow();
    expect(() => planLumiGrid({ channels: 1, channel_ma: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => planLumiGrid({ channels: 2, channel_ma: -1 })).toThrow();
  });

  it('requires datasheet-specific pixel current and volts', () => {
    expect(() => planLumiGrid({ channels: 0, channel_ma: 0, addressable_lanes: 1, pixels_per_lane: 50 })).toThrow();
    expect(() => planLumiGrid({ channels: 0, channel_ma: 0, addressable_lanes: 1, pixels_per_lane: 50, pixel_ma: 60, pixel_volts: 5 })).not.toThrow();
  });

  it('retains gamma LUT but never invents timer feasibility', () => {
    const plan = planLumiGrid({ channels: 2, channel_ma: 500 });
    expect(plan.gamma_lut_preview).toHaveLength(8);
    expect(plan.timer_ok).toBeNull();
    expect(plan.warnings.join(' ')).toContain('not been verified');
  });
});

describe('OMS-R04 tool authorization boundary', () => {
  it('hides management-only data tools from regular operators', () => {
    expect(mayUseTool(fakeTool('data.pending_orders'), { role: 'Operator' })).toBe(false);
    expect(mayUseTool(fakeTool('data.low_stock'), { role: 'StationHead' })).toBe(false);
    expect(mayUseTool(fakeTool('data.low_stock'), { role: 'RD' })).toBe(true);
  });

  it('never autonomously saves maker sketches or executes unknown DB endpoints', () => {
    expect(mayUseTool(fakeTool('maker.save_sketch'), { role: 'RD' })).toBe(false);
    expect(mayUseTool(fakeTool('evil.remote_exec'), { role: 'RD' })).toBe(false);
    expect(mayUseTool({ ...fakeTool('signage.lumigrid'), enabled: false }, { role: 'RD' })).toBe(false);
  });

  it('enforces station and per-tool role constraints', () => {
    const restricted: ToolRow = { ...fakeTool('signage.lumigrid'), roles: ['StationHead'], stations: ['CNC'] };
    expect(mayUseTool(restricted, { role: 'StationHead', station: 'CNC' })).toBe(true);
    expect(mayUseTool(restricted, { role: 'StationHead', station: 'PAINT' })).toBe(false);
    expect(mayUseTool(restricted, { role: 'Operator', station: 'CNC' })).toBe(false);
  });

  it('executes OMS reads under request-scoped RLS and not a service-role client', () => {
    expect(src('src/lib/server/ai/tools-registry/data-tools.ts')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src('src/lib/server/ai/tools-registry/maker-tools.ts')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src('src/lib/server/ai/tools-registry/cnc-feeds.ts')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src('src/lib/server/ai/tools-registry/paint-match.ts')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(src('src/routes/api/ai/station/cnc-feeds/+server.ts')).toContain('locals.supabase');
    expect(src('src/routes/api/ai/station/paint-match/+server.ts')).toContain('locals.supabase');
    expect(src('src/lib/server/ai/tools-registry/index.ts')).toContain('ctx.supabase');
    const chat = src('src/routes/api/ai/sessions/[id]/messages/+server.ts');
    expect(chat).toContain('allowedTools.get(call.function.name)');
    expect(chat).toContain('parseToolArguments');
    expect(chat).toContain('supabase: db');
    expect(chat).not.toContain('findToolBySchemaName(call.function.name)');
    expect(chat).toContain('aiRateLimit(rateLimitIdentifier(event))');
  });

  it('ignores spoofed role query arguments in the UI registry', () => {
    const route = src('src/routes/api/ai/tools/+server.ts');
    expect(route).toContain('locals.user.role');
    expect(route).not.toContain("url.searchParams.get('role')");
  });
});

describe('OMS-R04 URL crawling and provider safeguards', () => {
  it('blocks Tailnet, private and metadata networks, including mapped IPv4', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '192.168.1.5',
      '100.100.100.100', '169.254.169.254', '172.31.1.1',
      '::1', 'fd00::1', '::ffff:192.168.1.7', '203.0.113.7']) {
      expect(isBlockedCrawlAddress(address), address).toBe(true);
    }
    expect(isBlockedCrawlAddress('8.8.8.8')).toBe(false);
    expect(isBlockedCrawlAddress('2606:4700::1111')).toBe(false);
  });

  it('denies local crawl destinations without network access', async () => {
    await expect(validatePublicCrawlUrl('http://localhost/admin')).rejects.toThrow();
    await expect(validatePublicCrawlUrl('https://foo.internal/')).rejects.toThrow();
    await expect(validatePublicCrawlUrl('http://127.0.0.1/')).rejects.toThrow();
    await expect(validatePublicCrawlUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('never auto follows model-supplied redirects into local services', () => {
    expect(src('src/lib/server/ai/tools-registry/web-search.ts')).toContain("redirect: 'manual'");
  });

  it('bounds OpenRouter stream lifetime even after response headers', async () => {
    const config: OpenRouterClientConfig = {
      apiKey: 'fake-test-key', baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'openrouter/free', visionModel: 'unused',
      timeoutMs: 5000
    };
    let suppliedSignal: AbortSignal | undefined;
    const fakeFetch: typeof fetch = async (_input, init) => {
      suppliedSignal = init?.signal as AbortSignal;
      return new Response('{}', { status: 200 });
    };
    const out = await openRouterChat({
      messages: [{ role: 'user', content: 'ping' }], stream: true
    }, config, fakeFetch);
    expect(out.response.ok).toBe(true);
    expect(suppliedSignal).toBeDefined();
    expect(typeof suppliedSignal?.addEventListener).toBe('function');
    expect(suppliedSignal?.aborted).toBe(false);
  });

  it('separates passive provider configuration from an explicit RD-only inference probe', () => {
    const route = src('src/routes/api/ai/health/+server.ts');
    expect(route).toContain('export const GET');
    expect(route).toContain('export const POST');
    expect(route).toContain("locals.user.role !== 'RD'");
    expect(route).toContain("connectivity: 'not_tested'");
  });
});
