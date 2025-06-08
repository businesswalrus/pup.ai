import { AIContext, ContextMessage } from '../../types/ai';

export interface ContextManagerConfig {
  maxMessages: number;
  maxTokens?: number;
  contextWindow?: number;
}

export class ContextManager {
  private contexts: Map<string, AIContext>;
  private config: ContextManagerConfig;
  private channelContexts: Map<string, ContextMessage[]>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ContextManagerConfig) {
    this.contexts = new Map();
    this.channelContexts = new Map();
    this.config = config;
    
    // Clean up old messages every hour to prevent memory leak
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldContexts();
      console.log(`[ContextManager] Cleaned up old contexts at ${new Date().toISOString()}`);
    }, 3600000); // 1 hour
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
    // Get messages from channel-specific storage
    const messages = this.channelContexts.get(channelId) || [];
    
    // Return only recent messages (last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return messages.filter(msg => msg.timestamp >= oneHourAgo);
  }

  addMessage(
    channelId: string, 
    userId: string, 
    message: ContextMessage,
    isDirectMessage: boolean
  ): void {
    // Add to user-specific context
    const context = this.getContext(channelId, userId, isDirectMessage);
    context.messages.push(message);
    
    // Also add to channel-wide context for better conversation tracking
    if (!this.channelContexts.has(channelId)) {
      this.channelContexts.set(channelId, []);
    }
    const channelMessages = this.channelContexts.get(channelId)!;
    channelMessages.push(message);
    
    // Trim both contexts to stay within limits
    this.trimContext(context);
    
    // Trim channel context too
    if (channelMessages.length > 50) {
      this.channelContexts.set(channelId, channelMessages.slice(-50));
    }
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
  cleanupOldContexts(maxAge: number = 12 * 60 * 60 * 1000): void { // Default: 12 hours
    const now = Date.now();
    let cleaned = 0;
    
    // Clean user-specific contexts
    const keysToDelete: string[] = [];
    this.contexts.forEach((context, key) => {
      const lastMessage = context.messages[context.messages.length - 1];
      if (!lastMessage || now - lastMessage.timestamp > maxAge) {
        keysToDelete.push(key);
      } else {
        // Also limit messages within active contexts
        const before = context.messages.length;
        context.messages = context.messages.filter(msg => 
          now - msg.timestamp < maxAge
        ).slice(-30); // Keep only last 30 messages
        cleaned += before - context.messages.length;
      }
    });
    
    keysToDelete.forEach(key => {
      this.contexts.delete(key);
      cleaned++;
    });
    
    // Clean channel contexts
    for (const [channelId, messages] of this.channelContexts.entries()) {
      // Keep only recent messages
      const filtered = messages.filter(msg => 
        now - msg.timestamp < maxAge
      );
      
      // Also limit to last 30 messages per channel
      const limited = filtered.slice(-30);
      
      if (limited.length < messages.length) {
        cleaned += messages.length - limited.length;
        this.channelContexts.set(channelId, limited);
      }
      
      // Remove empty channels
      if (limited.length === 0) {
        this.channelContexts.delete(channelId);
      }
    }
    
    if (cleaned > 0) {
      console.log(`[ContextManager] Cleaned ${cleaned} old messages`);
    }
  }
  
  // Get all channel IDs being tracked (useful for monitoring)
  getAllChannelIds(): string[] {
    const channelIds = new Set<string>();
    
    // Get from channel contexts
    this.channelContexts.forEach((_, channelId) => {
      channelIds.add(channelId);
    });
    
    // Also get from user contexts
    this.contexts.forEach((_, key) => {
      const [channelId] = key.split(':');
      channelIds.add(channelId);
    });
    
    return Array.from(channelIds);
  }
  
  /**
   * Get formatted context with timestamps and user names
   */
  getFormattedContext(channelId: string, maxMessages: number = 10): string {
    const messages = this.channelContexts.get(channelId) || [];
    const recent = messages.slice(-maxMessages);
    
    if (recent.length === 0) {
      return '';
    }
    
    // Format with timestamps for better context
    const formatted = recent.map(msg => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const user = msg.userId || 'unknown';
      const role = msg.role === 'assistant' ? 'Pup' : user;
      return `[${time}] ${role}: ${msg.content}`;
    }).join('\n');
    
    return `Recent conversation:\n${formatted}\n\n`;
  }
  
  /**
   * Detect conversation topics from recent messages
   */
  getConversationTopics(channelId: string): string[] {
    const messages = this.channelContexts.get(channelId) || [];
    const topics = new Set<string>();
    
    // Extract potential topics from recent messages
    messages.slice(-20).forEach(msg => {
      // Look for capitalized words (potential proper nouns)
      const properNouns = msg.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      properNouns.forEach(noun => {
        // Filter out common words that are often capitalized
        if (!['The', 'This', 'That', 'What', 'When', 'Where', 'Why', 'How'].includes(noun)) {
          topics.add(noun);
        }
      });
      
      // Look for quoted terms
      const quoted = msg.content.match(/"([^"]+)"|'([^']+)'/g) || [];
      quoted.forEach(q => topics.add(q.replace(/['"]/g, '')));
      
      // Look for tech terms, products, companies
      const techTerms = msg.content.match(/\b(API|SDK|AI|ML|AWS|GCP|Azure|React|Vue|Angular|Node|Python|Java|JavaScript|TypeScript|Docker|Kubernetes|GitHub|Slack)\b/gi) || [];
      techTerms.forEach(term => topics.add(term.toUpperCase()));
      
      // Look for sports teams and leagues
      const sportsTerms = msg.content.match(/\b(NBA|NFL|MLB|NHL|Lakers|Warriors|Celtics|Heat|Yankees|Dodgers|Patriots|Chiefs)\b/gi) || [];
      sportsTerms.forEach(term => topics.add(term));
    });
    
    return Array.from(topics);
  }
  
  /**
   * Get conversation summary for context
   */
  getConversationSummary(channelId: string): string {
    const messages = this.channelContexts.get(channelId) || [];
    if (messages.length === 0) return '';
    
    const topics = this.getConversationTopics(channelId);
    const messageCount = messages.length;
    const timeSpan = messages.length > 0 
      ? Math.round((Date.now() - messages[0].timestamp) / 1000 / 60) 
      : 0;
    
    let summary = `Conversation context: ${messageCount} messages over ${timeSpan} minutes`;
    if (topics.length > 0) {
      summary += `. Topics discussed: ${topics.slice(0, 5).join(', ')}`;
    }
    
    return summary;
  }
  
  // Add destructor to clean up interval
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}