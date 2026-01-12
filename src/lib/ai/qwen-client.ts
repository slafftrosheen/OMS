// src/lib/ai/qwen-client.ts
import { env } from '$env/dynamic/private';

interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface QwenCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
}

interface QwenResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Qwen AI Client using Alibaba Cloud Model Studio
 * Compatible with OpenAI API standards
 */
export class QwenClient {
  private apiKey: string;
  private baseURL: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = env.DASHSCOPE_API_KEY || '';
    this.baseURL = env.QWEN_API_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    this.defaultModel = env.QWEN_MODEL || 'qwen-plus';

    if (!this.apiKey) {
      console.warn('⚠️ DASHSCOPE_API_KEY not set. Qwen AI features will not work.');
    }
  }

  /**
   * Chat completion (multi-turn conversation)
   */
  async chat(
    messages: QwenMessage[],
    options: QwenCompletionOptions = {}
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DASHSCOPE_API_KEY not configured');
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        top_p: options.topP ?? 0.9,
        stream: options.stream ?? false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qwen API error: ${response.status} - ${error}`);
    }

    const data: QwenResponse = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Simple text completion
   */
  async complete(
    prompt: string,
    options: QwenCompletionOptions = {}
  ): Promise<string> {
    return this.chat([
      { role: 'user', content: prompt }
    ], options);
  }

  /**
   * Analyze order configuration for issues
   */
  async analyzeOrder(orderData: any): Promise<{
    issues: string[];
    warnings: string[];
    suggestions: string[];
  }> {
    const prompt = `
You are a manufacturing quality assurance expert for signage production.
Analyze this order configuration for potential issues:

${JSON.stringify(orderData, null, 2)}

Check for:
1. Material compatibility issues
2. Dimension feasibility
3. Missing required specifications
4. Process conflicts (e.g., painting requirements vs materials)
5. LED specifications completeness
6. Color code validity (RAL, PANTONE)

Respond ONLY with valid JSON in this exact format:
{
  "issues": ["Critical issue 1", "Critical issue 2"],
  "warnings": ["Warning 1", "Warning 2"],
  "suggestions": ["Optimization 1", "Optimization 2"]
}`;

    const response = await this.complete(prompt, { temperature: 0.3 });

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('Failed to parse Qwen response:', response);
      return {
        issues: [],
        warnings: ['AI analysis failed to parse response'],
        suggestions: []
      };
    }
  }

  /**
   * Suggest profile type from PDF text
   */
  async suggestProfile(pdfText: string, availableProfiles: string[]): Promise<{
    suggestedProfile: string;
    confidence: number;
    reasoning: string;
  }> {
    const prompt = `
Based on this manufacturing specification text, suggest the best profile template:

Text: "${pdfText.substring(0, 1000)}"

Available profiles: ${availableProfiles.join(', ')}

Consider:
- Mentioned materials (OPAL, ALU, PVC)
- Size specifications
- LED requirements
- Outdoor vs indoor
- Mounting type

Respond ONLY with valid JSON:
{
  "suggestedProfile": "P7st",
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}`;

    const response = await this.complete(prompt, { temperature: 0.4 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      suggestedProfile: availableProfiles[0] || 'P7st',
      confidence: 0.5,
      reasoning: 'Unable to determine from text'
    };
  }

  /**
   * Parse natural language order description
   */
  async parseOrderDescription(
    description: string,
    profileStructure: any
  ): Promise<any> {
    const prompt = `
Convert this natural language order description into structured configuration:

Description: "${description}"

Target profile structure:
${JSON.stringify(profileStructure, null, 2)}

Extract and fill in as many fields as possible. For missing information, use null.

Respond ONLY with valid JSON matching the profile structure.`;

    const response = await this.complete(prompt, { temperature: 0.3 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {};
  }

  /**
   * Generate manufacturing instructions
   */
  async generateManufacturingInstructions(order: any): Promise<string> {
    const prompt = `
Generate detailed step-by-step manufacturing instructions for this order:

${JSON.stringify(order, null, 2)}

Include:
1. CNC routing specifications
2. Bending parameters and sequence
3. Painting instructions with color codes
4. LED assembly steps
5. QC checkpoints

Format as markdown with clear sections for each workstation.`;

    return this.complete(prompt, { temperature: 0.5, maxTokens: 2000 });
  }

  /**
   * Answer FAQ question with context
   */
  async answerFAQ(
    question: string,
    context: { profiles: any[]; materials: any[] }
  ): Promise<string> {
    const prompt = `
You are a manufacturing documentation assistant.

User question: "${question}"

Available context:
Profiles: ${JSON.stringify(context.profiles.map(p => ({ code: p.code, name: p.name })))}
Materials: ${JSON.stringify(context.materials.map(m => ({ code: m.code, name: m.name })))}

Provide a helpful answer with:
1. Direct answer to the question
2. Relevant profile references
3. Material specifications if applicable
4. Practical examples

Format as markdown.`;

    return this.complete(prompt, { temperature: 0.6, maxTokens: 1000 });
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
export const qwenClient = new QwenClient();
