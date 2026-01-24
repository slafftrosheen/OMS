/**
 * Backup Service
 * Handles database backups, restores, and scheduling
 */

import { supabase } from './supabase';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

const execAsync = promisify(exec);

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
  restoreIndexes?: boolean;
  restoreConstraints?: boolean;
}

export class BackupService {
  private static backupDir = process.env.BACKUP_DIR || './backups';
  private static databaseUrl = process.env.DATABASE_URL || '';

  /**
   * Create database backup
   */
  static async createBackup(options: BackupOptions = {}): Promise<string | null> {
    try {
      // Create backup record
      const { data: backupRecord, error: createError } = await supabase
        .rpc('create_backup', {
          p_config_id: options.configId || null,
          p_backup_type: options.backupType || 'full'
        });

      if (createError || !backupRecord) {
        throw new Error('Failed to create backup record');
      }

      const backupId = backupRecord;

      // Update status to in_progress
      await supabase
        .from('backup_history')
        .update({ 
          status: 'in_progress', 
          started_at: new Date().toISOString() 
        })
        .eq('id', backupId);

      const startTime = Date.now();

      // Get backup details
      const { data: backup } = await supabase
        .from('backup_history')
        .select('*, config:backup_configs(*)')
        .eq('id', backupId)
        .single();

      if (!backup) throw new Error('Backup record not found');

      // Create backup directory
      await fs.mkdir(this.backupDir, { recursive: true });

      const backupFileName = `${backup.backup_name}.sql`;
      const backupFilePath = path.join(this.backupDir, backupFileName);
      const compressedFilePath = `${backupFilePath}.gz`;

      // Build pg_dump command
      let pgDumpCmd = `pg_dump "${this.databaseUrl}"`;

      // Add table filters
      if (options.tables && options.tables.length > 0) {
        pgDumpCmd += ' ' + options.tables.map(t => `-t ${t}`).join(' ');
      }

      if (options.excludeTables && options.excludeTables.length > 0) {
        pgDumpCmd += ' ' + options.excludeTables.map(t => `-T ${t}`).join(' ');
      }

      // Add options
      pgDumpCmd += ' --clean --if-exists --no-owner --no-acl';

      // Execute backup
      const { stdout, stderr } = await execAsync(pgDumpCmd);

      if (stderr && !stderr.includes('NOTICE')) {
        throw new Error(`pg_dump error: ${stderr}`);
      }

      // Write to file
      await fs.writeFile(backupFilePath, stdout);

      // Compress if enabled
      let finalFilePath = backupFilePath;
      let fileSize = (await fs.stat(backupFilePath)).size;
      let compressedSize = fileSize;

      if (backup.config?.compression_enabled) {
        await this.compressFile(backupFilePath, compressedFilePath);
        compressedSize = (await fs.stat(compressedFilePath)).size;
        finalFilePath = compressedFilePath;

        // Remove uncompressed file
        await fs.unlink(backupFilePath);
      }

      // Calculate checksums
      const md5Hash = await this.calculateChecksum(finalFilePath, 'md5');
      const sha256Hash = await this.calculateChecksum(finalFilePath, 'sha256');

      // Get table counts
      const tableCounts = await this.getTableCounts();

      const duration = Math.floor((Date.now() - startTime) / 1000);

      // Update backup record
      await supabase
        .from('backup_history')
        .update({
          status: 'completed',
          file_size_bytes: fileSize,
          compressed_size_bytes: compressedSize,
          checksum_md5: md5Hash,
          checksum_sha256: sha256Hash,
          row_counts: tableCounts,
          total_rows: Object.values(tableCounts).reduce((sum, count) => sum + count, 0),
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
          expires_at: new Date(Date.now() + (backup.config?.retention_days || 30) * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', backupId);

      // Create success notification
      await this.createNotification(backupId, 'success', 
        `Backup completed successfully: ${backup.backup_name}`);

      console.log(`[Backup] Created: ${backupId} (${(compressedSize / 1024 / 1024).toFixed(2)} MB)`);

      return backupId;

    } catch (error) {
      console.error('[Backup] Error:', error);

      // Update backup record with error
      if (options.configId) {
        await supabase
          .from('backup_history')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            completed_at: new Date().toISOString()
          })
          .eq('backup_config_id', options.configId)
          .eq('status', 'in_progress');
      }

      return null;
    }
  }

  /**
   * Restore from backup
   */
  static async restoreBackup(backupId: string, options: RestoreOptions = {}): Promise<boolean> {
    try {
      // Create restore operation record
      const { data: restoreOp, error: createError } = await supabase
        .from('restore_operations')
        .insert({
          backup_history_id: backupId,
          restore_type: options.tables ? 'partial' : 'full',
          tables_to_restore: options.tables || null,
          overwrite_existing: options.overwriteExisting || false,
          preserve_current: options.preserveCurrent || true,
          restore_indexes: options.restoreIndexes || true,
          restore_constraints: options.restoreConstraints || true,
          status: 'validating',
          initiated_by: 'system' // Will be updated with actual user
        })
        .select()
        .single();

      if (createError || !restoreOp) {
        throw new Error('Failed to create restore operation');
      }

      // Get backup details
      const { data: backup } = await supabase
        .from('backup_history')
        .select('*')
        .eq('id', backupId)
        .single();

      if (!backup || backup.status !== 'completed') {
        throw new Error('Backup not found or not completed');
      }

      // Update status
      await supabase
        .from('restore_operations')
        .update({ status: 'in_progress' })
        .eq('id', restoreOp.id);

      const startTime = Date.now();

      // Get backup file
      const backupFilePath = path.join(this.backupDir, path.basename(backup.file_path));

      // Check if file exists
      try {
        await fs.access(backupFilePath);
      } catch {
        throw new Error('Backup file not found');
      }

      // Decompress if needed
      let sqlFilePath = backupFilePath;
      if (backupFilePath.endsWith('.gz')) {
        sqlFilePath = backupFilePath.replace('.gz', '');
        await this.decompressFile(backupFilePath, sqlFilePath);
      }

      // Build psql command
      let psqlCmd = `psql "${this.databaseUrl}" < "${sqlFilePath}"`;

      // Execute restore
      const { stderr } = await execAsync(psqlCmd);

      if (stderr && !stderr.includes('NOTICE')) {
        console.warn('[Restore] Warnings:', stderr);
      }

      // Clean up decompressed file
      if (sqlFilePath !== backupFilePath) {
        await fs.unlink(sqlFilePath);
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);

      // Update restore operation
      await supabase
        .from('restore_operations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
          tables_restored: options.tables?.length || 0,
          records_restored: 0 // Would need to calculate this based on actual restore
        })
        .eq('id', restoreOp.id);

      console.log(`[Restore] Completed: ${restoreOp.id}`);

      return true;

    } catch (error) {
      console.error('[Restore] Error:', error);

      return false;
    }
  }

  /**
   * Process scheduled backups
   */
  static async processScheduledBackups(): Promise<number> {
    try {
      const { data: configs, error } = await supabase
        .from('backup_configs')
        .select('*')
        .eq('is_active', true)
        .eq('schedule_enabled', true)
        .lte('next_run_at', new Date().toISOString());

      if (error) throw error;

      if (!configs || configs.length === 0) {
        return 0;
      }

      let processedCount = 0;

      for (const config of configs) {
        try {
          await this.createBackup({
            configId: config.id,
            backupType: config.backup_type,
            tables: config.include_tables,
            excludeTables: config.exclude_tables
          });

          processedCount++;
        } catch (error) {
          console.error(`[Backup] Failed for config ${config.id}:`, error);
        }
      }

      return processedCount;

    } catch (error) {
      console.error('[Backup] Process scheduled error:', error);
      return 0;
    }
  }

  /**
   * Clean up expired backups
   */
  static async cleanupExpiredBackups(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('cleanup_expired_backups');

      if (error) throw error;

      // Delete physical files
      const { data: expiredBackups } = await supabase
        .from('backup_history')
        .select('file_path')
        .eq('status', 'expired');

      if (expiredBackups) {
        for (const backup of expiredBackups) {
          const filePath = path.join(this.backupDir, path.basename(backup.file_path));
          
          try {
            await fs.unlink(filePath);
            console.log(`[Backup] Deleted expired file: ${filePath}`);
          } catch (error) {
            console.error(`[Backup] Failed to delete file: ${filePath}`, error);
          }
        }
      }

      return data || 0;

    } catch (error) {
      console.error('[Backup] Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Export data to JSON
   */
  static async exportToJSON(tables: string[]): Promise<any> {
    const data: Record<string, any[]> = {};

    for (const table of tables) {
      try {
        const { data: tableData, error } = await supabase
          .from(table)
          .select('*');

        if (!error && tableData) {
          data[table] = tableData;
        }
      } catch (error) {
        console.error(`[Export] Error exporting table ${table}:`, error);
      }
    }

    return data;
  }

  /**
   * Import data from JSON
   */
  static async importFromJSON(data: Record<string, any[]>): Promise<boolean> {
    try {
      for (const [table, rows] of Object.entries(data)) {
        if (rows.length === 0) continue;

        const { error } = await supabase
          .from(table)
          .upsert(rows);

        if (error) {
          console.error(`[Import] Error importing table ${table}:`, error);
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('[Import] Error:', error);
      return false;
    }
  }

  // Helper methods

  private static async compressFile(inputPath: string, outputPath: string): Promise<void> {
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);
    const gzip = createGzip();

    await pipeline(input, gzip, output);
  }

  private static async decompressFile(inputPath: string, outputPath: string): Promise<void> {
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);
    const gunzip = createGunzip();

    await pipeline(input, gunzip, output);
  }

  private static async calculateChecksum(filePath: string, algorithm: 'md5' | 'sha256'): Promise<string> {
    const hash = crypto.createHash(algorithm);
    const stream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private static async getTableCounts(): Promise<Record<string, number>> {
    const tables = [
      'draft_orders',
      'station_logs',
      'loading_days',
      'user_profiles',
      'attachments'
    ];

    const counts: Record<string, number> = {};

    for (const table of tables) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (!error) {
          counts[table] = count || 0;
        }
      } catch (error) {
        console.error(`[Backup] Error counting ${table}:`, error);
      }
    }

    return counts;
  }

  private static async createNotification(
    backupId: string,
    type: 'success' | 'failure' | 'warning',
    message: string
  ): Promise<void> {
    try {
      // Get admin emails
      const { data: admins } = await supabase
        .from('user_profiles')
        .select('user:auth.users(email)')
        .eq('role', 'admin');

      const recipients = admins?.map((a: any) => a.user.email).filter(Boolean) || [];

      if (recipients.length === 0) return;

      await supabase
        .from('backup_notifications')
        .insert({
          backup_history_id: backupId,
          notification_type: type,
          recipients,
          subject: `Backup ${type}: ${message}`,
          message
        });

    } catch (error) {
      console.error('[Backup] Notification error:', error);
    }
  }
}