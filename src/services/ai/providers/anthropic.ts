import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider } from './base';
import { AIResponse, AIContext } from '../../../types/ai';

export class AnthropicProvider extends BaseAIProvider {
  public name = 'anthropic';
  private client: Anthropic;

  constructor(config: any) {
    super(config);
    if (!this.validateConfig()) {
      throw new Error(`Invalid configuration for ${this.name} provider`);
    }
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000,
    });
  }

  async generateResponse(prompt: string, context: AIContext): Promise<AIResponse> {
    try {
      const messages = this.buildAnthropicMessages(prompt, context);
      const systemPrompt = context.metadata?.systemPrompt || 'You are a helpful AI assistant.';
      
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-3-opus-20240229',
        max_tokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature ?? 0.7,
        system: systemPrompt,
        messages: messages,
      });

      const content = response.content[0]?.type === 'text' 
        ? response.content[0].text 
        : '';

      return {
        content,
        model: response.model,
        provider: this.name,
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        } : undefined,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key for Anthropic');
      } else if (error.status === 503) {
        throw new Error('Anthropic service is temporarily unavailable');
      }
      
      throw new Error(`Anthropic API error: ${error.message || 'Unknown error'}`);
    }
  }

  private buildAnthropicMessages(prompt: string, context: AIContext): any[] {
    const messages: any[] = [];

    // Add context messages (excluding system messages)
    const contextMessages = context.messages.filter(msg => msg.role !== 'system');
    messages.push(...contextMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    })));

    // Add current prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    return messages;
  }

  validateConfig(): boolean {
    if (!super.validateConfig()) {
      return false;
    }
    
    // Anthropic API keys typically have a specific format
    return this.config.apiKey.length > 20;
  }
}