const en = { all: 'All', active: 'Active', draft: 'Drafts', completed: 'Completed', urgent: 'Needs attention', actions: 'List actions', reset: 'Clear filters', exportCsv: 'Export filtered list (CSV)' };
const ru: typeof en = { all: 'Все', active: 'В работе', draft: 'Черновики', completed: 'Завершённые', urgent: 'Требуют внимания', actions: 'Действия со списком', reset: 'Сбросить фильтры', exportCsv: 'Экспорт списка с фильтрами (CSV)' };
const lv: typeof en = { all: 'Visi', active: 'Aktīvie', draft: 'Melnraksti', completed: 'Pabeigtie', urgent: 'Jāpievērš uzmanība', actions: 'Saraksta darbības', reset: 'Notīrīt filtrus', exportCsv: 'Eksportēt filtrēto sarakstu (CSV)' };
export function orderListCopy(locale: unknown) { return locale === 'ru' ? ru : locale === 'lv' ? lv : en; }
