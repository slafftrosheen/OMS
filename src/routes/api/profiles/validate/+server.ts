// src/routes/api/profiles/validate/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

interface ValidationError {
  section: string;
  field: string;
  message: string;
}

/**
 * POST /api/profiles/validate
 * Validate configuration against template
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { profileCode, configuration } = await request.json();

    if (!profileCode || !configuration) {
      throw error(400, 'Missing profileCode or configuration');
    }

    // Load template with validation rules
    const templateResult = await query(
      `SELECT pt.*, 
        json_agg(
          json_build_object(
            'section', ps.name,
            'fields', (
              SELECT json_agg(
                json_build_object(
                  'field_key', pf.field_key,
                  'is_required', pf.is_required,
                  'field_type', pf.field_type,
                  'validation_rules', pf.validation_rules,
                  'conditional_logic', pf.conditional_logic,
                  'config', pf.config
                )
              )
              FROM profile_section_fields pf
              WHERE pf.section_id = ps.id
            )
          )
        ) as sections
       FROM profile_templates pt
       LEFT JOIN profile_sections ps ON ps.id = ANY(
         SELECT section_id FROM profile_section_fields WHERE profile_template_id = pt.id
       )
       WHERE pt.code = $1
       GROUP BY pt.id`,
      [profileCode]
    );

    if (templateResult.rows.length === 0) {
      throw error(404, 'Template not found');
    }

    const template = templateResult.rows[0];
    const errors: ValidationError[] = [];

    // Validate each section and field
    for (const section of template.sections || []) {
      if (!section || !section.fields) continue;
      
      const sectionData = configuration[section.section] || {};

      for (const field of section.fields || []) {
        const fieldValue = sectionData[field.field_key];

        // Check required fields
        if (field.is_required && !fieldValue) {
          // Check if field is conditionally hidden
          const isVisible = evaluateConditionalLogic(
            field.conditional_logic,
            configuration
          );

          if (isVisible) {
            errors.push({
              section: section.section,
              field: field.field_key,
              message: `${field.field_key} is required`
            });
          }
        }

        // Validate field type
        if (fieldValue) {
          const typeError = validateFieldType(field, fieldValue);
          if (typeError) {
            errors.push({
              section: section.section,
              field: field.field_key,
              message: typeError
            });
          }
        }

        // Apply validation rules
        if (field.validation_rules && fieldValue) {
          for (const rule of field.validation_rules) {
            const ruleError = applyValidationRule(rule, fieldValue);
            if (ruleError) {
              errors.push({
                section: section.section,
                field: field.field_key,
                message: ruleError
              });
            }
          }
        }
      }
    }

    return json({
      valid: errors.length === 0,
      errors
    });

  } catch (err) {
    console.error('Validation error:', err);
    throw error(500, 'Validation failed');
  }
};

function evaluateConditionalLogic(logic: any[], config: any): boolean {
  if (!logic || logic.length === 0) return true;

  return logic.every(rule => {
    const [section, field] = rule.field_key.split('.');
    const value = config[section]?.[field];

    switch (rule.operator) {
      case 'equals':
        return value === rule.value;
      case 'not_equals':
        return value !== rule.value;
      case 'contains':
        return Array.isArray(value) && value.includes(rule.value);
      case 'greater_than':
        return Number(value) > Number(rule.value);
      case 'less_than':
        return Number(value) < Number(rule.value);
      default:
        return true;
    }
  });
}

function validateFieldType(field: any, value: any): string | null {
  switch (field.field_type) {
    case 'number':
    case 'numeric_input':
      if (isNaN(Number(value))) {
        return 'Must be a number';
      }
      if (field.config?.min && Number(value) < field.config.min) {
        return `Must be at least ${field.config.min}`;
      }
      if (field.config?.max && Number(value) > field.config.max) {
        return `Must be at most ${field.config.max}`;
      }
      break;

    case 'date':
    case 'date_input':
      if (isNaN(Date.parse(value))) {
        return 'Invalid date format';
      }
      break;

    case 'material_field':
      if (typeof value === 'object') {
        if (!value.materialCode && !value.materialId) {
          return 'Material not properly selected';
        }
      }
      break;

    case 'color_ral':
      if (!/^\d{4}$/.test(String(value))) {
        return 'Invalid RAL code format (should be 4 digits)';
      }
      break;
  }

  return null;
}

function applyValidationRule(rule: any, value: any): string | null {
  switch (rule.type) {
    case 'pattern':
      if (!new RegExp(rule.value).test(String(value))) {
        return rule.message || 'Invalid format';
      }
      break;

    case 'min_length':
      if (String(value).length < rule.value) {
        return rule.message || `Minimum length is ${rule.value}`;
      }
      break;

    case 'max_length':
      if (String(value).length > rule.value) {
        return rule.message || `Maximum length is ${rule.value}`;
      }
      break;
  }

  return null;
}
