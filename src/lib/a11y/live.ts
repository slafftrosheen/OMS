import { liveText } from '$lib/a11y/store';

export function announce(message: string) {
  liveText.set('');
  setTimeout(() => liveText.set(message), 30);
}
