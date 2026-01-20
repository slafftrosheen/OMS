import { z } from 'zod';

/**
 * Generic validation function that takes a Zod schema and validates input data
 */
export function validateData<T extends z.ZodSchema<any>>(
  schema: T,
  data: unknown
): {
  success: boolean;
  data?: z.infer<T>;
  errors?: Record<string, string[]>;
} {
  try {
    const parsed = schema.parse(data);
    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      });
      
      return {
        success: false,
        errors: fieldErrors
      };
    }
    
    return {
      success: false,
      errors: { general: ['Unknown validation error occurred'] }
    };
  }
}

/**
 * Validate a specific field against a schema
 */
export function validateField<T extends z.ZodSchema<any>>(
  schema: T,
  value: unknown
): {
  success: boolean;
  data?: z.infer<T>;
  error?: string;
} {
  try {
    const parsed = schema.parse(value);
    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message || 'Invalid field'
      };
    }
    
    return {
      success: false,
      error: 'Unknown validation error occurred'
    };
  }
}