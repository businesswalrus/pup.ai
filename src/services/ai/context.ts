import { AIContext, ContextMessage } from '../../types/ai';

export interface ContextManagerConfig {
  maxMessages: number;
  maxTokens?: number;
  contextWindow?: number;
}

export class ContextManager {
  private contexts: Map<string, AIContext>;
  private config: ContextManagerConfig;

  constructor(config: ContextManagerConfig) {
    this.contexts = new Map();
    this.config = config;
  }

  getContext(channelId: string, userId: string, isDirectMessage: boolean): AIContext {
    const contextKey = this.getContextKey(channelId, userId);
    
    if (!this.contexts.has(contextKey)) {
      this.contexts.set(contextKey, {
        messages: [],
        channel: channelId,
        userId,
        isDirectMessage,
        metadata: {}
      });
    }

    return this.contexts.get(contextKey)!;
  }

  getChannelContext(channelId: string): ContextMessage[] {
    // Get all messages from a channel within the last hour
    const allMessages: ContextMessage[] = [];
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    this.contexts.forEach((context, key) => {
      if (key.startsWith(`${channelId}:`)) {
        const recentMessages = context.messages.filter(msg => msg.timestamp >= oneHourAgo);
        allMessages.push(...recentMessages);
      }
    });
    
    // Sort by timestamp
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  addMessage(
    channelId: string, 
    userId: string, 
    message: ContextMessage,
    isDirectMessage: boolean
  ): void {
    const context = this.getContext(channelId, userId, isDirectMessage);
    context.messages.push(message);
    
    // Trim messages to stay within limits
    this.trimContext(context);
  }

  updateThreadContext(channelId: string, threadTs: string, userId: string): void {
    const contextKey = this.getContextKey(channelId, userId);
    const context = this.contexts.get(contextKey);
    
    if (context) {
      context.threadTs = threadTs;
    }
  }

  clearContext(channelId: string, userId: string): void {
    const contextKey = this.getContextKey(channelId, userId);
    this.contexts.delete(contextKey);
  }

  setMetadata(channelId: string, userId: string, metadata: Record<string, any>): void {
    const context = this.getContext(channelId, userId, false);
    context.metadata = { ...context.metadata, ...metadata };
  }

  private trimContext(context: AIContext): void {
    // Keep only the most recent messages
    if (context.messages.length > this.config.maxMessages) {
      const messagesToKeep = this.config.maxMessages;
      context.messages = context.messages.slice(-messagesToKeep);
    }

    // If token counting is implemented, also trim by tokens
    if (this.config.maxTokens) {
      this.trimByTokenCount(context);
    }
  }

  private trimByTokenCount(context: AIContext): void {
    // Simple token estimation (can be improved with proper tokenizer)
    let totalTokens = 0;
    let messagesToKeep: ContextMessage[] = [];

    // Iterate from newest to oldest
    for (let i = context.messages.length - 1; i >= 0; i--) {
      const message = context.messages[i];
      const estimatedTokens = Math.ceil(message.content.length / 4);
      
      if (totalTokens + estimatedTokens <= this.config.maxTokens!) {
        messagesToKeep.unshift(message);
        totalTokens += estimatedTokens;
      } else {
        break;
      }
    }

    context.messages = messagesToKeep;
  }

  private getContextKey(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
  }

  // Get all active contexts (useful for debugging/monitoring)
  getActiveContexts(): Map<string, AIContext> {
    return new Map(this.contexts);
  }

  // Clean up old contexts (can be called periodically)
  cleanupOldContexts(maxAge: number = 3600000): void { // Default: 1 hour
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.contexts.forEach((context, key) => {
      const lastMessage = context.messages[context.messages.length - 1];
      if (lastMessage && now - lastMessage.timestamp > maxAge) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.contexts.delete(key));
  }
}