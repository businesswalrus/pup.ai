import { AIProvider, AIResponse, AIContext, AIProviderConfig } from '../../../types/ai';

export abstract class BaseAIProvider implements AIProvider {
  protected config: AIProviderConfig;
  public abstract name: string;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract generateResponse(prompt: string, context: AIContext): Promise<AIResponse>;

  validateConfig(): boolean {
    return !!(this.config.apiKey && this.config.apiKey.length > 0);
  }

  isAvailable(): boolean {
    try {
      return this.validateConfig();
    } catch {
      return false;
    }
  }

  protected buildMessages(prompt: string, context: AIContext): any[] {
    const messages: any[] = [];

    // Add system message if available
    if (context.metadata?.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.metadata.systemPrompt
      });
    }

    // Add channel context if available (messages from last hour)
    if (context.metadata?.channelContext && Array.isArray(context.metadata.channelContext)) {
      // Add a system message explaining the channel context
      messages.push({
        role: 'system',
        content: 'Here are recent messages from the channel in the last hour that you can reference:'
      });
      
      // Add the channel messages
      context.metadata.channelContext.forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: `[${msg.userId || 'User'}]: ${msg.content}`
        });
      });
    }

    // Add context messages
    messages.push(...context.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    // Add current prompt
    messages.push({
      role: 'user',
      content: prompt
    });

    return messages;
  }

  protected calculateTokenUsage(prompt: string, response: string): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    // Simple estimation: ~4 characters per token
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }
}