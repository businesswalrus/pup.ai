import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { AIResponse, AIContext, CacheOptions } from '../../types/ai';

export class AIResponseCache {
  private cache: LRUCache<string, AIResponse>;
  private options: CacheOptions;

  constructor(options: CacheOptions) {
    this.options = options;
    this.cache = new LRUCache<string, AIResponse>({
      max: options.maxSize,
      ttl: options.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }

  get(prompt: string, context: AIContext): AIResponse | undefined {
    if (this.shouldSkipCache(prompt, context)) {
      return undefined;
    }

    const key = this.generateCacheKey(prompt, context);
    const cached = this.cache.get(key);

    if (cached) {
      return {
        ...cached,
        cached: true,
      };
    }

    return undefined;
  }

  set(prompt: string, context: AIContext, response: AIResponse): void {
    if (this.shouldSkipCache(prompt, context)) {
      return;
    }

    const key = this.generateCacheKey(prompt, context);
    this.cache.set(key, response);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): {
    size: number;
    maxSize: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }

  private generateCacheKey(prompt: string, context: AIContext): string {
    // Create a hash of the prompt and relevant context
    const contextData = {
      prompt,
      channel: context.channel,
      isDirectMessage: context.isDirectMessage,
      // Include recent message context in the key
      recentMessages: context.messages.slice(-3).map(m => ({
        role: m.role,
        content: m.content.substring(0, 100), // First 100 chars for context
      })),
      metadata: context.metadata,
    };

    const hash = createHash('sha256');
    hash.update(JSON.stringify(contextData));
    return hash.digest('hex');
  }

  private shouldSkipCache(prompt: string, context: AIContext): boolean {
    // Check if custom skip function is provided
    if (this.options.skipCache) {
      return this.options.skipCache(prompt, context);
    }

    // Default skip conditions
    const skipPatterns = [
      /what time/i,
      /current date/i,
      /today/i,
      /now/i,
      /latest/i,
      /recent/i,
      /weather/i,
      /random/i,
    ];

    return skipPatterns.some(pattern => pattern.test(prompt));
  }

  // Prune expired entries (LRUCache handles this automatically, but this can be called manually)
  prune(): void {
    this.cache.purgeStale();
  }
}