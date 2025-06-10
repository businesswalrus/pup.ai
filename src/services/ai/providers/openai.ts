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
    
    // Support custom base URL for OpenAI-compatible APIs
    if (this.config.baseURL) {
      clientConfig.baseURL = this.config.baseURL;
    }
    
    this.client = new OpenAI(clientConfig);
    this.webSearch = new WebSearchService();
  }


  private shouldUseWebSearch(prompt: string): boolean {
    const lowerPrompt = prompt.toLowerCase();
    
    // ALWAYS search for these patterns - no exceptions
    const mustSearchPatterns = [
      // NBA Finals - ALWAYS search for these
      /\bnba\s+finals/i,
      /\bfinals.*\b(nba|basketball)/i,
      
      // "When" + sports queries
      /\bwhen('?s|\s+is|\s+are).*\b(nba|nfl|mlb|nhl|game|match|finals|playoff)/i,
      /\b(next|upcoming).*\b(nba|nfl|mlb|nhl|game|match|finals|playoff)/i,
      
      // Any sports query with time reference
      /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf).*\b(tonight|today|yesterday|tomorrow|last night|next)/i,
      /\b(tonight|today|yesterday|tomorrow|last night|next).*\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf)/i,
      
      // "Who won" or "who beat" queries
      /\bwho\s+(won|beat|defeated|lost|playing|plays)/i,
      /\b(score|result|outcome)[\s\w]*(of|from|in|for)/i,
      
      // Finals, playoffs, championships with any time context
      /\b(finals|playoff|championship|tournament|match|game).*\b(tonight|today|yesterday|tomorrow|last night|this week|next)/i,
      
      // Weather queries
      /\b(weather|temperature|forecast|rain|snow)/i,
      
      // Stock/crypto/market queries
      /\b(stock|crypto|bitcoin|market|nasdaq|dow)[\s\w]*(price|today|now)/i,
      
      // Current events
      /\b(latest|current|recent|breaking|today'?s)[\s\w]*(news|events?)/i,
      /\bwhat('?s)?[\s\w]*(happening|going on)[\s\w]*(today|now|tonight)/i,
      
      // Any query about specific recent dates
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
      /\b202[3-5]\b/,
      
      // Score or result queries
      /\b(final score|game result|match result)/i,
      
      // "Are there" + sports + time
      /\b(is there|are there|any).*\b(game|match|finals|playoff).*\b(tonight|today)/i,
    ];
    
    // If any pattern matches, MUST use web search
    if (mustSearchPatterns.some(pattern => pattern.test(prompt))) {
      console.log('🎯 Web search REQUIRED for query:', prompt);
      return true;
    }
    
    // Additional contextual checks
    const hasTimeWord = /\b(today|tonight|yesterday|tomorrow|now|current|latest|recent|last night|this morning|this evening)\b/i.test(lowerPrompt);
    const hasSportsWord = /\b(game|match|score|beat|defeat|win|loss|playing|played|finals|playoff|championship)\b/i.test(lowerPrompt);
    const hasQuestionWord = /^(who|what|when|where|how|did|is there|are there|was there)/i.test(lowerPrompt);
    
    // If it's a question about time-sensitive sports, search
    if (hasQuestionWord && hasTimeWord && hasSportsWord) {
      console.log('🎯 Web search REQUIRED (contextual match) for query:', prompt);
      return true;
    }
    
    return false;
  }

  async generateResponse(prompt: string, context: AIContext): Promise<AIResponse> {
    const needsWebSearch = this.shouldUseWebSearch(prompt);
    let completionParams: any;
    
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
      
      // Use max_completion_tokens for o1 models, max_tokens for others
      const isO1Model = this.config.model?.startsWith('o1') || this.config.model?.includes('o4');
      
      // o1 models don't support function calling
      const supportsTools = !isO1Model;
      
      
      // Build completion parameters
      completionParams = {
        model: this.config.model!,  // Config always has model from app.ts defaults
        messages: messages as any,
        user: context.userId,
      };
      
      // Only add tools if needed and supported
      if (needsWebSearch && supportsTools) {
        // For OpenAI, we can use tools normally
        completionParams.tools = tools;
        completionParams.tool_choice = { type: 'function' as const, function: { name: 'web_search' } };
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
      
      console.log('🚀 Calling API with params:', {
        model: completionParams.model,
        messageCount: completionParams.messages.length,
        hasTools: !!(completionParams.tools),
        toolChoice: completionParams.tool_choice,
        temperature: completionParams.temperature
      });
      
      const completion = await this.client.chat.completions.create(completionParams);

      // Check if we got an error response instead of a completion
      if (completion && (completion as any).object === 'error') {
        console.error('🚨 API returned error object:', completion);
        const errorMsg = (completion as any).message || 'Unknown API error';
        throw new Error(`API error: ${errorMsg}`);
      }
      
      // Defensive checks for response structure
      if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error('🚨 Invalid API response structure:', completion);
        throw new Error('Invalid response from API - no choices returned');
      }

      const message = completion.choices[0]?.message;
      
      // Get response content
      let responseContent = message?.content || '';
      
      
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
        
        // Defensive checks for follow-up response structure
        if (!followUpCompletion || !followUpCompletion.choices || followUpCompletion.choices.length === 0) {
          console.error('🚨 Invalid follow-up response structure:', followUpCompletion);
          throw new Error('Invalid follow-up response from API');
        }
        
        let finalResponse = followUpCompletion.choices[0]?.message?.content || 'I found the information but had trouble formatting my response. Please try asking again.';
        
        const usage = followUpCompletion.usage;
        
        return {
          content: finalResponse,
          model: followUpCompletion.model || this.config.model || 'unknown',
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
        model: completion.model || this.config.model || 'unknown',
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
        model: this.config.model,
        hadTools: !!(completionParams.tools),
        needsWebSearch
      });
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 401) {
        throw new Error('Invalid API key for OpenAI');
      } else if (error.status === 503) {
        throw new Error('OpenAI service is temporarily unavailable');
      }
      
      
      throw new Error(`API error: ${error.message || 'Unknown error'}`);
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
            console.log('🔍 Executing web search for:', args.query);
            try {
              const generalSearchResults = await this.webSearch.search(args.query);
              result = {
                success: true,
                results: generalSearchResults.map(r => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet
                }))
              };
              console.log('✅ Web search successful, found', generalSearchResults.length, 'results');
              // Log first few results for debugging
              generalSearchResults.slice(0, 3).forEach((r, i) => {
                console.log(`  Result ${i + 1}: ${r.title}`);
                console.log(`    ${r.snippet.substring(0, 150)}...`);
              });
            } catch (searchError: any) {
              console.error('❌ Web search failed:', searchError);
              result = {
                success: false,
                error: `Web search failed: ${searchError.message || 'Unknown error'}`,
                fallbackMessage: 'I need current information to answer this question accurately. Please check recent sources.'
              };
            }
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
    
    // For custom endpoints, don't validate key format
    if (this.config.baseURL) {
      return true;
    }
    
    // Validate OpenAI API key format (should start with 'sk-')
    return this.config.apiKey.startsWith('sk-');
  }
}