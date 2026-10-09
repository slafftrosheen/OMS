import type { SupabaseClient } from '@supabase/supabase-js';
/**
 * Export API
 * Generate exports in multiple formats
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { exportCsv, mergeOrderExportRows } from '$lib/server/contracts/oms-r01';

// POST /api/export - Generate export
export const POST: RequestHandler = async ({ request, locals }) => {
  const supabase = locals.supabase;
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const body = await request.json();
  const {
    exportType,
    format,
    filters = {},
    columns = [],
    templateId = null
  } = body;

  if (!exportType || !format) {
    throw error(400, 'Missing required fields: exportType, format');
  }

  const startTime = Date.now();
  const exportId = crypto.randomUUID();

  try {
    // Create export history record
    const { data: historyRecord } = await supabase
      .from('export_history')
      .insert({
        id: exportId,
        export_type: exportType,
        format,
        template_id: templateId,
        filters,
        file_name: `export_${exportType}_${Date.now()}.${format}`,
        status: 'processing',
        created_by: user.id
      })
      .select()
      .single();

    // Fetch data based on export type
    let data: any[] = [];
    let recordsCount = 0;

    switch (exportType) {
      case 'orders':
        data = await fetchOrders(filters, supabase);
        break;
      case 'stations':
        data = await fetchStationLogs(filters, supabase);
        break;
      case 'loading_schedule':
        data = await fetchLoadingSchedule(filters, supabase);
        break;
      default:
        throw new Error('Invalid export type');
    }

    recordsCount = data.length;

    // Generate file based on format
    let fileBuffer: Buffer;
    let fileName: string;

    switch (format) {
      case 'excel':
        fileBuffer = await generateExcel(data, columns, exportType);
        fileName = `${exportType}_${Date.now()}.xlsx`;
        break;
      case 'pdf':
        fileBuffer = await generatePDF(data, columns, exportType);
        fileName = `${exportType}_${Date.now()}.pdf`;
        break;
      case 'csv':
        fileBuffer = await generateCSV(data, columns);
        fileName = `${exportType}_${Date.now()}.csv`;
        break;
      default:
        throw new Error('Invalid format');
    }

    // Upload to storage
    const filePath = `exports/${user.id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(filePath, fileBuffer, {
        contentType: getContentType(format),
        upsert: false
      });

    if (uploadError) {
      throw new Error('Failed to upload export file');
    }

    // Update export history
    const processingTime = Date.now() - startTime;
    await supabase
      .from('export_history')
      .update({
        status: 'completed',
        file_path: filePath,
        file_size: fileBuffer.length,
        records_count: recordsCount,
        completed_at: new Date().toISOString(),
        processing_time_ms: processingTime
      })
      .eq('id', exportId);

    // Generate signed URL for download
    const { data: signedUrl } = await supabase.storage
      .from('exports')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    return json({
      data: {
        id: exportId,
        fileName,
        downloadUrl: signedUrl?.signedUrl,
        recordsCount,
        fileSize: fileBuffer.length,
        processingTime
      }
    });

  } catch (err) {
    console.error('[Export API] Error:', err);

    // Update export history with error
    await supabase
      .from('export_history')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Export failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', exportId);

    throw error(500, err instanceof Error ? err.message : 'Export failed');
  }
};

// All joins below are explicit. draft_orders has no direct FK to loading_days
// and order_assignees uses draft_order_id + assignee_id, not assignees(email).
async function fetchOrders(filters: any, supabase: SupabaseClient): Promise<any[]> {
  let query = supabase.from('draft_orders').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.client) query = query.ilike('client', `%${filters.client}%`);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);

  const { data, error: dbError } = await query;
  if (dbError) throw dbError;
  const orders = data ?? [];
  if (!orders.length) return [];

  const dates = [...new Set(orders.map(row => row.loading_date).filter((v): v is string => typeof v === 'string' && !!v))];
  const orderIds = orders.map(row => row.id);
  const daysQuery = dates.length
    ? await supabase.from('loading_days').select('date,notes,max_capacity,is_blocked').in('date', dates)
    : { data: [], error: null };
  if (daysQuery.error) throw daysQuery.error;
  const assigneesQuery = await supabase.from('order_assignees')
    .select('draft_order_id,assignee_id').in('draft_order_id', orderIds);
  if (assigneesQuery.error) throw assigneesQuery.error;

  return mergeOrderExportRows(orders, daysQuery.data ?? [], assigneesQuery.data ?? []);
}

async function fetchStationLogs(filters: any, supabase: SupabaseClient): Promise<any[]> {
  // station_timeline exposes station, action, details, created_at and operator name.
  let query = supabase.from('station_timeline')
    .select('*').order('created_at', { ascending: false });
  if (filters.station) query = query.eq('station', filters.station);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  const { data, error: dbError } = await query;
  if (dbError) throw dbError;
  return data ?? [];
}

async function fetchLoadingSchedule(filters: any, supabase: SupabaseClient): Promise<any[]> {
  let query = supabase.from('loading_days').select('*').order('date', { ascending: true });
  if (filters.dateFrom) query = query.gte('date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('date', filters.dateTo);
  const { data, error: daysError } = await query;
  if (daysError) throw daysError;
  const days = data ?? [];
  if (!days.length) return [];

  const dates = days.map(d => d.date);
  // loading_event_pos links to loading_events / calendar_events, NOT loading_days.
  const { data: events, error: eventsError } = await supabase.from('calendar_events')
    .select('id,date').eq('kind', 'loading').in('date', dates);
  if (eventsError) throw eventsError;
  const eventIds = (events ?? []).map(e => e.id);
  if (!eventIds.length) return days.map(day => ({ ...day, orders: [] }));

  const { data: links, error: linksError } = await supabase.from('loading_event_pos')
    .select('loading_event_id,draft_order_id').in('loading_event_id', eventIds);
  if (linksError) throw linksError;
  const orderIds = [...new Set((links ?? []).map(link => link.draft_order_id).filter(Boolean))];
  if (!orderIds.length) return days.map(day => ({ ...day, orders: [] }));
  const { data: orders, error: ordersError } = await supabase.from('draft_orders')
    .select('id,po_number,title,client,status').in('id', orderIds);
  if (ordersError) throw ordersError;

  const dateByEvent = new Map((events ?? []).map(event => [event.id, event.date]));
  const orderById = new Map((orders ?? []).map(order => [order.id, order]));
  const byDate = new Map<string, any[]>();
  for (const link of links ?? []) {
    const date = dateByEvent.get(link.loading_event_id);
    const order = orderById.get(link.draft_order_id);
    if (!date || !order) continue;
    const list = byDate.get(date) ?? [];
    if (!list.some(entry => entry.id === order.id)) list.push(order);
    byDate.set(date, list);
  }
  return days.map(day => ({ ...day, orders: byDate.get(day.date) ?? [] }));
}

// Generate Excel file
async function generateExcel(
  data: any[],
  columns: string[],
  exportType: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(exportType);

  // Set default columns if not provided
  if (columns.length === 0 && data.length > 0) {
    columns = Object.keys(data[0]);
  }

  // Add header row with styling
  const headerRow = worksheet.addRow(columns.map(col =>
    col.replace(/_/g, ' ').toUpperCase()
  ));

  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Add data rows
  data.forEach(row => {
    const values = columns.map(col => {
      const value = row[col];

      // Format dates
      if (value && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(value);
      }

      // Format objects/arrays
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
      }

      return value;
    });

    worksheet.addRow(values);
  });

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  // Add filters
  if (columns.length > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length }
    };
  }

  // Freeze header row
  worksheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];

  // Add footer
  const footerRow = worksheet.addRow([]);
  footerRow.getCell(1).value = `Generated: ${new Date().toLocaleString()}`;
  footerRow.getCell(1).font = { italic: true, size: 9 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Generate PDF file
async function generatePDF(
  data: any[],
  columns: string[],
  exportType: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text(`${exportType.toUpperCase()} Export`, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Set default columns
    if (columns.length === 0 && data.length > 0) {
      columns = Object.keys(data[0]).slice(0, 6); // Limit to 6 columns for PDF
    }

    // Table header
    const tableTop = doc.y;
    const columnWidth = (doc.page.width - 100) / Math.max(1, columns.length);

    doc.fontSize(10).fillColor('#4472C4');
    columns.forEach((col, i) => {
      doc.text(
        col.replace(/_/g, ' ').toUpperCase(),
        50 + (i * columnWidth),
        tableTop,
        { width: columnWidth, align: 'center' }
      );
    });

    doc.moveDown();
    doc.strokeColor('#4472C4').lineWidth(2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.5);

    // Table rows
    doc.fillColor('black').fontSize(9);
    let rowCount = 0;
    const maxRows = 30; // Limit rows per page

    data.slice(0, maxRows).forEach((row, rowIndex) => {
      const y = doc.y;

      columns.forEach((col, i) => {
        let value = row[col];
        
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        
        if (typeof value === 'string' && value.length > 30) {
          value = value.substring(0, 27) + '...';
        }

        doc.text(
          value || '-',
          50 + (i * columnWidth),
          y,
          { width: columnWidth, align: 'left' }
        );
      });

      doc.moveDown(0.8);
      rowCount++;
    });

    if (data.length > maxRows) {
      doc.moveDown();
      doc.fontSize(8).fillColor('gray')
        .text(`Showing ${maxRows} of ${data.length} records. Download Excel for full data.`);
    }

    // Footer
    doc.fontSize(8).fillColor('gray')
      .text(
        `Page 1 of 1 | Total Records: ${data.length}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

    doc.end();
  });
}

// Pure in-memory CSV: no temp.csv races, ESM require(), or workbook formula injection.
async function generateCSV(data: any[], columns: string[]): Promise<Buffer> {
  const selectedColumns = columns.length ? columns : data.length ? Object.keys(data[0]) : [];
  return Buffer.from(exportCsv(data, selectedColumns), 'utf8');
}

// Get content type for format
function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    csv: 'text/csv',
    json: 'application/json'
  };
  return contentTypes[format] || 'application/octet-stream';
}