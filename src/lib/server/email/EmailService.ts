// src/lib/server/email/EmailService.ts
import { logger } from '../logging/logger';
// Note: Assuming nodemailer is available or will be installed. 
// If not, this serves as the architectural implementation to be enabled later.
import nodemailer from 'nodemailer'; 

interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: any[];
}

export class EmailService {
    private transporter: any;
    private enabled: boolean;

    constructor() {
        this.enabled = !!process.env.SMTP_HOST;

        if (this.enabled) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                }
            });
            logger.info('Email Service initialized', { host: process.env.SMTP_HOST });
        } else {
            logger.warn('Email Service disabled - SMTP not configured');
        }
    }

    /**
     * Send an email
     */
    async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.enabled) {
            logger.debug('Email skipped (service disabled)', { to: options.to, subject: options.subject });
            return false;
        }

        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_FROM || 'OMS <noreply@example.com>',
                ...options
            });
            
            logger.info('Email sent successfully', { to: options.to, subject: options.subject });
            return true;
        } catch (error) {
            logger.error('Failed to send email', error as Error, { to: options.to });
            return false;
        }
    }

    /**
     * Send order creation notification
     */
    async sendOrderCreatedNotification(to: string, order: any): Promise<void> {
        await this.sendEmail({
            to,
            subject: `New Order Created: ${order.title}`,
            html: `
                <h1>New Order Created</h1>
                <p>Order <strong>${order.title}</strong> for client <strong>${order.client}</strong> has been created.</p>
                <p>Due Date: ${new Date(order.due_date).toLocaleDateString()}</p>
                <a href="${process.env.BASE_URL}/orders/${order.id}">View Order</a>
            `
        });
    }

    /**
     * Send rework alert
     */
    async sendReworkAlert(to: string[], order: any, station: string, reason: string): Promise<void> {
        await this.sendEmail({
            to,
            subject: `⚠️ Rework Alert: ${order.title}`,
            html: `
                <h1 style="color: #d32f2f;">Rework Initiated</h1>
                <p>Order: <strong>${order.title}</strong></p>
                <p>Station: <strong>${station}</strong></p>
                <p>Reason: ${reason}</p>
                <a href="${process.env.BASE_URL}/orders/${order.id}">View Details</a>
            `
        });
    }

    /**
     * Send low stock alert
     */
    async sendLowStockAlert(to: string, data: { 
        materials: Array<{ 
            name: string; 
            currentStock: number; 
            minStock: number; 
            unit: string;
            url: string;
        }>;
        summary: string;
    }): Promise<void> {
        const materialsHtml = data.materials.map(m => 
            `<li><strong>${m.name}</strong>: ${m.currentStock} ${m.unit} (min: ${m.min_stock})</li>`
        ).join('');

        await this.sendEmail({
            to,
            subject: `🚨 Low Stock Alert`,
            html: `
                <h1 style="color: #ff9800;">Low Stock Alert</h1>
                <p>The following materials are below minimum stock levels:</p>
                <ul>${materialsHtml}</ul>
                <p><a href="${data.materials[0]?.url}">View Inventory</a></p>
            `
        });
    }
}

export const emailService = new EmailService();