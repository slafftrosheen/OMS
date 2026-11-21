const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTelegramOrderId(value: unknown): value is string {
  return typeof value === 'string' && orderIdPattern.test(value);
}

export function telegramOrderLaunchPath(id: unknown): string | null {
  return isTelegramOrderId(id) ? '/telegram?view=order&id=' + encodeURIComponent(id) : null;
}

export function telegramLaunchDestination(params: URLSearchParams): string | null {
  switch (params.get('view')) {
    case 'chat': return '/chat';
    case 'notifications': return '/notifications';
    case 'orders': return '/orders';
    case 'calendar': return '/calendar';
    case 'order': {
      const id = params.get('id');
      return isTelegramOrderId(id) ? '/orders/' + encodeURIComponent(id) : null;
    }
    default: return null;
  }
}

/** A notification can only navigate inside OMS. */
export function telegramNotificationPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const original = new URL(value, 'https://oms.invalid');
    return original.origin === 'https://oms.invalid' ? original.pathname + original.search + original.hash : null;
  } catch { return null; }
}
