// src/lib/server/qr/QRCodeService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { logger } from '../logging/logger';

interface QRCodeData {
    id: string;
    orderId: string;
    station?: string;
    type: 'order' | 'station' | 'tracking';
    data: any;
    imageUrl: string;
    createdAt: Date;
}

export class QRCodeService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Generate QR code for order
     */
    async generateOrderQR(orderId: string, userId: string): Promise<QRCodeData> {
        // Get order details
        const { data: order, error } = await this.supabase
            .from('orders')
            .select('id, title, client')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            throw new Error('Order not found');
        }

        // Generate QR code content (URL to order detail page)
        const qrContent = {
            type: 'order',
            orderId: order.id,
            url: `${process.env.BASE_URL}/orders/${order.id}`,
            title: order.title,
            client: order.client,
            generated: new Date().toISOString()
        };

        // Generate QR code image as data URL
        const svgString = await QRCode.toString(JSON.stringify(qrContent), {
            errorCorrectionLevel: 'H',
            type: 'svg',
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        const qrImage = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;

        // Save to database
        const { data: qrRecord, error: insertError } = await this.supabase
            .from('qr_codes')
            .insert({
                order_id: orderId,
                type: 'order',
                content: qrContent,
                image_data: qrImage,
                created_by: userId
            })
            .select()
            .single();

        if (insertError) {
            logger.error('Failed to save QR code', insertError);
            throw new Error('Could not generate QR code');
        }

        logger.info('QR code generated', { orderId, qrId: qrRecord.id });

        return {
            id: qrRecord.id,
            orderId: order.id,
            type: 'order',
            data: qrContent,
            imageUrl: qrImage,
            createdAt: new Date(qrRecord.created_at)
        };
    }

    /**
     * Generate QR code for station tracking
     */
    async generateStationQR(orderId: string, station: string, userId: string): Promise<QRCodeData> {
        const qrContent = {
            type: 'station',
            orderId,
            station,
            url: `${process.env.BASE_URL}/production?order=${orderId}&station=${station}`,
            action: 'track',
            generated: new Date().toISOString()
        };

        const svgString = await QRCode.toString(JSON.stringify(qrContent), {
            errorCorrectionLevel: 'H',
            type: 'svg',
            width: 300
        });
        const qrImage = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;

        const { data: qrRecord, error } = await this.supabase
            .from('qr_codes')
            .insert({
                order_id: orderId,
                station,
                type: 'station',
                content: qrContent,
                image_data: qrImage,
                created_by: userId
            })
            .select()
            .single();

        if (error) {
            throw new Error('Could not generate station QR code');
        }

        return {
            id: qrRecord.id,
            orderId,
            station,
            type: 'station',
            data: qrContent,
            imageUrl: qrImage,
            createdAt: new Date(qrRecord.created_at)
        };
    }

    /**
     * Generate printable QR code sheet for order (all stations)
     */
    async generateOrderQRSheet(orderId: string, userId: string): Promise<{
        orderQR: QRCodeData;
        stationQRs: QRCodeData[];
    }> {
        const STATIONS = ['CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'];

        const orderQR = await this.generateOrderQR(orderId, userId);
        
        const stationQRs = await Promise.all(
            STATIONS.map(station => this.generateStationQR(orderId, station, userId))
        );

        return {
            orderQR,
            stationQRs
        };
    }

    /**
     * Scan and validate QR code
     */
    async validateQRCode(content: string, userId: string): Promise<{
        valid: boolean;
        type: string;
        orderId: string;
        station?: string;
        action?: string;
    }> {
        try {
            const data = JSON.parse(content);

            // Validate structure
            if (!data.type || !data.orderId) {
                return { valid: false, type: '', orderId: '' };
            }

            // Check if order exists
            const { data: order, error } = await this.supabase
                .from('orders')
                .select('id')
                .eq('id', data.orderId)
                .single();

            if (error || !order) {
                return { valid: false, type: data.type, orderId: data.orderId };
            }

            // Log scan event
            await this.logScan(data, userId);

            return {
                valid: true,
                type: data.type,
                orderId: data.orderId,
                station: data.station,
                action: data.action
            };

        } catch {
            return { valid: false, type: '', orderId: '' };
        }
    }

    /**
     * Log QR code scan event
     */
    private async logScan(qrData: any, userId: string): Promise<void> {
        await this.supabase.from('qr_scan_logs').insert({
            order_id: qrData.orderId,
            station: qrData.station,
            scanned_by: userId,
            scan_type: qrData.type,
            metadata: qrData
        });
    }

    /**
     * Get QR code statistics
     */
    async getQRStats(orderId?: string): Promise<{
        totalGenerated: number;
        totalScans: number;
        scansByStation: Record<string, number>;
        recentScans: Array<{ timestamp: string; station: string; user: string }>;
    }> {
        let query = this.supabase.from('qr_scan_logs').select('*');
        
        if (orderId) {
            query = query.eq('order_id', orderId);
        }

        const { data: scans, error } = await query;

        if (error || !scans) {
            return {
                totalGenerated: 0,
                totalScans: 0,
                scansByStation: {},
                recentScans: []
            };
        }

        const scansByStation: Record<string, number> = {};
        scans.forEach(scan => {
            if (scan.station) {
                scansByStation[scan.station] = (scansByStation[scan.station] || 0) + 1;
            }
        });

        const recentScans = scans
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10)
            .map(scan => ({
                timestamp: scan.created_at,
                station: scan.station || 'Unknown',
                user: scan.scanned_by
            }));

        return {
            totalGenerated: scans.length,
            totalScans: scans.length,
            scansByStation,
            recentScans
        };
    }
}