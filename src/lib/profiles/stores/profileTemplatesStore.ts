// src/lib/profiles/stores/profileTemplatesStore.ts

import { writable, derived, get } from 'svelte/store';
import type { ProfileTemplate, ProfileSection, ProfileField } from '../types';

// Store state
let loading = false;
let error: string | null = null;

// Store
function createProfileTemplatesStore() {
  const { subscribe, set, update } = writable<ProfileTemplate[]>([]);

  // Helper to transform API response to ProfileTemplate
  function transformAPITemplate(apiTemplate: any): ProfileTemplate {
    return {
      id: apiTemplate.id,
      code: apiTemplate.code,
      name: apiTemplate.name,
      version: parseFloat(apiTemplate.version) || 1,
      isActive: apiTemplate.is_active,
      metadata: {
        icon: apiTemplate.metadata?.icon || '📦',
        description: {
          en: apiTemplate.description || '',
          ru: apiTemplate.description || '',
          lv: apiTemplate.description || ''
        },
        category: apiTemplate.metadata?.complexity || 'medium',
        manufacturingTime: apiTemplate.metadata?.typical_timeline ? 
          parseInt(apiTemplate.metadata.typical_timeline) * 24 : 168
      },
      sections: (apiTemplate.sections || []).map((section: any) => ({
        id: section.id,
        name: section.name,
        displayName: {
          en: section.display_name_en,
          ru: section.display_name_ru || section.display_name_en,
          lv: section.display_name_lv || section.display_name_en
        },
        icon: section.metadata?.icon || '⚙️',
        orderIndex: section.order_index,
        isRequired: section.is_required,
        fields: (section.fields || []).map((field: any) => ({
          id: field.id,
          fieldKey: field.field_key,
          fieldType: field.field_type,
          label: {
            en: field.label_en,
            ru: field.label_ru || field.label_en,
            lv: field.label_lv || field.label_en
          },
          isRequired: field.is_required,
          defaultValue: field.config?.default || field.config?.defaultValue || null,
          options: field.options || [],
          orderIndex: field.order_index,
          config: field.config || {},
          placeholder: field.config?.placeholder || undefined
        }))
      }))
    };
  }

  return {
    subscribe,
    
    loadTemplates: async (): Promise<void> => {
      if (loading) return;
      loading = true;
      error = null;

      try {
        const response = await fetch('/api/profiles/templates?include=details&includeStats=true');
        
        if (!response.ok) {
          console.error('Failed to load templates from API');
          error = 'Failed to load templates';
          return;
        }

        const data = await response.json();
        const templates = (data.items || []).map(transformAPITemplate);
        
        // If API returns empty, just log it
        if (templates.length === 0) {
          console.warn('API returned no templates');
        }
        
        set(templates);
      } catch (err: any) {
        console.error('Error loading templates from API:', err);
        error = err.message;
      } finally {
        loading = false;
      }
    },

    createTemplate: async (template: Partial<ProfileTemplate>): Promise<any> => {
      try {
        const response = await fetch('/api/profiles/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: template.code,
            name: template.name,
            description: template.metadata?.description?.en || '',
            metadata: template.metadata,
            sections: template.sections
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to create template');
        }

        const result = await response.json();
        
        // Reload templates to reflect changes
        await profileTemplates.loadTemplates();
        
        return result;
      } catch (err: any) {
        console.error('Error creating template:', err);
        throw err;
      }
    },

    updateTemplate: async (code: string, updates: Partial<ProfileTemplate>): Promise<any> => {
      try {
        const response = await fetch(`/api/profiles/templates/${code}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update template');
        }

        const result = await response.json();
        
        // Reload templates to reflect changes
        await profileTemplates.loadTemplates();
        
        return result;
      } catch (err: any) {
        console.error('Error updating template:', err);
        throw err;
      }
    },

    deleteTemplate: async (code: string, hardDelete: boolean = false): Promise<any> => {
      try {
        const url = `/api/profiles/templates/${code}${hardDelete ? '?hard=true' : ''}`;
        const response = await fetch(url, { method: 'DELETE' });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to delete template');
        }

        // Reload templates to reflect changes
        await profileTemplates.loadTemplates();
        
        return await response.json();
      } catch (err: any) {
        console.error('Error deleting template:', err);
        throw err;
      }
    },

    getTemplate: (code: string): ProfileTemplate | undefined => {
      return get({ subscribe }).find(t => t.code === code);
    },
    
    getActiveTemplates: (): ProfileTemplate[] => {
      return get({ subscribe }).filter(t => t.isActive);
    },
    
    getTemplateById: (id: number): ProfileTemplate | undefined => {
      return get({ subscribe }).find(t => t.id === id);
    },

    isLoading: () => loading,
    getError: () => error
  };
}

export const profileTemplates = createProfileTemplatesStore();

// Derived store for active templates only
export const activeTemplates = derived(
  profileTemplates,
  $templates => $templates.filter(t => t.isActive)
);

// Helper to get template by code
export function getTemplateByCode(code: string): ProfileTemplate | undefined {
  return get(profileTemplates).find(t => t.code === code);
}

// Helper to get complexity badge color
export function getComplexityColor(category?: string): string {
  switch (category) {
    case 'simple':
      return '#10B981'; // green
    case 'medium':
      return '#F59E0B'; // amber
    case 'complex':
      return '#EF4444'; // red
    default:
      return '#6B7280'; // gray
  }
}

// Helper to format manufacturing time
export function formatManufacturingTime(hours?: number): string {
  if (!hours) return '7-10 days';
  const days = Math.ceil(hours / 24);
  return `${days} days`;
}
