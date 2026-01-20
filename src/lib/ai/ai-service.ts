// src/lib/ai/ai-service.ts
// AI service for Qwen integration using DASHSCOPE_API_KEY

interface AIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface AIResponse {
  content: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class AIService {
  private config: AIConfig;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.defaultModel = config.model || 'qwen-max';
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
    }
  ): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 2048
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI request failed: ${response.status} ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0].message.content,
      model: data.model,
      created: data.created,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0
      }
    };
  }

  async analyzeOrder(orderData: any): Promise<any> {
    const prompt = `Analyze the following order and provide insights:
    
    Order Details:
    - PO Number: ${orderData.poNumber}
    - Client: ${orderData.clientName}
    - Title: ${orderData.title}
    - Deadline: ${orderData.deadline}
    - Status: ${orderData.status}
    - Profiles: ${orderData.profiles?.length || 0} items
    
    Provide a structured analysis with:
    1. Priority assessment
    2. Potential challenges
    3. Resource requirements
    4. Recommendations`;

    const result = await this.chatCompletion([
      {
        role: 'user',
        content: prompt
      }
    ]);

    try {
      return JSON.parse(result.content);
    } catch {
      // If parsing fails, return the raw content
      return { analysis: result.content };
    }
  }

  async suggestProfileConfiguration(materialRequirements: any): Promise<any> {
    const prompt = `Based on the following material requirements, suggest optimal profile configurations:
    
    Requirements: ${JSON.stringify(materialRequirements, null, 2)}
    
    Provide configuration recommendations in JSON format.`;

    const result = await this.chatCompletion([
      {
        role: 'user',
        content: prompt
      }
    ]);

    try {
      return JSON.parse(result.content);
    } catch {
      return { configuration: result.content };
    }
  }

  async generateManufacturingInstructions(profile: any): Promise<string> {
    const prompt = `Generate detailed manufacturing instructions for the following profile:
    
    Profile: ${JSON.stringify(profile, null, 2)}
    
    Provide step-by-step manufacturing instructions.`;

    const result = await this.chatCompletion([
      {
        role: 'user',
        content: prompt
      }
    ]);

    return result.content;
  }
}

let aiService: AIService | null = null;

export function initializeAIService(): AIService | null {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey || apiKey === 'your_qwen_api_key_here') {
    console.warn('DASHSCOPE_API_KEY not configured. AI features will be disabled.');
    return null;
  }

  aiService = new AIService({
    apiKey,
    baseUrl: process.env.DASHSCOPE_BASE_URL,
    model: process.env.DASHSCOPE_MODEL
  });

  return aiService;
}

export function getAIService(): AIService | null {
  return aiService;
}

export default AIService;