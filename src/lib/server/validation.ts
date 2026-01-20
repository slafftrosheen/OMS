import { z } from 'zod';
import { error } from '@sveltejs/kit';

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
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      
      err.errors.forEach((e) => {
        const field = e.path.join('.');
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(e.message);
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
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: err.errors[0]?.message || 'Invalid field'
      };
    }
    
    return {
      success: false,
      error: 'Unknown validation error occurred'
    };
  }
}

/**
 * Validate request body against a schema
 */
export async function validateRequest<T extends z.ZodSchema<any>>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  const body = await request.json().catch(() => ({}));
  const result = validateData(schema, body);

  if (!result.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: result.errors
    } as any);
  }

  return result.data!;
}
