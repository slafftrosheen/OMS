// src/lib/profiles/types.ts
// Profile templates, fields, materials, colours, files, draft orders.

/** Available field types for profile forms. */
export type FieldType =
    | 'material_selector'
    | 'thickness_selector'
    | 'color_ral'
    | 'color_pantone'
    | 'color_oracal'
    | 'color_hex'
    | 'dimension_input'
    | 'text_input'
    | 'textarea'
    | 'checkbox'
    | 'toggle'
    | 'multi_select_chips'
    | 'dropdown'
    | 'numeric_input'
    | 'date_input'
    | 'icon_selector'
    | 'file_upload';

/** Conditional logic rule for showing/hiding fields. */
export interface ConditionalRule {
    field_key: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: unknown;
    action: 'show' | 'hide' | 'require' | 'disable' | 'enable';
}

/** Validation rule for field values. */
export interface ValidationRule {
    type: 'required' | 'min' | 'max' | 'pattern' | 'custom' | 'minLength' | 'maxLength';
    value?: unknown;
    message?: string;
    customValidator?: (value: unknown) => boolean;
}

/** Localized text object for multi-language support. */
export interface LocalizedText {
    en: string;
    ru: string;
    lv: string;
}

/** Profile template definition (e.g. P7st, P1). */
export interface ProfileTemplate {
    id: number;
    code: string;
    name: string;
    version: number;
    isActive: boolean;
    sections: ProfileSection[];
    metadata?: {
        icon?: string;
        description?: LocalizedText;
        category?: string;
        manufacturingTime?: number;
    };
    createdAt?: string;
    createdBy?: string;
}

/** Section within a profile (e.g. LINE_FREEZER, BENDER). */
export interface ProfileSection {
    id: number;
    name: string;
    displayName: LocalizedText;
    icon?: string;
    orderIndex: number;
    fields: ProfileField[];
    isCollapsible?: boolean;
    isRequired?: boolean;
}

/** Individual field within a section. */
export interface ProfileField {
    id: number;
    fieldKey: string;
    fieldType: FieldType;
    label: LocalizedText;
    placeholder?: LocalizedText;
    helpText?: LocalizedText;
    isRequired: boolean;
    defaultValue?: unknown;
    options?: unknown[];
    conditionalLogic?: ConditionalRule[];
    validationRules?: ValidationRule[];
    orderIndex: number;
    config?: FieldConfig;
}

/** Alias used by older callers (Field === ProfileField). */
export type Field = ProfileField;

/** Field-specific configuration options. */
export interface FieldConfig {
    unit?: string;
    step?: number;
    min?: number;
    max?: number;
    showPreview?: boolean;
    previewSize?: 'sm' | 'md' | 'lg';
    maxSelections?: number;
    acceptedTypes?: string[];
    maxSizeBytes?: number;
    width?: string;
    disabled?: boolean;
    readonly?: boolean;
}

/** Material definition in the library. */
export interface Material {
    id: number;
    category: string;
    code: string;
    name: LocalizedText;
    thicknessOptions: number[];
    metadata?: {
        density?: number;
        supplier?: string;
        cost?: number;
        color?: string;
    };
}

/** Color system entry (RAL, PANTONE, ORACAL, HEX). */
export interface ColorSystem {
    id: number;
    systemType: 'RAL' | 'PANTONE' | 'ORACAL' | 'HEX';
    code: string;
    name: string;
    hexValue: string;
    rgb: { r: number; g: number; b: number };
    cmyk?: { c: number; m: number; y: number; k: number };
    finish?: 'matte' | 'gloss' | 'metallic' | 'satin';
}

/** File reference for uploaded files. */
export interface FileReference {
    id: number;
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    uploadedBy: string;
    uploadedAt: string;
    url?: string;
    metadata?: {
        width?: number;
        height?: number;
        pages?: number;
    };
}

/** Draft order containing multiple profiles. */
export interface DraftOrder {
    id: number;
    poNumber: string;
    client: string;
    title: string;
    dueDate: string;
    loadingDate?: string;
    cdrFile?: FileReference;
    pdfFile?: FileReference;
    profiles: OrderProfile[];
    notes?: string;
    status: 'draft' | 'pending' | 'approved' | 'in_production';
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

/** Single profile instance within an order. */
export interface OrderProfile {
    id: number;
    profileTemplateId: number;
    profileTemplate?: ProfileTemplate;
    quantity: 1 | 2 | 3 | 4;
    configuration: ProfileConfiguration;
    notes?: string;
    orderIndex: number;
}

/** Profile configuration values (field_key -> value). */
export interface ProfileConfiguration {
    [sectionName: string]: {
        [fieldKey: string]: unknown;
    };
}

/** Profile version history entry. */
export interface ProfileVersionHistory {
    id: number;
    profileTemplateId: number;
    version: number;
    changes: unknown;
    changedBy: string;
    changedAt: string;
    changeDescription: string;
}
