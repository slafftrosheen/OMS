/** Client-only pairing data. Never persist or log these one-time credentials. */
export interface TelegramOnboardingLinks {
  url: string;
  webUrl: string;
  command: string;
  botUsername: string;
}

/** Only derive launch options from the authenticated endpoint's expected bot. */
export function telegramOnboardingLinks(value: unknown, expectedBotUsername: unknown): TelegramOnboardingLinks | null {
  if (typeof value !== 'string' || value !== value.trim() ||
    typeof expectedBotUsername !== 'string' || !/^[A-Za-z0-9_]{5,32}$/.test(expectedBotUsername) ||
    !/bot$/i.test(expectedBotUsername)) return null;
  try {
    const url = new URL(value);
    const token = url.searchParams.get('start');
    // Match createTelegramLinkToken/readTelegramCommand: 32 bytes, base64url (43 characters).
    if (url.origin !== 'https://t.me' || url.username || url.password || url.hash ||
      url.pathname !== `/${expectedBotUsername}` || [...url.searchParams].length !== 1 ||
      !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const address = `tg://resolve?${new URLSearchParams({ domain: expectedBotUsername, start: token })}`;
    // Web K processes tgaddr internally. The browser navigates only to HTTPS,
    // so no installed application or OS tg:// handler is needed. Keep the
    // payload in the fragment, not in the HTTP request query or referrer.
    return {
      url: url.href,
      webUrl: `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(address)}`,
      command: `/start ${token}`,
      botUsername: expectedBotUsername
    };
  } catch {
    return null; // URL errors may contain the credential; do not propagate them.
  }
}

/** HTTP/Tailscale origins may not expose Clipboard; the UI must offer manual selection. */
export async function copyTelegramCommand(command: string, clipboard?: Pick<Clipboard, 'writeText'>): Promise<boolean> {
  if (!/^\/start [A-Za-z0-9_-]{43}$/.test(command) || !clipboard) return false;
  try {
    await clipboard.writeText(command);
    return true;
  } catch {
    return false;
  }
}
