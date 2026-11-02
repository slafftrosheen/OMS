/** Read-only business context. SQL owns the same source/column allowlist. */
export const TELEGRAM_CONTEXT_SOURCES = {
  "orders": [
    "id",
    "po_number",
    "internal_ref",
    "client",
    "title",
    "status",
    "priority",
    "due_date",
    "loading_date",
    "notes",
    "delivery_address",
    "delivery_contact",
    "delivery_phone",
    "is_rd",
    "rd_notes",
    "price",
    "created_by",
    "created_at",
    "updated_at",
    "confirmed_at",
    "dispatched_at"
  ],
  "order_profiles": [
    "id",
    "draft_order_id",
    "profile_template_id",
    "quantity1",
    "quantity2",
    "quantity3",
    "quantity4",
    "configuration",
    "notes",
    "order_index",
    "updated_at"
  ],
  "production_stages": [
    "id",
    "draft_order_id",
    "station",
    "state",
    "started_at",
    "completed_at",
    "blocked_reason",
    "estimated_hours",
    "actual_hours",
    "notes",
    "updated_at"
  ],
  "order_materials": [
    "id",
    "draft_order_id",
    "material_type",
    "material_category",
    "thickness",
    "dimensions",
    "color",
    "ral_code",
    "quantity",
    "unit",
    "supplier",
    "notes"
  ],
  "order_assignees": [
    "id",
    "draft_order_id",
    "assignee_id",
    "assigned_by",
    "assigned_at"
  ],
  "materials": [
    "id",
    "code",
    "sku",
    "name_en",
    "name_ru",
    "name_lv",
    "category",
    "thickness_options",
    "stock",
    "min_stock",
    "max_stock",
    "unit",
    "location",
    "vendor",
    "supplier",
    "color_code",
    "price",
    "note",
    "thickness_mm"
  ],
  "inventory": [
    "id",
    "material_id",
    "sku",
    "name",
    "category",
    "unit",
    "stock",
    "min_stock",
    "max_stock",
    "thickness_mm",
    "location",
    "vendor",
    "color_code",
    "note",
    "updated_at"
  ],
  "inventory_movements": [
    "id",
    "item_id",
    "material_id",
    "movement_type",
    "quantity",
    "reference_id",
    "reference_type",
    "performed_by",
    "notes",
    "created_at",
    "stock_before",
    "stock_after"
  ],
  "replenishment": [
    "id",
    "material_id",
    "quantity",
    "unit",
    "supplier_label",
    "supplier_reference",
    "note",
    "status",
    "stock_at_request",
    "minimum_at_request",
    "created_by",
    "created_at",
    "updated_at",
    "ordered_at",
    "closed_at"
  ],
  "calendar": [
    "id",
    "kind",
    "date",
    "title",
    "note",
    "created_by",
    "updated_at"
  ],
  "loading_events": [
    "id",
    "carrier",
    "window_start",
    "window_end",
    "notes",
    "created_at"
  ],
  "loading_days": [
    "id",
    "date",
    "max_capacity",
    "notes",
    "is_blocked",
    "updated_at"
  ],
  "staff": [
    "id",
    "username",
    "display_name",
    "full_name",
    "role",
    "station",
    "stations",
    "is_active"
  ],
  "work_entries": [
    "id",
    "user_id",
    "work_date",
    "actual_minutes",
    "multiplier",
    "credited_minutes",
    "holiday_name",
    "note",
    "start_time",
    "finish_time",
    "updated_at"
  ],
  "absences": [
    "id",
    "user_id",
    "start_date",
    "end_date",
    "partial_day",
    "reason",
    "note",
    "status",
    "updated_at"
  ],
  "reports": [
    "id",
    "kind",
    "period",
    "version",
    "generated_at",
    "is_stale",
    "payload"
  ],
  "order_history": [
    "id",
    "order_id",
    "actor_id",
    "event_type",
    "payload",
    "created_at"
  ],
  "station_logs": [
    "id",
    "user_id",
    "station",
    "action",
    "details",
    "created_at",
    "order_id"
  ],
  "change_requests": [
    "id",
    "order_id",
    "description",
    "proposed_diff",
    "status",
    "requested_by",
    "reviewed_by",
    "reviewed_at",
    "review_notes",
    "created_at",
    "updated_at"
  ],
  "chat_rooms": [
    "id",
    "name",
    "kind",
    "station",
    "order_id",
    "is_private",
    "archived_at"
  ],
  "chat_messages": [
    "id",
    "room_id",
    "user_id",
    "text",
    "content",
    "message",
    "order_id",
    "created_at",
    "updated_at"
  ],
  "knowledge": [
    "id",
    "url",
    "category",
    "content",
    "crawled_at"
  ],
  "profile_templates": [
    "id",
    "code",
    "name",
    "version",
    "is_active",
    "description",
    "updated_at"
  ],
  "capacity": [
    "station",
    "workers",
    "hours_per_worker",
    "efficiency_percent",
    "workdays",
    "updated_at"
  ],
  "files": [
    "id",
    "filename",
    "original_name",
    "mimetype",
    "size",
    "uploaded_by",
    "created_at"
  ],
  "order_files": [
    "id",
    "draft_order_id",
    "file_id",
    "file_type",
    "display_name",
    "created_at"
  ],
  "order_revisions": [
    "id",
    "order_id",
    "revision_number",
    "note",
    "created_by",
    "created_at"
  ],
  "notifications": [
    "id",
    "notification_type",
    "title",
    "message",
    "link",
    "is_read",
    "source_type",
    "source_id",
    "created_at"
  ]
} as const;
export interface TelegramContextQuery {
  source: keyof typeof TELEGRAM_CONTEXT_SOURCES;
  mode: 'rows' | 'count' | 'summary';
  filters: Array<{ field: string; op: 'eq' | 'contains' | 'gte' | 'lte'; value: string }>;
  groupBy: string | null;
  offset: number;
}
export const TELEGRAM_CONTEXT_TOOL = {
  type: 'function', function: {
    name: 'read_oms_context',
    description: 'Read CURRENT OMS business records under the linked account permissions. Use source names and columns from list_oms_sources. mode rows returns 20 records with offset pagination; count gives exact matching count; summary groups counts by groupBy. Filter by actual record/order/user IDs to read full specifications, production progress, stock, staff, attendance, reports, calendar, accessible messages and knowledge. Missing/denied data must not be inferred. No writes.',
    parameters: { type: 'object', additionalProperties: false, required: ['source'], properties: {
      source: { type: 'string', enum: Object.keys(TELEGRAM_CONTEXT_SOURCES) },
      mode: { type: 'string', enum: ['rows','count','summary'] },
      filters: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false,
        required: ['field','op','value'], properties: { field: { type: 'string' }, op: { type: 'string', enum: ['eq','contains','gte','lte'] }, value: { type: 'string', maxLength: 200 } } } },
      groupBy: { type: 'string' }, offset: { type: 'integer', minimum: 0, maximum: 2000 }
    } }
  }
};
export const TELEGRAM_SOURCES_TOOL = { type: 'function', function: {
  name: 'list_oms_sources', description: 'Discover OMS business datasets and queryable columns. Availability and rows depend on the linked user permissions. These are live database sources, not all preloaded context.',
  parameters: { type: 'object', properties: {}, additionalProperties: false }
} };
export function normalizeTelegramContextQuery(input: unknown): TelegramContextQuery | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, any>;
  if (Object.keys(value).some(k => !['source','mode','filters','groupBy','offset'].includes(k)) ||
      typeof value.source !== 'string' || !Object.hasOwn(TELEGRAM_CONTEXT_SOURCES,value.source)) return null;
  const fields = TELEGRAM_CONTEXT_SOURCES[value.source as keyof typeof TELEGRAM_CONTEXT_SOURCES] as readonly string[];
  const mode = value.mode ?? 'rows', offset = value.offset ?? 0, filters = value.filters ?? [];
  if (!['rows','count','summary'].includes(mode) || !Number.isInteger(offset) || offset<0 || offset>2000 ||
      !Array.isArray(filters) || filters.length>5 || (value.groupBy !== undefined && !fields.includes(value.groupBy)) ||
      (mode==='summary' && !value.groupBy)) return null;
  for (const f of filters) if (!f || typeof f !== 'object' || Array.isArray(f) ||
    Object.keys(f).some(k=>!['field','op','value'].includes(k)) || !fields.includes(f.field) ||
    !['eq','contains','gte','lte'].includes(f.op) || typeof f.value!=='string' || f.value.length>200) return null;
  return { source:value.source as TelegramContextQuery['source'],mode,filters,groupBy:value.groupBy??null,offset };
}

/** Whole-row budgeting keeps valid JSON and explicit partial-result metadata. */
export function boundTelegramContext(input: unknown, query: TelegramContextQuery): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Context unavailable');
  let changed=false;
  const trim = (v:any,depth=0):any => {
    if (typeof v==='string' && v.length>1500) { changed=true; return v.slice(0,1500)+'…'; }
    if (v && typeof v==='object') {
      if (depth>7) { changed=true; return '[Further detail omitted]'; }
      if (Array.isArray(v)) { if(v.length>40)changed=true; return v.slice(0,40).map(x=>trim(x,depth+1)); }
      const entries=Object.entries(v); if(entries.length>80)changed=true;
      return Object.fromEntries(entries.slice(0,80).map(([k,x])=>[k,trim(x,depth+1)]));
    }
    return v;
  };
  const result=trim(input);
  if(Array.isArray(result.rows)) {
    const original=result.rows.length;
    while(JSON.stringify(result).length>11000 && result.rows.length>1)result.rows.pop();
    if(JSON.stringify(result).length>11000) {
      const row=result.rows[0];result.rows=[{id:row?.id,detailOmitted:true}];changed=true;
    }
    if(result.rows.length<original) { result.truncated=true;result.nextOffset=query.offset+result.rows.length; }
  }
  if(Array.isArray(result.groups))while(JSON.stringify(result).length>11000 && result.groups.length) {result.groups.pop();result.truncated=true;}
  if(changed)result.fieldsTruncated=true;
  return result;
}
