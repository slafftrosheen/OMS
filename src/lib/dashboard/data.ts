type RequestOptions = { fetcher?: typeof fetch; basePath?: string; signal?: AbortSignal };

export type DashboardData = {
  orders: any[];
  verifiedTotal: number | null;
  ordersError: boolean;
  kpis: { total: number; active: number; today: number; completedToday: number } | null;
  trends: { dates: string[]; total: number[] } | null;
};

/** Independent dashboard panels share a load lifetime, without a request waterfall. */
export async function loadDashboard({ fetcher = fetch, basePath = '', signal }: RequestOptions = {}): Promise<DashboardData> {
  const read = async (path: string) => {
    try {
      const response = await fetcher(`${basePath}${path}`, { signal });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const [orderResponse, kpiResponse, trendResponse] = await Promise.all([
    read('/api/orders?limit=5'),
    read('/api/analytics?type=kpis'),
    read('/api/analytics?type=trends&period=30')
  ]);
  const rows = Array.isArray(orderResponse?.data) ? orderResponse.data
    : Array.isArray(orderResponse?.orders) ? orderResponse.orders
    : Array.isArray(orderResponse) ? orderResponse : null;
  const kpis = kpiResponse?.data?.orders;
  const trends = trendResponse?.data;
  return {
    ordersError: rows === null,
    verifiedTotal: typeof orderResponse?.count === 'number' && Number.isFinite(orderResponse.count) ? orderResponse.count : null,
    orders: (rows ?? []).slice(0, 5).filter((order: unknown) => order && typeof order === 'object').map((order: any) => ({
      ...order,
      po_number: order.po_number ?? order.poNumber ?? '',
      client: order.client ?? order.clientName ?? '',
      due_date: order.due_date ?? order.deadline ?? '',
      loading_date: order.loading_date ?? order.loadingDate ?? null,
      badges: order.badges ?? [],
      status: String(order.status ?? '').toLowerCase(),
      priority: order.priority ?? 'NORMAL',
      progress_percentage: order.progress_percentage ?? 0
    })),
    kpis: kpis && [kpis.total, kpis.active, kpis.today, kpis.completedToday]
      .every(value => typeof value === 'number' && Number.isFinite(value))
      ? { total: kpis.total, active: kpis.active, today: kpis.today, completedToday: kpis.completedToday } : null,
    trends: Array.isArray(trends?.dates) && Array.isArray(trends?.total)
      && trends.dates.length === trends.total.length
      && trends.dates.every((value: unknown) => typeof value === 'string')
      && trends.total.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))
      ? { dates: trends.dates, total: trends.total } : null
  };
}
