import { 
  AIProvider, 
  AIResponse, 
  AIContext, 
  AIServiceConfig, 
  AIProviderType
} from '../../types/ai';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { ContextManager } from './context';
import { AIResponseCache } from './cache';
import { PromptManager } from './prompts';

export class AIService {
  private providers: Map<string, AIProvider>;
  private activeProvider: AIProvider | null = null;
  private contextManager: ContextManager;
  private cache: AIResponseCache;
  private promptManager: PromptManager;
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.providers = new Map();
    
    // Initialize providers
    this.initializeProviders();
    
    // Initialize context manager
    this.contextManager = new ContextManager({
      maxMessages: config.contextLimit || 10,
      maxTokens: 8000, // Increased for larger context window
    });
    
    // Initialize cache
    this.cache = new AIResponseCache(config.cache);
    
    // Initialize prompt manager
    this.promptManager = new PromptManager();
    
    // Set active provider
    this.setActiveProvider(config.defaultProvider);
  }

  private initializeProviders(): void {
    // Initialize OpenAI provider if configured
    if (this.config.providers.openai) {
      try {
        const openai = new OpenAIProvider(this.config.providers.openai);
        if (openai.isAvailable()) {
          this.providers.set('openai', openai);
        }
      } catch (error) {
        console.error('Failed to initialize OpenAI provider:', error);
      }
    }
    
    // Initialize Anthropic provider if configured
    if (this.config.providers.anthropic) {
      try {
        const anthropic = new AnthropicProvider(this.config.providers.anthropic);
        if (anthropic.isAvailable()) {
          this.providers.set('anthropic', anthropic);
        }
      } catch (error) {
        console.error('Failed to initialize Anthropic provider:', error);
      }
    }
  }

  async generateResponse(
    message: string,
    channelId: string,
    userId: string,
    options: {
      isDirectMessage?: boolean;
      threadTs?: string;
      templateId?: string;
      templateVars?: Record<string, string>;
    } = {}
  ): Promise<AIResponse> {
    if (!this.activeProvider) {
      throw new Error('No AI provider available');
    }

    // Get or create context
    const context = this.contextManager.getContext(
      channelId, 
      userId, 
      options.isDirectMessage || false
    );
    
    // Get channel-wide context from the last hour
    const channelMessages = this.contextManager.getChannelContext(channelId);
    
    // Add recent channel messages to context if they exist
    if (channelMessages.length > 0) {
      // Add channel context to the AI context
      context.metadata = {
        ...context.metadata,
        channelContext: channelMessages
      };
    }
    
    // Update thread context if provided
    if (options.threadTs) {
      context.threadTs = options.threadTs;
    }
    
    // Set system prompt if configured
    if (this.config.systemPrompt) {
      context.metadata = {
        ...context.metadata,
        systemPrompt: this.config.systemPrompt
      };
    }

    // Prepare the prompt
    let prompt = message;
    if (options.templateId && options.templateVars) {
      prompt = this.promptManager.renderTemplate(options.templateId, {
        ...options.templateVars,
        message
      });
    }

    // Check cache first
    const cachedResponse = this.cache.get(prompt, context);
    if (cachedResponse) {
      console.log('Returning cached response');
      return cachedResponse;
    }

    try {
      // Generate response
      const response = await this.activeProvider.generateResponse(prompt, context);
      
      // Cache the response
      this.cache.set(prompt, context, response);
      
      // Add messages to context
      this.contextManager.addMessage(channelId, userId, {
        role: 'user',
        content: message,
        timestamp: Date.now(),
        userId
      }, options.isDirectMessage || false);
      
      this.contextManager.addMessage(channelId, userId, {
        role: 'assistant',
        content: response.content,
        timestamp: response.timestamp
      }, options.isDirectMessage || false);
      
      return response;
    } catch (error: any) {
      console.error('AI generation error:', error);
      
      // Try fallback provider if available
      const fallbackProvider = this.getFallbackProvider();
      if (fallbackProvider) {
        console.log(`Falling back to ${fallbackProvider.name} provider`);
        this.activeProvider = fallbackProvider;
        return this.generateResponse(message, channelId, userId, options);
      }
      
      throw error;
    }
  }

  setActiveProvider(providerType: AIProviderType): void {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not available`);
    }
    this.activeProvider = provider;
    console.log(`Active AI provider set to: ${providerType}`);
  }

  getActiveProvider(): string | null {
    return this.activeProvider?.name || null;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private getFallbackProvider(): AIProvider | null {
    for (const [, provider] of this.providers) {
      if (provider !== this.activeProvider && provider.isAvailable()) {
        return provider;
      }
    }
    return null;
  }

  // Context management methods
  clearContext(channelId: string, userId: string): void {
    this.contextManager.clearContext(channelId, userId);
  }

  getContext(channelId: string, userId: string, isDirectMessage: boolean): AIContext {
    return this.contextManager.getContext(channelId, userId, isDirectMessage);
  }

  // Cache management methods
  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  // Prompt management methods
  getPromptManager(): PromptManager {
    return this.promptManager;
  }

  // Cleanup method (call periodically)
  cleanup(): void {
    this.contextManager.cleanupOldContexts();
    this.cache.prune();
  }

  // Health check
  healthCheck(): {
    available: boolean;
    providers: Record<string, boolean>;
    activeProvider: string | null;
    activeModel: string | null;
    cacheStats: any;
  } {
    const providerStatus: Record<string, boolean> = {};
    
    this.providers.forEach((provider, name) => {
      providerStatus[name] = provider.isAvailable();
    });
    
    return {
      available: this.activeProvider !== null,
      providers: providerStatus,
      activeProvider: this.activeProvider?.name || null,
      activeModel: this.activeProvider?.getModel() || null,
      cacheStats: this.cache.getStats()
    };
  }
}