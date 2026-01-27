// src/lib/server/analytics/AnalyticsService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

interface TimeRange {
    start: Date;
    end: Date;
}

interface OrderMetrics {
    total: number;
    completed: number;
    inProgress: number;
    onHold: number;
    cancelled: number;
    averageCompletionTime: number;
    onTimeDeliveryRate: number;
}

interface StationMetrics {
    station: string;
    throughput: number;
    averageProcessingTime: number;
    utilizationRate: number;
    bottleneckScore: number;
    errorRate: number;
}

interface RevenueMetrics {
    totalRevenue: number;
    averageOrderValue: number;
    revenueByMonth: Array<{ month: string; revenue: number }>;
    topClients: Array<{ client: string; revenue: number; orderCount: number }>;
}

interface QualityMetrics {
    totalReworks: number;
    reworkRate: number;
    reworksByReason: Record<string, number>;
    reworkCostImpact: number;
    reworkTimeImpact: number;
    qualityScore: number;
}

export class AnalyticsService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Get comprehensive order metrics
     */
    async getOrderMetrics(timeRange: TimeRange): Promise<OrderMetrics> {
        const { data: orders, error } = await this.supabase
            .from('orders')
            .select('status, created_at, completed_at, due_date')
            .gte('created_at', timeRange.start.toISOString())
            .lte('created_at', timeRange.end.toISOString());

        if (error || !orders) {
            logger.error('Failed to fetch order metrics', error);
            return this.getEmptyOrderMetrics();
        }

        const total = orders.length;
        const completed = orders.filter(o => o.status === 'COMPLETED').length;
        const inProgress = orders.filter(o => o.status === 'ACTIVE').length;
        const onHold = orders.filter(o => o.status === 'ON_HOLD').length;
        const cancelled = orders.filter(o => o.status === 'CANCELLED').length;

        // Calculate average completion time
        const completedOrders = orders.filter(o => o.completed_at);
        const completionTimes = completedOrders.map(o => 
            new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()
        );
        const averageCompletionTime = completionTimes.length > 0
            ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length / (1000 * 60 * 60 * 24) // Convert to days
            : 0;

        // Calculate on-time delivery rate
        const onTimeDeliveries = completedOrders.filter(o => 
            new Date(o.completed_at) <= new Date(o.due_date)
        ).length;
        const onTimeDeliveryRate = completedOrders.length > 0
            ? (onTimeDeliveries / completedOrders.length) * 100
            : 0;

        return {
            total,
            completed,
            inProgress,
            onHold,
            cancelled,
            averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
            onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 10) / 10
        };
    }

    /**
     * Get station performance metrics
     */
    async getStationMetrics(timeRange: TimeRange): Promise<StationMetrics[]> {
        const { data: logs, error } = await this.supabase
            .from('station_logs')
            .select('station, action, timestamp, metadata, order_id')
            .gte('timestamp', timeRange.start.toISOString())
            .lte('timestamp', timeRange.end.toISOString());

        if (error || !logs) {
            logger.error('Failed to fetch station metrics', error);
            return [];
        }

        const stationGroups = this.groupByStation(logs);
        const metrics: StationMetrics[] = [];

        for (const [station, stationLogs] of Object.entries(stationGroups)) {
            // Calculate throughput (orders processed)
            const processedOrders = new Set(stationLogs.map(l => l.order_id)).size;

            // Calculate average processing time
            const processingTimes = this.calculateProcessingTimes(stationLogs);
            const averageProcessingTime = processingTimes.length > 0
                ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
                : 0;

            // Calculate utilization rate (percentage of time actively working)
            const utilizationRate = this.calculateUtilizationRate(stationLogs, timeRange);

            // Calculate bottleneck score (higher = more bottleneck)
            const bottleneckScore = this.calculateBottleneckScore(station, stationLogs);

            // Calculate error rate (reworks initiated at this station)
            const errors = stationLogs.filter(l => l.action === 'REWORK_INITIATED').length;
            const errorRate = processedOrders > 0 ? (errors / processedOrders) * 100 : 0;

            metrics.push({
                station,
                throughput: processedOrders,
                averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
                utilizationRate: Math.round(utilizationRate * 10) / 10,
                bottleneckScore: Math.round(bottleneckScore * 10) / 10,
                errorRate: Math.round(errorRate * 10) / 10
            });
        }

        return metrics.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
    }

    /**
     * Get revenue and financial metrics
     */
    async getRevenueMetrics(timeRange: TimeRange): Promise<RevenueMetrics> {
        const { data: orders, error } = await this.supabase
            .from('orders')
            .select('client, price, created_at, status')
            .gte('created_at', timeRange.start.toISOString())
            .lte('created_at', timeRange.end.toISOString())
            .not('price', 'is', null);

        if (error || !orders) {
            logger.error('Failed to fetch revenue metrics', error);
            return this.getEmptyRevenueMetrics();
        }

        const totalRevenue = orders.reduce((sum, o) => sum + (o.price || 0), 0);
        const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

        // Revenue by month
        const revenueByMonth = this.aggregateRevenueByMonth(orders);

        // Top clients by revenue
        const clientRevenue = new Map<string, { revenue: number; count: number }>();
        orders.forEach(o => {
            const existing = clientRevenue.get(o.client) || { revenue: 0, count: 0 };
            clientRevenue.set(o.client, {
                revenue: existing.revenue + (o.price || 0),
                count: existing.count + 1
            });
        });

        const topClients = Array.from(clientRevenue.entries())
            .map(([client, data]) => ({
                client,
                revenue: data.revenue,
                orderCount: data.count
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            averageOrderValue: Math.round(averageOrderValue * 100) / 100,
            revenueByMonth,
            topClients
        };
    }

    /**
     * Get quality and rework metrics
     */
    async getQualityMetrics(timeRange: TimeRange): Promise<QualityMetrics> {
        const { data: reworks, error } = await this.supabase
            .from('rework_cycles')
            .select('reason, cost_impact, time_impact, order_id')
            .gte('created_at', timeRange.start.toISOString())
            .lte('created_at', timeRange.end.toISOString());

        const { data: orders } = await this.supabase
            .from('orders')
            .select('id')
            .gte('created_at', timeRange.start.toISOString())
            .lte('created_at', timeRange.end.toISOString());

        if (error || !reworks) {
            logger.error('Failed to fetch quality metrics', error);
            return this.getEmptyQualityMetrics();
        }

        const totalReworks = reworks.length;
        const totalOrders = orders?.length || 1;
        const reworkRate = (totalReworks / totalOrders) * 100;

        // Aggregate by reason
        const reworksByReason: Record<string, number> = {};
        reworks.forEach(r => {
            reworksByReason[r.reason] = (reworksByReason[r.reason] || 0) + 1;
        });

        const reworkCostImpact = reworks.reduce((sum, r) => sum + (r.cost_impact || 0), 0);
        const reworkTimeImpact = reworks.reduce((sum, r) => sum + (r.time_impact || 0), 0);

        // Quality score (100 - rework rate, capped at 0)
        const qualityScore = Math.max(0, 100 - reworkRate);

        return {
            totalReworks,
            reworkRate: Math.round(reworkRate * 10) / 10,
            reworksByReason,
            reworkCostImpact: Math.round(reworkCostImpact * 100) / 100,
            reworkTimeImpact: Math.round(reworkTimeImpact * 10) / 10,
            qualityScore: Math.round(qualityScore * 10) / 10
        };
    }

    /**
     * Get predictive insights using historical data
     */
    async getPredictiveInsights(timeRange: TimeRange): Promise<{
        bottleneckPredictions: Array<{ station: string; severity: 'high' | 'medium' | 'low' }>;
        capacityWarnings: Array<{ date: string; expectedLoad: number; capacity: number }>;
        delayRiskOrders: Array<{ orderId: string; riskScore: number; factors: string[] }>;
    }> {
        // Get historical data
        const stationMetrics = await this.getStationMetrics(timeRange);

        // Predict bottlenecks
        const bottleneckPredictions = stationMetrics
            .filter(s => s.bottleneckScore > 50)
            .map(s => ({
                station: s.station,
                severity: s.bottleneckScore > 80 ? 'high' as const : 
                         s.bottleneckScore > 65 ? 'medium' as const : 'low' as const
            }));

        // Calculate capacity warnings (simplified - should use more sophisticated forecasting)
        const { data: upcomingOrders } = await this.supabase
            .from('orders')
            .select('due_date, stages')
            .eq('status', 'ACTIVE')
            .gte('due_date', new Date().toISOString());

        const capacityWarnings = this.calculateCapacityWarnings(upcomingOrders || []);

        // Identify orders at risk of delay
        const delayRiskOrders = await this.identifyDelayRisks();

        return {
            bottleneckPredictions,
            capacityWarnings,
            delayRiskOrders
        };
    }

    /**
     * Generate dashboard summary
     */
    async getDashboardSummary(timeRange: TimeRange): Promise<{
        orders: OrderMetrics;
        stations: StationMetrics[];
        revenue: RevenueMetrics;
        quality: QualityMetrics;
        trends: {
            ordersGrowth: number;
            revenueGrowth: number;
            qualityTrend: 'improving' | 'stable' | 'declining';
        };
    }> {
        const [orders, stations, revenue, quality] = await Promise.all([
            this.getOrderMetrics(timeRange),
            this.getStationMetrics(timeRange),
            this.getRevenueMetrics(timeRange),
            this.getQualityMetrics(timeRange)
        ]);

        // Calculate trends by comparing with previous period
        const previousPeriod = this.getPreviousPeriod(timeRange);
        const previousMetrics = await this.getOrderMetrics(previousPeriod);
        const previousRevenue = await this.getRevenueMetrics(previousPeriod);
        const previousQuality = await this.getQualityMetrics(previousPeriod);

        const ordersGrowth = this.calculateGrowth(previousMetrics.total, orders.total);
        const revenueGrowth = this.calculateGrowth(previousRevenue.totalRevenue, revenue.totalRevenue);
        const qualityTrend = quality.qualityScore > previousQuality.qualityScore + 5 ? 'improving' :
                            quality.qualityScore < previousQuality.qualityScore - 5 ? 'declining' : 'stable';

        return {
            orders,
            stations,
            revenue,
            quality,
            trends: {
                ordersGrowth: Math.round(ordersGrowth * 10) / 10,
                revenueGrowth: Math.round(revenueGrowth * 10) / 10,
                qualityTrend
            }
        };
    }

    // ========== Helper Methods ==========

    private groupByStation(logs: any[]): Record<string, any[]> {
        return logs.reduce((groups, log) => {
            const station = log.station || 'UNKNOWN';
            if (!groups[station]) groups[station] = [];
            groups[station].push(log);
            return groups;
        }, {} as Record<string, any[]>);
    }

    private calculateProcessingTimes(logs: any[]): number[] {
        const times: number[] = [];
        const orderLogs = new Map<string, any[]>();

        // Group logs by order
        logs.forEach(log => {
            if (!orderLogs.has(log.order_id)) {
                orderLogs.set(log.order_id, []);
            }
            orderLogs.get(log.order_id)!.push(log);
        });

        // Calculate time between start and completion for each order
        orderLogs.forEach(orderLog => {
            const sorted = orderLog.sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            const start = sorted.find(l => l.action.includes('STARTED') || l.action.includes('IN_PROGRESS'));
            const end = sorted.find(l => l.action.includes('COMPLETED'));

            if (start && end) {
                const duration = (new Date(end.timestamp).getTime() - new Date(start.timestamp).getTime()) / (1000 * 60 * 60); // hours
                times.push(duration);
            }
        });

        return times;
    }

    private calculateUtilizationRate(logs: any[], timeRange: TimeRange): number {
        const totalPeriod = timeRange.end.getTime() - timeRange.start.getTime();
        const activePeriods = this.calculateProcessingTimes(logs);
        const totalActive = activePeriods.reduce((a, b) => a + b, 0) * 60 * 60 * 1000; // Convert hours to ms
        return (totalActive / totalPeriod) * 100;
    }

    private calculateBottleneckScore(station: string, logs: any[]): number {
        // Factors: processing time, queue length, error rate
        const avgProcessingTime = this.calculateProcessingTimes(logs).reduce((a, b) => a + b, 0) / logs.length || 0;
        const queueLength = logs.filter(l => l.action.includes('WAITING')).length;
        const errors = logs.filter(l => l.action.includes('REWORK') || l.action.includes('ERROR')).length;

        // Weighted score (0-100)
        const timeScore = Math.min(100, avgProcessingTime * 5);
        const queueScore = Math.min(100, queueLength * 10);
        const errorScore = Math.min(100, errors * 15);

        return (timeScore * 0.4 + queueScore * 0.4 + errorScore * 0.2);
    }

    private aggregateRevenueByMonth(orders: any[]): Array<{ month: string; revenue: number }> {
        const monthlyRevenue = new Map<string, number>();

        orders.forEach(o => {
            const date = new Date(o.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyRevenue.set(monthKey, (monthlyRevenue.get(monthKey) || 0) + (o.price || 0));
        });

        return Array.from(monthlyRevenue.entries())
            .map(([month, revenue]) => ({ month, revenue: Math.round(revenue * 100) / 100 }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }

    private calculateCapacityWarnings(orders: any[]): Array<{ date: string; expectedLoad: number; capacity: number }> {
        const dailyLoad = new Map<string, number>();

        orders.forEach(o => {
            const date = new Date(o.due_date).toISOString().split('T')[0];
            dailyLoad.set(date, (dailyLoad.get(date) || 0) + 1);
        });

        const capacity = 10; // Simplified - should be configurable per station
        return Array.from(dailyLoad.entries())
            .filter(([, load]) => load > capacity * 0.8)
            .map(([date, load]) => ({
                date,
                expectedLoad: load,
                capacity
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    private async identifyDelayRisks(): Promise<Array<{ orderId: string; riskScore: number; factors: string[] }>> {
        const { data: orders } = await this.supabase
            .from('orders')
            .select('id, due_date, stages, created_at, rework_count')
            .eq('status', 'ACTIVE');

        if (!orders) return [];

        return orders.map(o => {
            const factors: string[] = [];
            let riskScore = 0;

            // Factor 1: Time remaining vs completion percentage
            const dueDate = new Date(o.due_date).getTime();
            const now = Date.now();
            const daysRemaining = (dueDate - now) / (1000 * 60 * 60 * 24);

            if (daysRemaining < 3) {
                riskScore += 40;
                factors.push('Less than 3 days until due date');
            }

            // Factor 2: Completion percentage
            const stages = o.stages as Record<string, string>;
            const completedStages = Object.values(stages).filter(s => s === 'COMPLETED').length;
            const totalStages = Object.keys(stages).length;
            const completionRate = completedStages / totalStages;

            if (completionRate < 0.5 && daysRemaining < 5) {
                riskScore += 30;
                factors.push('Low completion rate for time remaining');
            }

            // Factor 3: Rework history
            if (o.rework_count > 2) {
                riskScore += 20;
                factors.push('Multiple rework cycles');
            }

            // Factor 4: Blocked stages
            const blockedStages = Object.values(stages).filter(s => s === 'BLOCKED').length;
            if (blockedStages > 0) {
                riskScore += blockedStages * 15;
                factors.push(`${blockedStages} blocked stage(s)`);
            }

            return {
                orderId: o.id,
                riskScore: Math.min(100, riskScore),
                factors
            };
        })
        .filter(o => o.riskScore > 50)
        .sort((a, b) => b.riskScore - a.riskScore);
    }

    private getPreviousPeriod(current: TimeRange): TimeRange {
        const duration = current.end.getTime() - current.start.getTime();
        return {
            start: new Date(current.start.getTime() - duration),
            end: new Date(current.start.getTime())
        };
    }

    private calculateGrowth(previous: number, current: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }

    private getEmptyOrderMetrics(): OrderMetrics {
        return {
            total: 0,
            completed: 0,
            inProgress: 0,
            onHold: 0,
            cancelled: 0,
            averageCompletionTime: 0,
            onTimeDeliveryRate: 0
        };
    }

    private getEmptyRevenueMetrics(): RevenueMetrics {
        return {
            totalRevenue: 0,
            averageOrderValue: 0,
            revenueByMonth: [],
            topClients: []
        };
    }

    private getEmptyQualityMetrics(): QualityMetrics {
        return {
            totalReworks: 0,
            reworkRate: 0,
            reworksByReason: {},
            reworkCostImpact: 0,
            reworkTimeImpact: 0,
            qualityScore: 100
        };
    }
}