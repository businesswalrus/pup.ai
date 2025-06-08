import OpenAI from 'openai';
import { BaseAIProvider } from './base';
import { AIResponse, AIContext } from '../../../types/ai';
import { WebSearchService, searchNBAStats } from '../../../utils/webSearch';

export class OpenAIProvider extends BaseAIProvider {
  public name = 'openai';
  private client: OpenAI;
  private webSearch: WebSearchService;

  constructor(config: any) {
    super(config);
    if (!this.validateConfig()) {
      throw new Error(`Invalid configuration for ${this.name} provider`);
    }
    
    const clientConfig: any = {
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000,
    };
    
    // Support custom base URL for Lambda Labs or other OpenAI-compatible APIs
    if (this.config.baseURL) {
      clientConfig.baseURL = this.config.baseURL;
    }
    
    this.client = new OpenAI(clientConfig);
    this.webSearch = new WebSearchService();
  }

  private processDeepseekResponse(content: string): string {
    // Deepseek models often include thinking process in tags
    // Strip out <think>, <thinking>, </think>, </thinking> tags and everything between them
    let processed = content;
    
    // Remove <think>...</think> blocks
    processed = processed.replace(/<think[^>]*>([\s\S]*?)<\/think>/gi, '');
    
    // Remove <thinking>...</thinking> blocks
    processed = processed.replace(/<thinking[^>]*>([\s\S]*?)<\/thinking>/gi, '');
    
    // Also remove standalone tags in case they're not properly paired
    processed = processed.replace(/<\/?think[^>]*>/gi, '');
    processed = processed.replace(/<\/?thinking[^>]*>/gi, '');
    
    // Trim any leading/trailing whitespace
    processed = processed.trim();
    
    // If we stripped everything, return a fallback
    if (!processed) {
      return "I need a moment to process that. Please try again.";
    }
    
    return processed;
  }

  private shouldUseWebSearch(prompt: string): boolean {
    // More intelligent detection - only for queries that truly need current information
    const lowerPrompt = prompt.toLowerCase();
    
    // Strong indicators of needing web search
    const strongIndicators = [
      // Sports with time context
      /\b(game|match|score|playing)\s+(today|tonight|yesterday|last night)/i,
      /\b(who won|who beat|final score|results?)\s+\w+/i,
      /\b(nba|nfl|mlb|nhl|tennis|soccer)\s+\w+\s+(game|match|score)/i,
      
      // Current events with explicit time markers
      /\b(latest|current|recent|breaking)\s+(news|events?|updates?)/i,
      /\bwhat\s+(happened|is happening)\s+(today|yesterday|this week)/i,
      
      // Market/financial data
      /\b(stock price|market|nasdaq|dow jones|bitcoin|crypto)\s+(today|now|current)/i,
      
      // Weather (always needs current data)
      /\b(weather|temperature|forecast)\s+(in|for|today|tomorrow)/i,
      
      // Specific dated events
      /\b(australian open|super bowl|world cup|olympics)\s+202\d/i,
    ];
    
    // Check strong indicators first
    if (strongIndicators.some(pattern => pattern.test(prompt))) {
      return true;
    }
    
    // Weaker indicators - only if they have additional context
    const hasTimeContext = /\b(today|tonight|yesterday|tomorrow|this week|last night|now|current|latest|recent)\b/i.test(lowerPrompt);
    const hasSportsContext = /\b(game|match|score|beat|defeat|win|loss|playing)\b/i.test(lowerPrompt);
    const hasNewsContext = /\b(news|happening|event|announcement)\b/i.test(lowerPrompt);
    
    // Only search if we have time context AND another context
    return hasTimeContext && (hasSportsContext || hasNewsContext);
  }

  async generateResponse(prompt: string, context: AIContext): Promise<AIResponse> {
    try {
      const messages = this.buildMessages(prompt, context);
      
      // Define tools for NBA stats lookup
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'web_search',
            description: 'Search the web for current information, facts, news, or any real-time data. Use this whenever you need factual information.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query (e.g., "Alcaraz vs Musetti Australian Open 2025", "latest Tesla stock price", "weather in NYC today")'
                }
              },
              required: ['query']
            }
          }
        },
        {
          type: 'function' as const,
          function: {
            name: 'search_nba_stats',
            description: 'Search for NBA player or team statistics from reliable sources like Basketball Reference',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query (player name, team name, or specific stat)'
                },
                statType: {
                  type: 'string',
                  description: 'Optional: specific stat type (e.g., "career stats", "2023 season", "playoffs")',
                }
              },
              required: ['query']
            }
          }
        },
        {
          type: 'function' as const,
          function: {
            name: 'fetch_web_page',
            description: 'Fetch content from a specific URL to get accurate NBA statistics',
            parameters: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The URL to fetch content from'
                }
              },
              required: ['url']
            }
          }
        }
      ];

      // More targeted web search detection - only for truly factual/time-sensitive queries
      const needsWebSearch = this.shouldUseWebSearch(prompt);
      
      // Use max_completion_tokens for o1 models, max_tokens for others
      const isO1Model = this.config.model?.startsWith('o1') || this.config.model?.includes('o4');
      
      // Check for specific Deepseek versions - R1-0528 supports function calling!
      const modelLower = this.config.model?.toLowerCase() || '';
      const isDeepseekR1Original = modelLower === 'deepseek-r1' && !modelLower.includes('0528');
      
      // o1 models and original Deepseek R1 don't support function calling
      // BUT Deepseek-R1-0528 DOES support it!
      const supportsTools = !isO1Model && !isDeepseekR1Original;
      
      // Enhanced debug logging for Lambda Labs
      if (this.config.baseURL?.includes('lambda.ai')) {
        console.log('🤖 Lambda Labs Request Debug:', {
          model: this.config.model,
          baseURL: this.config.baseURL,
          needsWebSearch,
          supportsTools,
          temperature: needsWebSearch ? 0.3 : (this.config.temperature ?? 0.7),
          promptPreview: prompt.substring(0, 150) + '...'
        });
      }
      
      // Build completion parameters
      const completionParams: any = {
        model: this.config.model!,  // Config always has model from app.ts defaults
        messages: messages as any,
        user: context.userId,
      };
      
      // Only add tools if needed and supported
      if (needsWebSearch && supportsTools) {
        completionParams.tools = tools;
        // Don't force tool choice - let the model decide when to use it
        // This prevents errors with providers that don't support tool_choice
      }
      
      // o1 models only support temperature=1
      if (!isO1Model) {
        // Use lower temperature for factual queries
        const temp = needsWebSearch ? 0.3 : (this.config.temperature ?? 0.7);
        completionParams.temperature = temp;
      }
      
      if (isO1Model) {
        completionParams.max_completion_tokens = this.config.maxTokens || 1000;
      } else {
        completionParams.max_tokens = this.config.maxTokens || 1000;
      }
      
      const completion = await this.client.chat.completions.create(completionParams);

      const message = completion.choices[0]?.message;
      
      // Process response content if it's from Deepseek
      let responseContent = message?.content || '';
      const isDeepseek = this.config.model?.toLowerCase().includes('deepseek') || 
                         completion.model?.toLowerCase().includes('deepseek');
      
      if (isDeepseek && responseContent) {
        const rawContent = responseContent;
        responseContent = this.processDeepseekResponse(responseContent);
        
        // Log the processing if content was modified
        if (rawContent !== responseContent) {
          console.log('🧹 Deepseek Response Processing:', {
            model: completion.model,
            rawLength: rawContent.length,
            processedLength: responseContent.length,
            removedThinking: rawContent.includes('<think') || rawContent.includes('<thinking'),
            processedPreview: responseContent.substring(0, 200) + '...'
          });
        }
      }
      
      // Enhanced debug logging for Lambda Labs responses
      if (this.config.baseURL?.includes('lambda.ai')) {
        console.log('🤖 Lambda Labs Response Debug:', {
          model: completion.model,
          hasToolCalls: !!(message?.tool_calls && message.tool_calls.length > 0),
          toolCallsCount: message?.tool_calls?.length || 0,
          finishReason: completion.choices[0]?.finish_reason,
          usage: completion.usage,
          rawResponsePreview: message?.content?.substring(0, 200) + '...',
          processedResponsePreview: responseContent.substring(0, 200) + '...'
        });
      }
      
      // Handle tool calls if present
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolResults = await this.handleToolCalls(message.tool_calls);
        
        // Add the assistant's message with tool calls to messages
        messages.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls
        } as any);
        
        // Add tool results to messages
        for (const result of toolResults) {
          messages.push(result as any);
        }
        
        // Make a follow-up call with the tool results
        const followUpParams: any = {
          model: this.config.model!,  // Config always has model from app.ts defaults
          messages: messages as any,
          user: context.userId,
        };
        
        // o1 models only support temperature=1
        if (!isO1Model) {
          followUpParams.temperature = this.config.temperature ?? 0.7;
        }
        
        if (isO1Model) {
          followUpParams.max_completion_tokens = this.config.maxTokens || 1000;
        } else {
          followUpParams.max_tokens = this.config.maxTokens || 1000;
        }
        
        const followUpCompletion = await this.client.chat.completions.create(followUpParams);
        
        let finalResponse = followUpCompletion.choices[0]?.message?.content || 'I found the information but had trouble formatting my response. Please try asking again.';
        
        // Process Deepseek responses to remove thinking tags
        const isDeepseekFollowUp = this.config.model?.toLowerCase().includes('deepseek') || 
                                   followUpCompletion.model?.toLowerCase().includes('deepseek');
        if (isDeepseekFollowUp && finalResponse) {
          finalResponse = this.processDeepseekResponse(finalResponse);
        }
        
        const usage = followUpCompletion.usage;
        
        return {
          content: finalResponse,
          model: followUpCompletion.model,
          provider: this.name,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : undefined,
          timestamp: Date.now(),
        };
      }

      // Remove aggressive fallback - let the model work naturally
      
      // No tool calls and no fallback needed, return regular response
      // Use the processed response content
      const response = responseContent || 'I need a moment to process that request. Please try again.';
      const usage = completion.usage;

      return {
        content: response,
        model: completion.model,
        provider: this.name,
        usage: usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        } : undefined,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      // Log detailed error for debugging
      console.error('🔍 OpenAI API Error Details:', {
        status: error.status,
        message: error.message,
        response: error.response?.data,
        baseURL: this.config.baseURL,
        model: this.config.model
      });
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key for OpenAI');
      } else if (error.status === 503) {
        throw new Error('OpenAI service is temporarily unavailable');
      } else if (error.status === 400 && error.message?.includes('tool_choice')) {
        // Lambda Labs might not support tool_choice
        console.log('🔍 Retrying without tool_choice parameter...');
        throw new Error('Tool choice not supported by this model');
      }
      
      throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
    }
  }

  private async handleToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = [];
    
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      try {
        let result;
        
        switch (functionName) {
          case 'web_search':
            const generalSearchResults = await this.webSearch.search(args.query);
            result = {
              success: true,
              results: generalSearchResults.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet
              }))
            };
            break;
            
          case 'search_nba_stats':
            const searchResults = await searchNBAStats(args.query, args.statType);
            result = {
              success: true,
              results: searchResults.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet
              }))
            };
            break;
            
          case 'fetch_web_page':
            try {
              const content = await this.webSearch.fetchPage(args.url);
              // Extract relevant text content (simplified - in production would use proper HTML parsing)
              const textContent = content.replace(/<[^>]*>/g, ' ').substring(0, 5000);
              result = {
                success: true,
                content: textContent,
                url: args.url
              };
            } catch (error) {
              result = {
                success: false,
                error: 'Failed to fetch page content'
              };
            }
            break;
            
          default:
            result = {
              success: false,
              error: `Unknown function: ${functionName}`
            };
        }
        
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        results.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            success: false,
            error: `Error executing ${functionName}: ${error}`
          })
        });
      }
    }
    
    return results;
  }

  validateConfig(): boolean {
    if (!super.validateConfig()) {
      return false;
    }
    
    // For Lambda Labs or custom endpoints, don't validate key format
    if (this.config.baseURL) {
      return true;
    }
    
    // Validate OpenAI API key format (should start with 'sk-')
    return this.config.apiKey.startsWith('sk-');
  }
}