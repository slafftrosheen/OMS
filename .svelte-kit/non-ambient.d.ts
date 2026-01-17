
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/dashboard" | "/admin/materials" | "/admin/users" | "/api" | "/api/audit-log" | "/api/auth" | "/api/auth/password" | "/api/calendar" | "/api/calendar/capacity" | "/api/calendar/[id]" | "/api/chat" | "/api/chat/messages" | "/api/delivery-presets" | "/api/draft-orders" | "/api/draft-orders/generate-po" | "/api/draft-orders/[id]" | "/api/draft-orders/[id]/approve" | "/api/draft-orders/[id]/change-requests" | "/api/draft-orders/[id]/change-requests/[crId]" | "/api/draft-orders/[id]/change-requests/[crId]/approve" | "/api/draft-orders/[id]/change-requests/[crId]/decline" | "/api/draft-orders/[id]/redo-flags" | "/api/draft-orders/[id]/reject" | "/api/draft-orders/[id]/revisions" | "/api/faq" | "/api/faq/[slug]" | "/api/files" | "/api/files/upload" | "/api/files/[id]" | "/api/inventory" | "/api/inventory/items" | "/api/inventory/items/[id]" | "/api/inventory/movements" | "/api/loading-days" | "/api/loading-days/[id]" | "/api/materials" | "/api/materials/[id]" | "/api/notifications" | "/api/preferences" | "/api/profiles" | "/api/profiles/templates" | "/api/profiles/templates/import" | "/api/profiles/templates/[code]" | "/api/profiles/templates/[code]/clone" | "/api/profiles/templates/[code]/export" | "/api/profiles/templates/[code]/rollback" | "/api/profiles/templates/[code]/versions" | "/api/profiles/validate" | "/api/settings" | "/api/station-log" | "/api/users" | "/api/users/[id]" | "/calendar" | "/chat" | "/faq" | "/faq/[slug]" | "/files" | "/help" | "/inventory" | "/inventory/catalog" | "/inventory/movements" | "/inventory/new" | "/inventory/[id]" | "/kanban" | "/launchpad" | "/login" | "/logistics" | "/logistics/dashboard" | "/notifications" | "/orders" | "/orders/new" | "/orders/[id]" | "/orders/[id]/edit" | "/orders/[id]/print" | "/production" | "/production/dashboard" | "/settings";
		RouteParams(): {
			"/api/calendar/[id]": { id: string };
			"/api/draft-orders/[id]": { id: string };
			"/api/draft-orders/[id]/approve": { id: string };
			"/api/draft-orders/[id]/change-requests": { id: string };
			"/api/draft-orders/[id]/change-requests/[crId]": { id: string; crId: string };
			"/api/draft-orders/[id]/change-requests/[crId]/approve": { id: string; crId: string };
			"/api/draft-orders/[id]/change-requests/[crId]/decline": { id: string; crId: string };
			"/api/draft-orders/[id]/redo-flags": { id: string };
			"/api/draft-orders/[id]/reject": { id: string };
			"/api/draft-orders/[id]/revisions": { id: string };
			"/api/faq/[slug]": { slug: string };
			"/api/files/[id]": { id: string };
			"/api/inventory/items/[id]": { id: string };
			"/api/loading-days/[id]": { id: string };
			"/api/materials/[id]": { id: string };
			"/api/profiles/templates/[code]": { code: string };
			"/api/profiles/templates/[code]/clone": { code: string };
			"/api/profiles/templates/[code]/export": { code: string };
			"/api/profiles/templates/[code]/rollback": { code: string };
			"/api/profiles/templates/[code]/versions": { code: string };
			"/api/users/[id]": { id: string };
			"/faq/[slug]": { slug: string };
			"/inventory/[id]": { id: string };
			"/orders/[id]": { id: string };
			"/orders/[id]/edit": { id: string };
			"/orders/[id]/print": { id: string }
		};
		LayoutParams(): {
			"/": { id?: string; crId?: string; slug?: string; code?: string };
			"/admin": Record<string, never>;
			"/admin/dashboard": Record<string, never>;
			"/admin/materials": Record<string, never>;
			"/admin/users": Record<string, never>;
			"/api": { id?: string; crId?: string; slug?: string; code?: string };
			"/api/audit-log": Record<string, never>;
			"/api/auth": Record<string, never>;
			"/api/auth/password": Record<string, never>;
			"/api/calendar": { id?: string };
			"/api/calendar/capacity": Record<string, never>;
			"/api/calendar/[id]": { id: string };
			"/api/chat": Record<string, never>;
			"/api/chat/messages": Record<string, never>;
			"/api/delivery-presets": Record<string, never>;
			"/api/draft-orders": { id?: string; crId?: string };
			"/api/draft-orders/generate-po": Record<string, never>;
			"/api/draft-orders/[id]": { id: string; crId?: string };
			"/api/draft-orders/[id]/approve": { id: string };
			"/api/draft-orders/[id]/change-requests": { id: string; crId?: string };
			"/api/draft-orders/[id]/change-requests/[crId]": { id: string; crId: string };
			"/api/draft-orders/[id]/change-requests/[crId]/approve": { id: string; crId: string };
			"/api/draft-orders/[id]/change-requests/[crId]/decline": { id: string; crId: string };
			"/api/draft-orders/[id]/redo-flags": { id: string };
			"/api/draft-orders/[id]/reject": { id: string };
			"/api/draft-orders/[id]/revisions": { id: string };
			"/api/faq": { slug?: string };
			"/api/faq/[slug]": { slug: string };
			"/api/files": { id?: string };
			"/api/files/upload": Record<string, never>;
			"/api/files/[id]": { id: string };
			"/api/inventory": { id?: string };
			"/api/inventory/items": { id?: string };
			"/api/inventory/items/[id]": { id: string };
			"/api/inventory/movements": Record<string, never>;
			"/api/loading-days": { id?: string };
			"/api/loading-days/[id]": { id: string };
			"/api/materials": { id?: string };
			"/api/materials/[id]": { id: string };
			"/api/notifications": Record<string, never>;
			"/api/preferences": Record<string, never>;
			"/api/profiles": { code?: string };
			"/api/profiles/templates": { code?: string };
			"/api/profiles/templates/import": Record<string, never>;
			"/api/profiles/templates/[code]": { code: string };
			"/api/profiles/templates/[code]/clone": { code: string };
			"/api/profiles/templates/[code]/export": { code: string };
			"/api/profiles/templates/[code]/rollback": { code: string };
			"/api/profiles/templates/[code]/versions": { code: string };
			"/api/profiles/validate": Record<string, never>;
			"/api/settings": Record<string, never>;
			"/api/station-log": Record<string, never>;
			"/api/users": { id?: string };
			"/api/users/[id]": { id: string };
			"/calendar": Record<string, never>;
			"/chat": Record<string, never>;
			"/faq": { slug?: string };
			"/faq/[slug]": { slug: string };
			"/files": Record<string, never>;
			"/help": Record<string, never>;
			"/inventory": { id?: string };
			"/inventory/catalog": Record<string, never>;
			"/inventory/movements": Record<string, never>;
			"/inventory/new": Record<string, never>;
			"/inventory/[id]": { id: string };
			"/kanban": Record<string, never>;
			"/launchpad": Record<string, never>;
			"/login": Record<string, never>;
			"/logistics": Record<string, never>;
			"/logistics/dashboard": Record<string, never>;
			"/notifications": Record<string, never>;
			"/orders": { id?: string };
			"/orders/new": Record<string, never>;
			"/orders/[id]": { id: string };
			"/orders/[id]/edit": { id: string };
			"/orders/[id]/print": { id: string };
			"/production": Record<string, never>;
			"/production/dashboard": Record<string, never>;
			"/settings": Record<string, never>
		};
		Pathname(): "/" | "/admin" | "/admin/" | "/admin/dashboard" | "/admin/dashboard/" | "/admin/materials" | "/admin/materials/" | "/admin/users" | "/admin/users/" | "/api" | "/api/" | "/api/audit-log" | "/api/audit-log/" | "/api/auth" | "/api/auth/" | "/api/auth/password" | "/api/auth/password/" | "/api/calendar" | "/api/calendar/" | "/api/calendar/capacity" | "/api/calendar/capacity/" | `/api/calendar/${string}` & {} | `/api/calendar/${string}/` & {} | "/api/chat" | "/api/chat/" | "/api/chat/messages" | "/api/chat/messages/" | "/api/delivery-presets" | "/api/delivery-presets/" | "/api/draft-orders" | "/api/draft-orders/" | "/api/draft-orders/generate-po" | "/api/draft-orders/generate-po/" | `/api/draft-orders/${string}` & {} | `/api/draft-orders/${string}/` & {} | `/api/draft-orders/${string}/approve` & {} | `/api/draft-orders/${string}/approve/` & {} | `/api/draft-orders/${string}/change-requests` & {} | `/api/draft-orders/${string}/change-requests/` & {} | `/api/draft-orders/${string}/change-requests/${string}` & {} | `/api/draft-orders/${string}/change-requests/${string}/` & {} | `/api/draft-orders/${string}/change-requests/${string}/approve` & {} | `/api/draft-orders/${string}/change-requests/${string}/approve/` & {} | `/api/draft-orders/${string}/change-requests/${string}/decline` & {} | `/api/draft-orders/${string}/change-requests/${string}/decline/` & {} | `/api/draft-orders/${string}/redo-flags` & {} | `/api/draft-orders/${string}/redo-flags/` & {} | `/api/draft-orders/${string}/reject` & {} | `/api/draft-orders/${string}/reject/` & {} | `/api/draft-orders/${string}/revisions` & {} | `/api/draft-orders/${string}/revisions/` & {} | "/api/faq" | "/api/faq/" | `/api/faq/${string}` & {} | `/api/faq/${string}/` & {} | "/api/files" | "/api/files/" | "/api/files/upload" | "/api/files/upload/" | `/api/files/${string}` & {} | `/api/files/${string}/` & {} | "/api/inventory" | "/api/inventory/" | "/api/inventory/items" | "/api/inventory/items/" | `/api/inventory/items/${string}` & {} | `/api/inventory/items/${string}/` & {} | "/api/inventory/movements" | "/api/inventory/movements/" | "/api/loading-days" | "/api/loading-days/" | `/api/loading-days/${string}` & {} | `/api/loading-days/${string}/` & {} | "/api/materials" | "/api/materials/" | `/api/materials/${string}` & {} | `/api/materials/${string}/` & {} | "/api/notifications" | "/api/notifications/" | "/api/preferences" | "/api/preferences/" | "/api/profiles" | "/api/profiles/" | "/api/profiles/templates" | "/api/profiles/templates/" | "/api/profiles/templates/import" | "/api/profiles/templates/import/" | `/api/profiles/templates/${string}` & {} | `/api/profiles/templates/${string}/` & {} | `/api/profiles/templates/${string}/clone` & {} | `/api/profiles/templates/${string}/clone/` & {} | `/api/profiles/templates/${string}/export` & {} | `/api/profiles/templates/${string}/export/` & {} | `/api/profiles/templates/${string}/rollback` & {} | `/api/profiles/templates/${string}/rollback/` & {} | `/api/profiles/templates/${string}/versions` & {} | `/api/profiles/templates/${string}/versions/` & {} | "/api/profiles/validate" | "/api/profiles/validate/" | "/api/settings" | "/api/settings/" | "/api/station-log" | "/api/station-log/" | "/api/users" | "/api/users/" | `/api/users/${string}` & {} | `/api/users/${string}/` & {} | "/calendar" | "/calendar/" | "/chat" | "/chat/" | "/faq" | "/faq/" | `/faq/${string}` & {} | `/faq/${string}/` & {} | "/files" | "/files/" | "/help" | "/help/" | "/inventory" | "/inventory/" | "/inventory/catalog" | "/inventory/catalog/" | "/inventory/movements" | "/inventory/movements/" | "/inventory/new" | "/inventory/new/" | `/inventory/${string}` & {} | `/inventory/${string}/` & {} | "/kanban" | "/kanban/" | "/launchpad" | "/launchpad/" | "/login" | "/login/" | "/logistics" | "/logistics/" | "/logistics/dashboard" | "/logistics/dashboard/" | "/notifications" | "/notifications/" | "/orders" | "/orders/" | "/orders/new" | "/orders/new/" | `/orders/${string}` & {} | `/orders/${string}/` & {} | `/orders/${string}/edit` & {} | `/orders/${string}/edit/` & {} | `/orders/${string}/print` & {} | `/orders/${string}/print/` & {} | "/production" | "/production/" | "/production/dashboard" | "/production/dashboard/" | "/settings" | "/settings/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/.nojekyll" | "/404.html" | "/brand/avatar-default.svg" | "/brand/logo-reclame-cube-dark.webp" | "/brand/logo-reclame-cube.webp" | "/brand.css" | "/logo.png" | string & {};
	}
}