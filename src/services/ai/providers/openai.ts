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
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000,
    });
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
        // Sports patterns
        /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf)\b/i,
        /\b(score|game|match|win|won|lost|beat|defeat|result|outcome)\b/i,
        /\b(player|team|athlete|stats|points|rebounds|assists|goals|yards)\b/i,
        // Time-sensitive patterns
        /\b(today|yesterday|this week|last week|recently|latest|current|now|just|update)\b/i,
        /\b(happened|happening|occurred|took place)\b/i,
        // Factual query patterns
        /^(what|who|when|where|how|did|is|was|are|were)\b.*\?/i,
        /\b(fact|verify|check|confirm|true|false|actually|really)\b/i,
        // News and events
        /\b(news|announcement|released|announced|reported|breaking)\b/i,
        // Specific fact requests
        /\b(price|cost|worth|value|stock|market|weather|temperature)\b/i,
        /vs\.|versus|against/i
      ];
      
      const needsWebSearch = factualPatterns.some(pattern => pattern.test(prompt));
      
      // Use max_completion_tokens for o1 models, max_tokens for others
      const isO1Model = this.config.model?.startsWith('o1') || this.config.model?.includes('o4');
      const completionParams: any = {
        model: this.config.model!,  // Config always has model from app.ts defaults
        messages: messages as any,
        user: context.userId,
        tools: needsWebSearch ? tools : undefined,
        tool_choice: needsWebSearch ? 'required' : undefined,
      };
      
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
        
        const finalResponse = followUpCompletion.choices[0]?.message?.content || '';
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

      // No tool calls, return regular response
      const response = message?.content || '';
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
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key for OpenAI');
      } else if (error.status === 503) {
        throw new Error('OpenAI service is temporarily unavailable');
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
    
    // Validate API key format (should start with 'sk-')
    return this.config.apiKey.startsWith('sk-');
  }
}