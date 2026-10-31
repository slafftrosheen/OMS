const en = {
  send: 'Send', sending: 'Sending…', sendFailed: 'Your message was not confirmed as sent. The draft is still here; try again.',
  keyboardHint: 'Enter to send · Shift + Enter for a new line',
  loading: 'Loading messages…', loadFailed: 'Messages could not be refreshed. Your draft is safe.',
  loadingOlder: 'Loading earlier messages…', olderFailed: 'Earlier messages could not be loaded.',
  loadOlder: 'Load earlier messages', retry: 'Try again', beginning: 'Beginning of this conversation',
  room: 'Conversation', noRooms: 'No conversations available', direct: 'Direct messages',
  today: 'Today', yesterday: 'Yesterday', system: 'System', unknown: 'Team member',
  empty: 'No messages yet. Send a message to start the conversation.',
  teamChat: 'Team chat', openChat: 'Open chat', close: 'Close', message: 'Message',
  speed: 'Playback speed', voiceRemaining: 'Voice expires at the time shown. Text remains in the conversation.'
};
export type ConversationCopy = typeof en;
const lv: ConversationCopy = {
  send: 'Sūtīt', sending: 'Sūta…', sendFailed: 'Ziņas nosūtīšana nav apstiprināta. Melnraksts ir saglabāts šeit; mēģiniet vēlreiz.',
  keyboardHint: 'Enter — sūtīt · Shift + Enter — jauna rinda',
  loading: 'Ielādē ziņas…', loadFailed: 'Ziņas neizdevās atjaunināt. Jūsu melnraksts ir saglabāts.',
  loadingOlder: 'Ielādē agrākās ziņas…', olderFailed: 'Agrākās ziņas neizdevās ielādēt.',
  loadOlder: 'Ielādēt agrākās ziņas', retry: 'Mēģināt vēlreiz', beginning: 'Sarunas sākums',
  room: 'Saruna', noRooms: 'Nav pieejamu sarunu', direct: 'Privātās sarunas',
  today: 'Šodien', yesterday: 'Vakar', system: 'Sistēma', unknown: 'Komandas dalībnieks',
  empty: 'Vēl nav ziņu. Nosūtiet ziņu, lai sāktu sarunu.',
  teamChat: 'Komandas sarunas', openChat: 'Atvērt sarunas', close: 'Aizvērt', message: 'Ziņa',
  speed: 'Atskaņošanas ātrums', voiceRemaining: 'Balss ieraksts pieejams līdz norādītajam laikam. Teksts paliek sarunā.'
};
const ru: ConversationCopy = {
  send: 'Отправить', sending: 'Отправка…', sendFailed: 'Отправка сообщения не подтверждена. Черновик сохранён здесь; повторите попытку.',
  keyboardHint: 'Enter — отправить · Shift + Enter — новая строка',
  loading: 'Загрузка сообщений…', loadFailed: 'Не удалось обновить сообщения. Черновик сохранён.',
  loadingOlder: 'Загрузка ранних сообщений…', olderFailed: 'Не удалось загрузить ранние сообщения.',
  loadOlder: 'Загрузить ранние сообщения', retry: 'Повторить', beginning: 'Начало переписки',
  room: 'Переписка', noRooms: 'Нет доступных переписок', direct: 'Личные сообщения',
  today: 'Сегодня', yesterday: 'Вчера', system: 'Система', unknown: 'Участник команды',
  empty: 'Пока нет сообщений. Отправьте сообщение, чтобы начать переписку.',
  teamChat: 'Чат команды', openChat: 'Открыть чат', close: 'Закрыть', message: 'Сообщение',
  speed: 'Скорость воспроизведения', voiceRemaining: 'Голосовая запись доступна до указанного времени. Текст остаётся в переписке.'
};
export function conversationCopy(locale: string | null | undefined): ConversationCopy {
  return locale?.toLowerCase().startsWith('lv') ? lv : locale?.toLowerCase().startsWith('ru') ? ru : en;
}
