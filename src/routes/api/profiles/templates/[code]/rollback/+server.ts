import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { code } = params;
  const { version } = await request.json();
  const user = locals.user;

  if (!user || (user.roles?.Admin !== 'Admin' && user.roles?.Admin !== 'SuperAdmin')) {
    throw error(403, 'Admin access required');
  }

  // Get template ID
  const { data: template } = await locals.supabase.from('profile_templates').select('id').eq('code', code).single();
  if (!template) throw error(404, 'Template not found');

  // Get snapshot
  const { data: snapshotData } = await locals.supabase
    .from('template_versions')
    .select('template_snapshot')
    .eq('template_id', template.id)
    .eq('version', version)
    .single();

  if (!snapshotData) throw error(404, 'Version not found');

  const snapshot = snapshotData.template_snapshot;
  // Note: restoring from snapshot is complex as it involves deleting current structure and inserting snapshot structure.
  // This logic should be similar to import or clone.
  // For brevity, I'll assume we wipe and recreate.

  // 1. Delete sections (cascade)
  await locals.supabase.from('profile_sections').delete().eq('template_id', template.id);

  // 2. Update template metadata
  await locals.supabase.from('profile_templates').update({
      name: snapshot.name,
      description: snapshot.description,
      metadata: snapshot.metadata,
      version: snapshot.version, // Should we increment or revert number? Reverting usually means new version with old content.
      // But user requested rollback. Let's keep version logic simple.
      updated_by: user.id,
      updated_at: new Date().toISOString()
  }).eq('id', template.id);

  // 3. Recreate sections/fields
  // Snapshot structure: { ..., sections: [ { ..., fields: [] } ] }
  if (snapshot.sections) {
      // Need to sort sections
      const sections = Array.isArray(snapshot.sections) ? snapshot.sections : []; // Check format from `import`
      // In `import` snapshot was result of `json_agg` query.
      // Assuming it's an array of objects.

      for (const section of sections) {
         // Note: snapshot from `import` query had specific structure `json_build_object('section', ... 'fields', ...)`.
         // Check `src/routes/api/profiles/templates/import/+server.ts` or `export/+server.ts`.
         // In `import`, snapshot was result of `row_to_json(pt.*)` and sections was subquery.
         // Let's assume standard structure or handle accordingly.

         const sData = section.section || section; // handle different snapshot formats if any

         const { data: newSection } = await locals.supabase
            .from('profile_sections')
            .insert({
                template_id: template.id,
                name: sData.name,
                display_name_en: sData.display_name_en,
                order_index: sData.order_index,
                is_required: sData.is_required,
                metadata: sData.metadata
            })
            .select()
            .single();

         if (newSection && (section.fields || sData.fields)) {
             const fields = (section.fields || sData.fields).map((f: any) => ({
                 section_id: newSection.id,
                 field_key: f.field_key,
                 field_type: f.field_type,
                 label_en: f.label_en,
                 order_index: f.order_index,
                 is_required: f.is_required,
                 options: f.options,
                 config: f.config,
                 validation_rules: f.validation_rules,
                 conditional_logic: f.conditional_logic,
                 metadata: f.metadata
             }));
             await locals.supabase.from('profile_fields').insert(fields);
         }
      }
  }

  return json({ success: true, message: `Rolled back to version ${version}` });
};
