// src/lib/server/search/SearchService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

export interface SearchResult {
    id: string;
    type: 'order' | 'client' | 'material' | 'file';
    title: string;
    description?: string;
    url: string;
    score: number;
    metadata?: any;
}

export class SearchService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Perform global search across multiple tables
     */
    async search(query: string, limit = 20): Promise<SearchResult[]> {
        if (!query || query.length < 2) return [];

        try {
            // In a real implementation, you might use a dedicated RPC function for multi-table search
            // or specific text search queries on each table.
            
            // Assuming Supabase 'websearch_to_tsquery' or plain 'ilike' for this example
            // Ideally, we'd have a 'search_index' view or a pg_trgm index.

            const results: SearchResult[] = [];

            // Search Orders
            const { data: orders } = await this.supabase
                .from('orders')
                .select('id, title, client, description, status')
                .or(`title.ilike.%${query}%,client.ilike.%${query}%`)
                .limit(10);

            if (orders) {
                results.push(...orders.map(o => ({
                    id: o.id,
                    type: 'order' as const,
                    title: `${o.title} (${o.client})`,
                    description: o.status,
                    url: `/orders/${o.id}`,
                    score: 1 // Simplified scoring
                })));
            }

            // Search Materials
            const { data: materials } = await this.supabase
                .from('materials')
                .select('id, name, category, current_stock')
                .ilike('name', `%${query}%`)
                .limit(5);

            if (materials) {
                results.push(...materials.map(m => ({
                    id: m.id,
                    type: 'material' as const,
                    title: m.name,
                    description: `${m.category} - Stock: ${m.current_stock}`,
                    url: `/inventory/${m.id}`,
                    score: 0.8
                })));
            }

            // Search Files (if applicable)
            const { data: files } = await this.supabase
                .from('order_files')
                .select('id, file_name, order_id')
                .ilike('file_name', `%${query}%`)
                .limit(5);

            if (files) {
                results.push(...files.map(f => ({
                    id: f.id,
                    type: 'file' as const,
                    title: f.file_name,
                    description: 'Order Attachment',
                    url: `/api/files/${f.id}/download?inline=true`,
                    score: 0.6
                })));
            }

            return results.sort((a, b) => b.score - a.score);

        } catch (error) {
            logger.error('Search failed', error as Error);
            return [];
        }
    }
}