export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached?: boolean;
  timestamp: number;
}

export interface AIContext {
  messages: ContextMessage[];
  channel: string;
  threadTs?: string;
  userId: string;
  isDirectMessage: boolean;
  metadata?: Record<string, any>;
}

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  userId?: string;
}

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  baseURL?: string;  // For Lambda Labs or other OpenAI-compatible APIs
}

export interface AIProvider {
  name: string;
  generateResponse(prompt: string, context: AIContext): Promise<AIResponse>;
  validateConfig(): boolean;
  isAvailable(): boolean;
  getModel(): string;
}

export interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  skipCache?: (prompt: string, context: AIContext) => boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  description?: string;
}

export type AIProviderType = 'openai' | 'anthropic';

export interface AIServiceConfig {
  providers: {
    openai?: AIProviderConfig;
    anthropic?: AIProviderConfig;
  };
  defaultProvider: AIProviderType;
  cache: CacheOptions;
  contextLimit: number;
  systemPrompt?: string;
}