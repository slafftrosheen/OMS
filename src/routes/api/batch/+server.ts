import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface BatchOperation {
    operation: 'create' | 'update' | 'delete';
    entity: 'order' | 'material' | 'stage';
    data: any;
}

export const POST: RequestHandler = async ({ request, locals }) => {
    const supabase = locals.supabase;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        throw error(401, 'Unauthorized');
    }

    try {
        const { operations } = await request.json() as { operations: BatchOperation[] };

        if (!operations || !Array.isArray(operations)) {
            throw error(400, 'Invalid operations array');
        }

        if (operations.length > 100) {
            throw error(400, 'Maximum 100 operations per batch');
        }

        const results = await processBatchOperations(supabase, operations, session.user.id);

        return json({
            success: true,
            results,
            total: operations.length,
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });

    } catch (err: any) {
        console.error('Batch operation error:', err);
        throw error(500, err.message || 'Failed to process batch operations');
    }
};

async function processBatchOperations(
    supabase: any,
    operations: BatchOperation[],
    userId: string
) {
    const results = [];

    for (const [index, op] of operations.entries()) {
        try {
            let result;

            switch (op.entity) {
                case 'order':
                    result = await processOrderOperation(supabase, op, userId);
                    break;
                case 'material':
                    result = await processMaterialOperation(supabase, op, userId);
                    break;
                case 'stage':
                    result = await processStageOperation(supabase, op, userId);
                    break;
                default:
                    throw new Error(`Unknown entity type: ${op.entity}`);
            }

            results.push({
                index,
                success: true,
                data: result
            });

        } catch (err: any) {
            results.push({
                index,
                success: false,
                error: err.message
            });
        }
    }

    return results;
}

async function processOrderOperation(supabase: any, op: BatchOperation, userId: string) {
    switch (op.operation) {
        case 'create': {
            const { data: newOrder, error: createError } = await supabase
                .from('orders')
                .insert({ ...op.data, created_by: userId })
                .select()
                .single();

            if (createError) throw createError;
            return newOrder;
        }

        case 'update': {
            const { data: updatedOrder, error: updateError } = await supabase
                .from('orders')
                .update(op.data)
                .eq('id', op.data.id)
                .select()
                .single();

            if (updateError) throw updateError;
            return updatedOrder;
        }

        case 'delete': {
            const { error: deleteError } = await supabase
                .from('orders')
                .delete()
                .eq('id', op.data.id);

            if (deleteError) throw deleteError;
            return { deleted: true, id: op.data.id };
        }

        default:
            throw new Error(`Unknown operation: ${op.operation}`);
    }
}

async function processMaterialOperation(supabase: any, op: BatchOperation, userId: string) {
    switch (op.operation) {
        case 'create': {
            const { data, error: createError } = await supabase
                .from('order_materials')
                .insert(op.data)
                .select()
                .single();

            if (createError) throw createError;
            return data;
        }

        case 'update': {
            const { data: updated, error: updateError } = await supabase
                .from('order_materials')
                .update(op.data)
                .eq('id', op.data.id)
                .select()
                .single();

            if (updateError) throw updateError;
            return updated;
        }

        case 'delete': {
            const { error: deleteError } = await supabase
                .from('order_materials')
                .delete()
                .eq('id', op.data.id);

            if (deleteError) throw deleteError;
            return { deleted: true, id: op.data.id };
        }

        default:
            throw new Error(`Unknown operation: ${op.operation}`);
    }
}

async function processStageOperation(supabase: any, op: BatchOperation, userId: string) {
    switch (op.operation) {
        case 'create': {
            const { data, error: createError } = await supabase
                .from('order_stages')
                .insert({ ...op.data, updated_by: userId })
                .select()
                .single();

            if (createError) throw createError;
            return data;
        }

        case 'update': {
            const { data: updated, error: updateError } = await supabase
                .from('order_stages')
                .update({ ...op.data, updated_by: userId })
                .eq('id', op.data.id)
                .select()
                .single();

            if (updateError) throw updateError;
            return updated;
        }

        case 'delete': {
            const { error: deleteError } = await supabase
                .from('order_stages')
                .delete()
                .eq('id', op.data.id);

            if (deleteError) throw deleteError;
            return { deleted: true, id: op.data.id };
        }

        default:
            throw new Error(`Unknown operation: ${op.operation}`);
    }
}
