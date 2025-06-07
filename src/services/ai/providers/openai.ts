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

      // Check if the prompt needs web search for factual information
      const factualPatterns = [
        // Sports patterns - very broad to catch all sports queries
        /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf|finals|championship|playoffs|tournament)\b/i,
        /\b(score|game|match|win|won|lost|beat|defeat|result|outcome|playing|play|played)\b/i,
        /\b(player|team|athlete|stats|points|rebounds|assists|goals|yards|touchdown)\b/i,
        // Time-sensitive patterns - catch all temporal references
        /\b(today|tonight|yesterday|tomorrow|this week|last week|recently|latest|current|now|just|update|last night)\b/i,
        /\b(happened|happening|occurred|took place|going on|scheduled)\b/i,
        // Factual query patterns
        /^(what|who|when|where|how|did|is|was|are|were|which|whose)\b/i,
        /\b(fact|verify|check|confirm|true|false|actually|really)\b/i,
        // News and events
        /\b(news|announcement|released|announced|reported|breaking|headline)\b/i,
        // Specific fact requests
        /\b(price|cost|worth|value|stock|market|weather|temperature|forecast)\b/i,
        /vs\.?|versus|against/i,
        // Additional patterns for common queries
        /\b(live|streaming|watch|channel)\b/i,
        /\b(record|history|all-time|best|worst|first|last)\b/i,
        // Catch queries about specific years
        /\b(20\d{2}|19\d{2})\b/
      ];
      
      const needsWebSearch = factualPatterns.some(pattern => pattern.test(prompt));
      
      // Use max_completion_tokens for o1 models, max_tokens for others
      const isO1Model = this.config.model?.startsWith('o1') || this.config.model?.includes('o4');
      
      // Check for specific Deepseek versions - R1-0528 supports function calling!
      const isDeepseekR1Original = this.config.model?.toLowerCase() === 'deepseek-r1';
      
      // o1 models and original Deepseek R1 don't support function calling
      // BUT Deepseek-R1-0528 DOES support it!
      const supportsTools = !isO1Model && !isDeepseekR1Original;
      
      // Debug logging
      console.log('🔍 Web Search Debug:', {
        model: this.config.model,
        prompt: prompt.substring(0, 100) + '...',
        needsWebSearch,
        isO1Model,
        isDeepseekR1Original,
        supportsTools,
        willUseTools: needsWebSearch && supportsTools
      });
      
      // Build completion parameters
      const completionParams: any = {
        model: this.config.model!,  // Config always has model from app.ts defaults
        messages: messages as any,
        user: context.userId,
      };
      
      // Only add tools if needed and supported
      if (needsWebSearch && supportsTools) {
        completionParams.tools = tools;
        // For Lambda Labs, don't use tool_choice parameter as it might not be supported
        if (!this.config.baseURL?.includes('lambda.ai')) {
          completionParams.tool_choice = 'required';  // Force tool use when needed
        } else {
          // For Lambda Labs, add explicit instruction to use tools
          const lastMessage = messages[messages.length - 1];
          if (lastMessage.role === 'user') {
            lastMessage.content = `IMPORTANT: This query requires web search. You MUST use the web_search function to find current information before responding. Query: ${lastMessage.content}`;
          }
        }
      }
      
      // o1 models only support temperature=1
      if (!isO1Model) {
        completionParams.temperature = this.config.temperature ?? 0.7;
      }
      
      if (isO1Model) {
        completionParams.max_completion_tokens = this.config.maxTokens || 1000;
      } else {
        completionParams.max_tokens = this.config.maxTokens || 1000;
      }
      
      const completion = await this.client.chat.completions.create(completionParams);

      const message = completion.choices[0]?.message;
      
      // Debug logging for response
      console.log('🔍 API Response Debug:', {
        model: completion.model,
        hasToolCalls: !!(message?.tool_calls && message.tool_calls.length > 0),
        toolCallsCount: message?.tool_calls?.length || 0,
        messageContent: message?.content?.substring(0, 100) + '...'
      });
      
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
        
        const finalResponse = followUpCompletion.choices[0]?.message?.content || 'I found the information but had trouble formatting my response. Please try asking again.';
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

      // No tool calls - check if we should have used web search
      if (needsWebSearch && supportsTools && this.config.baseURL?.includes('lambda.ai')) {
        console.log('🔍 Lambda Labs fallback: Performing manual web search...');
        
        // Extract a search query from the prompt
        let searchQuery = prompt;
        
        // Try to extract a more specific query
        const queryMatch = prompt.match(/(?:about|what|when|where|who|is there|was there)\s+(.+?)(?:\?|$)/i);
        if (queryMatch) {
          searchQuery = queryMatch[1];
        }
        
        try {
          // Perform web search manually
          const searchResults = await this.webSearch.search(searchQuery);
          
          // Format search results
          const searchContext = `\n\nWeb search results for "${searchQuery}":\n${searchResults.slice(0, 3).map((r, i) => 
            `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
          ).join('\n\n')}`;
          
          // Add search results to messages and retry
          messages.push({
            role: 'system',
            content: `Here are current web search results to help answer the user's question:${searchContext}`
          });
          
          // Retry the completion with search results in context
          const retryParams: any = {
            model: this.config.model!,
            messages: messages as any,
            user: context.userId,
          };
          
          if (!isO1Model) {
            retryParams.temperature = this.config.temperature ?? 0.7;
          }
          
          if (isO1Model) {
            retryParams.max_completion_tokens = this.config.maxTokens || 1000;
          } else {
            retryParams.max_tokens = this.config.maxTokens || 1000;
          }
          
          const retryCompletion = await this.client.chat.completions.create(retryParams);
          const retryResponse = retryCompletion.choices[0]?.message?.content || 'I found the information but had trouble formatting my response. Please try asking again.';
          
          return {
            content: retryResponse,
            model: retryCompletion.model,
            provider: this.name,
            usage: retryCompletion.usage ? {
              promptTokens: retryCompletion.usage.prompt_tokens,
              completionTokens: retryCompletion.usage.completion_tokens,
              totalTokens: retryCompletion.usage.total_tokens,
            } : undefined,
            timestamp: Date.now(),
          };
        } catch (searchError) {
          console.error('🔍 Fallback web search failed:', searchError);
          // Continue with original response
        }
      }
      
      // No tool calls and no fallback needed, return regular response
      const response = message?.content || 'I need a moment to process that request. Please try again.';
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