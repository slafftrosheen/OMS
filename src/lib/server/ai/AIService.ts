// src/lib/server/ai/AIService.ts
import { logger } from '../logging/logger';

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

        const systemPrompt = `You are an AI expert assistant for an advertising fabrication shop (Reclame Fabriek). 
Your role is to analyze fabrication orders and suggest optimal workflow stages, estimated timelines, and identify technical risks.

Available fabrication stages: 
- CAD: Design and technical preparation
- CNC: Milling or laser cutting (Acrylic, PVC, Dibond, Aluminum)
- SANDING: Post-processing cut edges
- BENDING: Heat bending or profile bending
- WELDING: For metal structures
- PAINT: Spray painting or powder coating
- ASSEMBLY: Final joining, LED installation, and bonding
- QC: Quality control inspection
- LOGISTICS: Packaging and delivery prep

Respond in strict JSON format with:
- summary: Professional technical overview of the project
- suggestedStages: Object with stage names as keys and suggested status ('NOT_STARTED')
- estimatedDuration: Total estimated working days
- risks: Array of potential technical issues (e.g., bonding compatibility, material thickness vs bending radius)
- recommendations: Array of actionable fabrication suggestions`;

        const userPrompt = `Analyze this fabrication order:
Title: ${orderData.title}
Client: ${orderData.client}
Due Date: ${orderData.dueDate}
${orderData.description ? `Technical Specs: ${orderData.description}` : ''}
${orderData.materials ? `Planned Materials: ${orderData.materials.join(', ')}` : ''}
${orderData.files ? `Reference Files: ${orderData.files.map(f => f.name).join(', ')}` : ''}`;

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);

            logger.info('AI order analysis completed', {
                tokens: response.usage.totalTokens
            });

            // Parse JSON response
            const analysis = JSON.parse(response.content);
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
        type?: string;
    }): Promise<string[]> {
        if (!this.enabled) {
            return [];
        }

        const systemPrompt = `You are an expert in manufacturing materials. 
Suggest appropriate materials based on the order details. 
Return only a JSON array of material names.`;

        const userPrompt = `Suggest materials for this order:
Title: ${orderDetails.title}
${orderDetails.description ? `Description: ${orderDetails.description}` : ''}
${orderDetails.type ? `Type: ${orderDetails.type}` : ''}`;

        try {
            const response = await this.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]);

            const materials = JSON.parse(response.content);
            return Array.isArray(materials) ? materials : [];

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