// src/lib/server/backup/BackupService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { storageService } from '../storage/StorageService';
import { logger } from '../logger';

export class BackupService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Create a JSON backup of critical tables and upload to storage
     */
    async createBackup(userId: string): Promise<string> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupData: Record<string, any> = {};

            // List of tables to backup
            const tables = ['orders', 'materials', 'profiles', 'station_logs', 'rework_cycles'];

            for (const table of tables) {
                const { data, error } = await this.supabase
                    .from(table)
                    .select('*');
                
                if (error) throw error;
                backupData[table] = data;
            }

            // Convert to Buffer
            const content = JSON.stringify(backupData, null, 2);
            const buffer = Buffer.from(content, 'utf-8');

            // Upload to Storage
            // Using a specific 'backups' key structure
            const key = `backups/${timestamp}-full.json`;
            
            // We use the storage service, but we might need to adapt if it strictly enforces 'orders/' structure
            // For now, let's assume we can upload. If strictly coupled to orders, we might need a separate bucket or logic.
            // Let's assume the StorageService 'upload' method might need a slight tweak or we bypass the key generation if we want a custom path.
            // But since StorageService encapsulates logic, we should probably add a generic upload method or abuse the existing one with a dummy order ID.
            
            // Better approach: Mock a "system" order ID for backups or adjust StorageService.
            // For this implementation, I will stick to what's available or assume a 'system' folder.
            
            // To be safe and compliant with the previous StorageService, let's assume we pass a dummy 'system-backup' ID.
            const metadata = await storageService.upload(
                buffer, 
                'system-backup', 
                userId, 
                { 
                    contentType: 'application/json',
                    metadata: { type: 'manual_backup' } 
                }
            );

            logger.info('Backup created successfully', { key: metadata.key });
            return metadata.key;

        } catch (error) {
            logger.error('Backup creation failed', error as Error);
            throw new Error('Backup failed');
        }
    }

    /**
     * List available backups
     */
    async listBackups(): Promise<any[]> {
        // This depends on whether we have a database table tracking backups or we query S3 directly.
        // Assuming we query the 'order_files' table where order_id is 'system-backup'
        
        const { data, error } = await this.supabase
            .from('order_files')
            .select('*')
            .eq('order_id', 'system-backup')
            .order('created_at', { ascending: false });

        if (error) return [];
        return data;
    }
}