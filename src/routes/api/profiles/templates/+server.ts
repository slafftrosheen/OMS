// src/routes/api/profiles/templates/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/profiles/templates
 * List all profile templates with optional filtering and details
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  // We can default to a system user if needed, or enforce auth
  // For now assuming existing logic where locals.user is populated by hooks

  // Note: locals.user is populated in hooks.server.ts from Supabase session.
  const user = locals.user;

  const includeDetails = url.searchParams.get('include') === 'details';
  const includeStats = url.searchParams.get('includeStats') === 'true';
  const activeOnly = url.searchParams.get('active') !== 'false';
  const searchQuery = url.searchParams.get('search') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    let query = locals.supabase
      .from('profile_templates')
      .select('*, created_by_name:created_by(username), updated_by_name:updated_by(username)', { count: 'exact' });

    if (activeOnly) {
        // If user is not admin, only show active.
        // Need to check roles. Using existing logic (Admin/SuperAdmin can see inactive)
        const isAdmin = user && (user.roles?.Admin === 'Admin' || user.roles?.Admin === 'SuperAdmin');
        if (!isAdmin) {
             query = query.eq('is_active', true);
        }
    }

    if (searchQuery) {
      query = query.or(`code.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    query = query.order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: templates, count: total, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    // Supabase returns related data in nested objects if configured, but here we just need to transform or fetch if relationships are set up.
    // Assuming 'created_by' in 'profile_templates' is a UUID ref to 'profiles' (which has username).
    // The select string above `created_by_name:created_by(username)` attempts to fetch the related username.

    // Process templates to flatten/structure as expected
    const items = templates.map(t => ({
        ...t,
        created_by_name: t.created_by_name?.username || 'system', // Accessing the joined data
        updated_by_name: t.updated_by_name?.username || 'system'
    }));

    // Include details (sections and fields)
    if (includeDetails) {
      for (const template of items) {
        const { data: sections } = await locals.supabase
          .from('profile_sections')
          .select('*')
          .eq('template_id', template.id)
          .order('order_index');
        
        template.sections = sections || [];

        for (const section of template.sections) {
            const { data: fields } = await locals.supabase
            .from('profile_fields')
            .select('*')
            .eq('section_id', section.id)
            .order('order_index');
            section.fields = fields || [];
        }
      }
    } else {
        // Get counts
        // This is N+1, but reproducing logic. Can be optimized with a view or RPC.
         for (const template of items) {
            const { count: sectionsCount } = await locals.supabase
                .from('profile_sections')
                .select('*', { count: 'exact', head: true })
                .eq('template_id', template.id);

             // Fields count requires a join or separate query.
             // Simplest is to just query profile_fields join profile_sections
             const { count: fieldsCount } = await locals.supabase
                 .from('profile_fields')
                 .select('id, profile_sections!inner(template_id)', { count: 'exact', head: true })
                 .eq('profile_sections.template_id', template.id);

            template.sections_count = sectionsCount || 0;
            template.fields_count = fieldsCount || 0;
         }
    }

    // Include usage statistics
    if (includeStats) {
      for (const template of items) {
        const { count: usageCount } = await locals.supabase
            .from('order_profiles')
            .select('*', { count: 'exact', head: true })
            .eq('profile_template_id', template.id);

        template.usage_count = usageCount || 0;
      }
    }

    return json({
      items,
      total,
      page,
      limit,
      pages: Math.ceil((total || 0) / limit)
    });

  } catch (err) {
    console.error('Error loading templates:', err);
    throw error(500, 'Failed to load templates');
  }
};

/**
 * POST /api/profiles/templates
 * Create new profile template with sections and fields
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  
  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    throw error(403, 'Admin access required');
  }

  try {
    const template = await request.json();

    if (!template.code || !template.name) {
      throw error(400, 'Missing required fields: code, name');
    }

    if (!/^P[0-9A-Za-z\-_]+$/.test(template.code)) {
      throw error(400, 'Invalid code format. Must start with "P" followed by alphanumeric characters');
    }

    const { data: existing } = await locals.supabase
        .from('profile_templates')
        .select('id')
        .eq('code', template.code)
        .single();

    if (existing) {
      throw error(409, `Template with code ${template.code} already exists`);
    }

    // Using Supabase, we can't easily do a single transaction block for multiple tables unless we use RPC or just chaining.
    // If we want transaction safety, we should create an RPC.
    // For now, I will implement it as chained calls, which is less safe but standard for client-side usage (though this is server-side).
    // Or I can just write an RPC. Writing an RPC is cleaner.

    // However, to keep it simple and within the context of refactoring JS code, I'll use chained calls.
    // If an error occurs, we might have orphaned records.

    // 1. Insert template
    const { data: newTemplate, error: templateError } = await locals.supabase
        .from('profile_templates')
        .insert({
            code: template.code,
            name: template.name,
            description: template.description || '',
            version: template.version || 1, // Changed from '1.0' to 1 (integer) if schema expects int, or check schema
            is_active: template.is_active !== false,
            metadata: template.metadata || {},
            created_by: user.id, // Assuming linking to UUID
            updated_by: user.id
        })
        .select()
        .single();

    if (templateError) throw templateError;

    // 2. Insert sections
    if (template.sections && template.sections.length > 0) {
        for (const section of template.sections) {
            const { data: newSection, error: sectionError } = await locals.supabase
                .from('profile_sections')
                .insert({
                    template_id: newTemplate.id,
                    name: section.name,
                    display_name_en: section.display_name_en,
                    display_name_ru: section.display_name_ru || section.display_name_en,
                    display_name_lv: section.display_name_lv || section.display_name_en,
                    order_index: section.order_index,
                    is_required: section.is_required || false,
                    metadata: section.metadata || {}
                })
                .select()
                .single();

            if (sectionError) throw sectionError;

            // 3. Insert fields
            if (section.fields && section.fields.length > 0) {
                 const fieldsToInsert = section.fields.map((field: any) => ({
                    section_id: newSection.id,
                    field_key: field.field_key,
                    field_type: field.field_type,
                    label_en: field.label_en,
                    label_ru: field.label_ru || field.label_en,
                    label_lv: field.label_lv || field.label_en,
                    order_index: field.order_index,
                    is_required: field.is_required || false,
                    options: field.options || [],
                    config: field.config || {},
                    validation_rules: field.validation_rules || [],
                    conditional_logic: field.conditional_logic || [],
                    metadata: field.metadata || {}
                 }));

                 const { error: fieldsError } = await locals.supabase
                    .from('profile_fields')
                    .insert(fieldsToInsert);

                if (fieldsError) throw fieldsError;
            }
        }
    }

    // 4. Create initial version snapshot
    // This is complex to construct in JS then insert.
    // Fetching full object back to store as snapshot.

    // Fetch complete structure
    // This could be optimized but reproducing logic:
    const { data: fullTemplate } = await locals.supabase
        .from('profile_templates')
        .select(`
            *,
            sections:profile_sections(
                *,
                fields:profile_fields(*)
            )
        `)
        .eq('id', newTemplate.id)
        .single();

    await locals.supabase.from('template_versions').insert({
        template_id: newTemplate.id,
        version: newTemplate.version,
        template_snapshot: fullTemplate,
        notes: 'Initial version',
        created_by: user.id
    });

    return json({
        success: true,
        template: newTemplate,
        message: `Template ${template.code} created successfully`
    }, { status: 201 });

  } catch (err: any) {
    console.error('Error creating template:', err);
    if (err.status) throw err;
    throw error(500, err.message || 'Failed to create template');
  }
};
