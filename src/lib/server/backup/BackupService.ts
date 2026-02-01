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

      // TODO: Download backup file from storage and restore
      // This requires implementing download in StorageService
      logger.warn('Restore functionality not yet implemented', { backupId });
      
      return false;
    } catch (error) {
      logger.error('Restore failed', { error, backupId });
      throw new Error(error instanceof Error ? error.message : 'Restore failed');
    }
  }

  /**
   * Process scheduled backups
   */
  static async processScheduledBackups(): Promise<number> {
    logger.info('Processing scheduled backups (placeholder)');
    // TODO: Implement scheduled backup processing
    return 0;
  }

  /**
   * Clean up expired backups
   */
  static async cleanupExpiredBackups(): Promise<number> {
    logger.info('Cleaning up expired backups (placeholder)');
    // TODO: Implement cleanup based on retention policies
    return 0;
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