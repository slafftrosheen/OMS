// src/lib/server/ai/AIService.ts
import { logger } from '../logging/logger';
import { SYSTEM_PROMPTS, TASK_PROMPTS } from '../../ai/prompts';

interface AIConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface AIResponse {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

interface OrderAnalysis {
    summary: string;
    suggestedStages: Record<string, string>;
    estimatedDuration: number;
    risks: string[];
    recommendations: string[];
}

class AIService {
    private config: AIConfig;
    private enabled: boolean;

    constructor() {
        this.enabled = !!process.env.DASHSCOPE_API_KEY;
        
        if (!this.enabled) {
            logger.warn('AI features disabled - DASHSCOPE_API_KEY not configured');
            // We'll initialize config with dummy values to satisfy TS, but enabled flag prevents usage
            this.config = { apiKey: '', baseUrl: '', model: '' };
            return;
        }

        this.config = {
            apiKey: process.env.DASHSCOPE_API_KEY!,
            baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
            model: process.env.DASHSCOPE_MODEL || 'qwen-plus'
        };

        logger.info('AI Service initialized', { model: this.config.model });
    }

    /**
     * Send chat completion request to Qwen API
     */
    private async chat(messages: ChatMessage[]): Promise<AIResponse> {
        if (!this.enabled) {
            throw new Error('AI service not configured');
        }

        const response = await fetch(`${this.config.baseUrl}/services/aigc/text-generation/generation`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.config.model,
                input: {
                    messages
                },
                parameters: {
                    temperature: 0.7,
                    top_p: 0.8,
                    max_tokens: 2000
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('AI API request failed', new Error(errorText), {
                status: response.status
            });
            throw new Error('AI request failed');
        }

        const data = await response.json();
        
        return {
            content: data.output.text,
            usage: {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.total_tokens
            }
        };
    }

    /**
     * Analyze order and suggest workflow
     */
    async analyzeOrder(orderData: {
        title: string;
        description?: string;
        client: string;
        dueDate: string;
        materials?: string[];
        files?: { name: string; type: string }[];
    }): Promise<OrderAnalysis> {
        if (!this.enabled) {
            throw new Error('AI service not configured');
        }

        const systemPrompt = SYSTEM_PROMPTS.FABRICATION_EXPERT;

        const userPrompt = TASK_PROMPTS.ANALYZE_ORDER(
            orderData.title,
            orderData.materials || [],
            orderData.description || `Client: ${orderData.client}, Due: ${orderData.dueDate}`
        );

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);

            logger.info('AI order analysis completed', {
                tokens: response.usage.totalTokens
            });

            // Parse JSON response
            // AI might return Markdown code blocks (```json ... ```), need to strip them
            let content = response.content;
            if (content.includes('```json')) {
                content = content.replace(/```json\n?|\n?```/g, '');
            }
            
            const analysis = JSON.parse(content);
            return analysis;

        } catch (error) {
            logger.error('AI order analysis failed', error as Error, {
                orderTitle: orderData.title
            });
            
            // Return fallback analysis
            return {
                summary: `Order for ${orderData.client}`,
                suggestedStages: {
                    'CAD': 'NOT_STARTED',
                    'CNC': 'NOT_STARTED',
                    'ASSEMBLY': 'NOT_STARTED',
                    'PACKAGING': 'NOT_STARTED'
                },
                estimatedDuration: 7,
                risks: ['AI analysis unavailable'],
                recommendations: ['Manual review recommended']
            };
        }
    }

    /**
     * Generate order description from title and client info
     */
    async generateDescription(title: string, client: string, notes?: string): Promise<string> {
        if (!this.enabled) {
            return `Order for ${client}: ${title}`;
        }

        const systemPrompt = `You are an assistant that generates professional order descriptions for manufacturing. 
Keep descriptions concise, clear, and professional.`;

        const userPrompt = `Generate a professional order description for:
Title: ${title}
Client: ${client}
${notes ? `Additional notes: ${notes}` : ''}`;

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);

            return response.content.trim();

        } catch (error) {
            logger.error('AI description generation failed', error as Error);
            return `Order for ${client}: ${title}`;
        }
    }

    /**
     * Suggest materials based on order details
     */
    async suggestMaterials(orderDetails: {
        title: string;
        description?: string;
        type?: 'Lightbox' | 'Flat' | '3D Letter';
    }): Promise<string[]> {
        if (!this.enabled) {
            return [];
        }

        const systemPrompt = SYSTEM_PROMPTS.FABRICATION_EXPERT;
        
        const type = (orderDetails.type === 'Lightbox' || orderDetails.type === '3D Letter') 
            ? orderDetails.type 
            : 'Flat';

        const userPrompt = TASK_PROMPTS.SUGGEST_MATERIALS('Indoor', type);

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);

            const materials = response.content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('```'));
                
            return materials;

        } catch (error) {
            logger.error('AI material suggestion failed', error as Error);
            return [];
        }
    }

    /**
     * Answer FAQ questions using AI
     */
    async answerFAQ(question: string, context?: string): Promise<string> {
        if (!this.enabled) {
            throw new Error('AI service not configured');
        }

        const systemPrompt = `You are a helpful assistant for an order management system.
Answer questions clearly and concisely based on the manufacturing workflow context provided.
${context ? `Context: ${context}` : ''}`;

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ]);

            return response.content;

        } catch (error) {
            logger.error('AI FAQ answer failed', error as Error);
            throw new Error('Could not generate answer');
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }
}

export const aiService = new AIService();
