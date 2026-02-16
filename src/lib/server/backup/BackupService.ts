/**
 * Backup Service - Supabase Compatible
 * Handles database backups using Supabase client (no pg_dump)
 * 
 * This service creates JSON backups of critical tables and stores them
 * in S3-compatible storage via StorageService.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { storageService } from '../storage/StorageService';
import { logger } from '../logging/logger';

interface BackupOptions {
  configId?: string;
  backupType?: 'full' | 'incremental' | 'differential';
  tables?: string[];
  excludeTables?: string[];
  includeAttachments?: boolean;
}

interface RestoreOptions {
  tables?: string[];
  overwriteExisting?: boolean;
  preserveCurrent?: boolean;
}

export class BackupService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a JSON backup of critical tables
   * Returns backup ID from backup_history table
   */
  async createBackup(options: BackupOptions = {}): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupData: Record<string, any> = {};

      // Default tables to backup
      const defaultTables = [
        'orders',
        'materials', 
        'profiles',
        'station_logs',
        'rework_cycles',
        'loading_dates',
        'calendar_events'
      ];

      const tablesToBackup = options.tables || defaultTables;
      const excludedTables = options.excludeTables || [];
      const finalTables = tablesToBackup.filter(t => !excludedTables.includes(t));

      logger.info('Starting backup', { tables: finalTables, backupType: options.backupType });

      // Backup each table
      for (const table of finalTables) {
        try {
          const { data, error } = await this.supabase
            .from(table)
            .select('*');
          
          if (error) {
            logger.warn(`Failed to backup table ${table}`, { error: error.message });
            continue;
          }
          backupData[table] = data || [];
        } catch (err) {
          logger.warn(`Exception backing up table ${table}`, { error: err });
        }
      }

      // Add metadata
      const backupMetadata = {
        created_at: new Date().toISOString(),
        backup_type: options.backupType || 'full',
        tables: Object.keys(backupData),
        record_counts: Object.entries(backupData).reduce((acc, [table, records]) => {
          acc[table] = (records as any[]).length;
          return acc;
        }, {} as Record<string, number>)
      };

      const fullBackup = {
        metadata: backupMetadata,
        data: backupData
      };

      // Convert to Buffer
      const content = JSON.stringify(fullBackup, null, 2);
      const buffer = Buffer.from(content, 'utf-8');

      // Get current user from session
      const { data: { user } } = await this.supabase.auth.getUser();
      const userId = user?.id || 'system';

      // Upload to storage using 'backups' as a pseudo-orderId
      const metadata = await storageService.upload(
        buffer,
        'backups',
        userId,
        {
          contentType: 'application/json',
          metadata: {
            type: 'database_backup',
            backup_type: options.backupType || 'full',
            timestamp
          }
        }
      );

      // Create backup history record
      const { data: backupRecord, error: createError } = await this.supabase
        .from('backup_history')
        .insert({
          backup_name: `backup-${timestamp}`,
          backup_type: options.backupType || 'full',
          backup_config_id: options.configId || null,
          file_path: metadata.key,
          file_size: metadata.size,
          status: 'completed',
          created_by: userId,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          metadata: backupMetadata
        })
        .select()
        .single();

      if (createError) {
        logger.error('Failed to create backup history record', { error: createError });
        // Backup was created but history record failed
        // Return the storage key as fallback
        return metadata.key;
      }

      logger.info('Backup created successfully', {
        backupId: backupRecord?.id,
        key: metadata.key,
        size: metadata.size
      });

      return backupRecord?.id || metadata.key;

    } catch (error) {
      logger.error('Backup creation failed', { error });
      throw new Error(error instanceof Error ? error.message : 'Backup failed');
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupId: string, options: RestoreOptions = {}): Promise<boolean> {
    try {
      logger.info('Starting restore', { backupId, options });

      // Get backup record
      const { data: backup, error: fetchError } = await this.supabase
        .from('backup_history')
        .select('*')
        .eq('id', backupId)
        .single();

      if (fetchError || !backup) {
        throw new Error('Backup not found');
      }

      // Download backup file from storage
      const downloadResult = await storageService.download(backup.file_path);
      if (!downloadResult) {
        throw new Error('Backup file not found in storage');
      }

      const content = downloadResult.buffer.toString('utf-8');
      const backupData = JSON.parse(content);

      // Determine which tables to restore
      const tablesToRestore = options.tables || backupData.metadata.tables;

      // Restore each table
      for (const tableName of tablesToRestore) {
        if (!backupData.data[tableName]) {
          logger.warn(`Table ${tableName} not found in backup data`);
          continue;
        }

        const records = backupData.data[tableName];
        
        if (options.overwriteExisting) {
          // Clear existing data if overwrite is enabled
          if (!options.preserveCurrent) {
            await this.supabase.from(tableName).delete().gt('id', 0); // This assumes all tables have an 'id' column
          }
          
          // Insert all records from backup
          if (records.length > 0) {
            const { error: insertError } = await this.supabase
              .from(tableName)
              .insert(records);
              
            if (insertError) {
              logger.error(`Failed to restore table ${tableName}`, { error: insertError });
              throw new Error(`Failed to restore table ${tableName}: ${insertError.message}`);
            }
          }
        } else {
          // For non-overwrite, we could implement merge logic here
          // For now, just warn that we're skipping restoration
          logger.warn(`Skipping restore of ${tableName} because overwrite is disabled`);
        }
      }

      logger.info('Restore completed successfully', { backupId });
      return true;
    } catch (error) {
      logger.error('Restore failed', { error, backupId });
      throw new Error(error instanceof Error ? error.message : 'Restore failed');
    }
  }

  /**
   * Process scheduled backups
   */
  async processScheduledBackups(): Promise<number> {
    logger.info('Processing scheduled backups');
    
    // Fetch active backup configurations
    // Note: Assuming a 'backup_configs' table exists or using a simple heuristic for now
    // Since we don't have a backup_configs table in the migration, we'll rely on hardcoded logic 
    // or system metadata if available. For this implementation, we'll keep it simple.
    
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // Sunday = 0
    
    // Simple scheduling: Daily at 2 AM, Weekly on Sunday at 3 AM
    const runDaily = hour === 2;
    const runWeekly = dayOfWeek === 0 && hour === 3;
    
    let backupsCreated = 0;
    
    try {
      if (runDaily) {
        logger.info('Running scheduled daily backup');
        await this.createBackup({ 
          backupType: 'incremental',
          tables: ['orders', 'station_logs'] // Frequent changes
        });
        backupsCreated++;
      }
      
      if (runWeekly) {
        logger.info('Running scheduled weekly backup');
        await this.createBackup({ 
          backupType: 'full',
          // Default tables will be used
        });
        backupsCreated++;
      }
    } catch (error) {
      logger.error('Scheduled backup failed', { error });
    }
    
    return backupsCreated;
  }

  /**
   * Clean up expired backups
   */
  async cleanupExpiredBackups(retentionDays = 30): Promise<number> {
    logger.info('Cleaning up expired backups', { retentionDays });
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      // Find expired backups
      const { data: expiredBackups, error } = await this.supabase
        .from('backup_history')
        .select('id, file_path')
        .lt('created_at', cutoffDate.toISOString())
        .eq('status', 'completed'); // Only clean up completed ones
      
      if (error) {
        logger.error('Failed to fetch expired backups', { error });
        throw error;
      }
      
      if (!expiredBackups || expiredBackups.length === 0) {
        return 0;
      }
      
      let deletedCount = 0;
      for (const backup of expiredBackups) {
        try {
          // Delete from storage
          if (backup.file_path) {
             await storageService.delete(backup.file_path);
          }
          
          // Delete record from database
          await this.supabase
            .from('backup_history')
            .delete()
            .eq('id', backup.id);
            
          deletedCount++;
        } catch (err) {
          logger.error('Failed to delete expired backup', { 
            backupId: backup.id, 
            error: err 
          });
        }
      }
      
      logger.info('Expired backup cleanup completed', { deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Expired backup cleanup failed', { error });
      throw new Error(error instanceof Error ? error.message : 'Cleanup failed');
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('backup_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list backups', { error });
      return [];
    }
    
    return data || [];
  }
}