import { json, error, type RequestHandler } from '@sveltejs/kit';

async function checkDatabase(locals: App.Locals) {
  try {
    const { error } = await locals.supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    return {
      status: error ? 'error' : 'ok',
      message: error ? error.message : undefined
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: err.message
    };
  }
}

async function checkStorage(locals: App.Locals) {
  try {
    // Check if we can perform basic file operations
    // This could be extended to check actual storage provider connectivity
    const { data, error } = await locals.supabase.storage
      .from('public')
      .list('', { limit: 1 });
    
    return {
      status: error ? 'error' : 'ok',
      message: error ? error.message : undefined
    };
  } catch (err: any) {
    return {
      status: 'warning', // Storage might not be configured yet
      message: err.message
    };
  }
}

function checkMemory() {
  try {
    const used = process.memoryUsage();
    const heapUsedPercent = (used.heapUsed / used.heapTotal) * 100;
    
    return {
      status: heapUsedPercent < 80 ? 'ok' : 'warning',
      heapUsedPercent: Math.round(heapUsedPercent),
      details: {
        rss: used.rss,
        heapTotal: used.heapTotal,
        heapUsed: used.heapUsed,
        external: used.external
      }
    };
  } catch (err: any) {
    return {
      status: 'warning',
      message: err.message
    };
  }
}

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: await checkDatabase(locals),
        storage: await checkStorage(locals),
        memory: checkMemory()
      }
    };

    // Determine overall status based on individual checks
    if (
      checks.checks.database.status === 'error' ||
      checks.checks.storage.status === 'error'
    ) {
      checks.status = 'unhealthy';
    } else if (
      checks.checks.database.status === 'warning' ||
      checks.checks.storage.status === 'warning' ||
      checks.checks.memory.status === 'warning'
    ) {
      checks.status = 'degraded';
    }

    const statusCode = checks.status === 'healthy' ? 200 : 
                      checks.status === 'degraded' ? 206 : 503;
    
    return json(checks, { status: statusCode });
  } catch (err: any) {
    console.error('Health check failed:', err);
    throw error(500, 'Health check service unavailable');
  }
};
