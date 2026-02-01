// src/lib/server/inventory/InventoryService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logging/logger';

interface Material {
    id: string;
    name: string;
    category: string;
    thickness?: number;
    color?: string;
    unit: 'sheet' | 'sqm' | 'meter' | 'kg' | 'piece';
    currentStock: number;
    minStock: number;
    maxStock: number;
    costPerUnit: number;
}

interface StockMovement {
    id: string;
    materialId: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
    orderId?: string;
    performedBy: string;
    timestamp: Date;
}

interface LowStockAlert {
    material: Material;
    currentStock: number;
    minStock: number;
    deficit: number;
    suggestedReorderQuantity: number;
}

export class InventoryService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Get current stock level for a material
     */
    async getStock(materialId: string): Promise<number> {
        const { data, error } = await this.supabase
            .from('materials')
            .select('current_stock')
            .eq('id', materialId)
            .single();

        if (error || !data) {
            throw new Error('Material not found');
        }

        return data.current_stock;
    }

    /**
     * Record stock movement (intake, consumption, adjustment)
     */
    async recordMovement(
        materialId: string,
        type: 'IN' | 'OUT' | 'ADJUSTMENT',
        quantity: number,
        reason: string,
        userId: string,
        orderId?: string
    ): Promise<StockMovement> {
        
        // Get current stock
        const currentStock = await this.getStock(materialId);

        // Calculate new stock
        let newStock: number;
        switch (type) {
            case 'IN':
                newStock = currentStock + quantity;
                break;
            case 'OUT':
                newStock = currentStock - quantity;
                if (newStock < 0) {
                    throw new Error('Insufficient stock');
                }
                break;
            case 'ADJUSTMENT':
                newStock = quantity; // Direct set
                break;
        }

        // Update stock level
        const { error: updateError } = await this.supabase
            .from('materials')
            .update({ current_stock: newStock })
            .eq('id', materialId);

        if (updateError) {
            logger.error('Failed to update stock', updateError);
            throw new Error('Stock update failed');
        }

        // Log movement
        const { data: movement, error: logError } = await this.supabase
            .from('stock_movements')
            .insert({
                material_id: materialId,
                type,
                quantity,
                reason,
                order_id: orderId,
                performed_by: userId,
                previous_stock: currentStock,
                new_stock: newStock
            })
            .select()
            .single();

        if (logError) {
            logger.error('Failed to log stock movement', logError);
            throw new Error('Movement logging failed');
        }

        // Check for low stock alert
        await this.checkLowStock(materialId);

        logger.info('Stock movement recorded', {
            materialId,
            type,
            quantity,
            newStock
        });

        return {
            id: movement.id,
            materialId,
            type,
            quantity,
            reason,
            orderId,
            performedBy: userId,
            timestamp: new Date(movement.created_at)
        };
    }

    /**
     * Allocate materials to an order
     */
    async allocateToOrder(
        orderId: string,
        materials: Array<{ materialId: string; quantity: number }>,
        userId: string
    ): Promise<void> {
        
        // Verify all materials are available
        for (const item of materials) {
            const stock = await this.getStock(item.materialId);
            if (stock < item.quantity) {
                const { data: material } = await this.supabase
                    .from('materials')
                    .select('name')
                    .eq('id', item.materialId)
                    .single();
                
                throw new Error(`Insufficient stock for ${material?.name || 'material'}`);
            }
        }

        // Record movements for all materials
        for (const item of materials) {
            await this.recordMovement(
                item.materialId,
                'OUT',
                item.quantity,
                `Allocated to order ${orderId}`,
                userId,
                orderId
            );
        }

        // Update order with material allocation
        await this.supabase
            .from('order_materials')
            .insert(
                materials.map(m => ({
                    order_id: orderId,
                    material_id: m.materialId,
                    quantity_allocated: m.quantity,
                    allocated_by: userId
                }))
            );

        logger.info('Materials allocated to order', { orderId, materialCount: materials.length });
    }

    /**
     * Check for low stock and create alerts
     */
    private async checkLowStock(materialId: string): Promise<void> {
        const { data: material, error } = await this.supabase
            .from('materials')
            .select('*')
            .eq('id', materialId)
            .single();

        if (error || !material) return;

        if (material.current_stock <= material.min_stock) {
            // Create low stock notification
            const { data: admins } = await this.supabase
                .from('profiles')
                .select('id')
                .contains('roles', { Admin: 'SuperAdmin' });

            if (admins) {
                await this.supabase.from('notifications').insert(
                    admins.map(admin => ({
                        user_id: admin.id,
                        title: 'Low Stock Alert',
                        message: `Material "${material.name}" is running low. Current stock: ${material.current_stock} ${material.unit}`,
                        type: 'warning',
                        action_url: '/inventory',
                        read: false
                    }))
                );
            }

            logger.warn('Low stock detected', {
                materialId,
                material: material.name,
                currentStock: material.current_stock,
                minStock: material.min_stock
            });
        }
    }

    /**
     * Get all materials with low stock
     */
    async getLowStockAlerts(): Promise<LowStockAlert[]> {
        const { data: materials, error } = await this.supabase
            .from('materials')
            .select('*')
            .lte('current_stock', this.supabase.raw('min_stock'));

        if (error || !materials) {
            return [];
        }

        return materials.map(m => ({
            material: m as Material,
            currentStock: m.current_stock,
            minStock: m.min_stock,
            deficit: m.min_stock - m.current_stock,
            suggestedReorderQuantity: Math.max(
                m.max_stock - m.current_stock,
                m.min_stock * 2 - m.current_stock
            )
        }));
    }

    /**
     * Get stock movement history
     */
    async getMovementHistory(
        materialId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<StockMovement[]> {
        
        let query = this.supabase
            .from('stock_movements')
            .select('*, materials(name), profiles(username)');

        if (materialId) {
            query = query.eq('material_id', materialId);
        }

        if (startDate) {
            query = query.gte('created_at', startDate.toISOString());
        }

        if (endDate) {
            query = query.lte('created_at', endDate.toISOString());
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error || !data) {
            return [];
        }

        return data.map(m => ({
            id: m.id,
            materialId: m.material_id,
            type: m.type,
            quantity: m.quantity,
            reason: m.reason,
            orderId: m.order_id,
            performedBy: m.performed_by,
            timestamp: new Date(m.created_at)
        }));
    }

    /**
     * Calculate total inventory value
     */
    async calculateInventoryValue(): Promise<{
        totalValue: number;
        byCategory: Record<string, number>;
        topValueItems: Array<{ material: string; value: number }>;
    }> {
        
        const { data: materials, error } = await this.supabase
            .from('materials')
            .select('*');

        if (error || !materials) {
            return {
                totalValue: 0,
                byCategory: {},
                topValueItems: []
            };
        }

        let totalValue = 0;
        const byCategory: Record<string, number> = {};
        const itemValues: Array<{ material: string; value: number }> = [];

        materials.forEach(m => {
            const value = m.current_stock * m.cost_per_unit;
            totalValue += value;

            byCategory[m.category] = (byCategory[m.category] || 0) + value;
            itemValues.push({ material: m.name, value });
        });

        const topValueItems = itemValues
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        return {
            totalValue: Math.round(totalValue * 100) / 100,
            byCategory,
            topValueItems
        };
    }
}