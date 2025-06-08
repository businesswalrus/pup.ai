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
    const lowerPrompt = prompt.toLowerCase();
    
    // ALWAYS search for these patterns - no exceptions
    const mustSearchPatterns = [
      // Any sports query with time reference
      /\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf).*\b(tonight|today|yesterday|tomorrow|last night)/i,
      /\b(tonight|today|yesterday|tomorrow|last night).*\b(nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|golf)/i,
      
      // "Who won" or "who beat" queries
      /\bwho\s+(won|beat|defeated|lost)/i,
      /\b(score|result|outcome)[\s\w]*(of|from|in|for)/i,
      
      // Finals, playoffs, championships with any time context
      /\b(finals|playoff|championship|tournament|match|game).*\b(tonight|today|yesterday|tomorrow|last night|this week)/i,
      
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
      completionParams = {
        model: this.config.model!,  // Config always has model from app.ts defaults
        messages: messages as any,
        user: context.userId,
      };
      
      // Only add tools if needed and supported
      if (needsWebSearch && supportsTools) {
        completionParams.tools = tools;
        
        // For Lambda Labs/Deepseek, we need to be more explicit about tool usage
        if (this.config.baseURL?.includes('lambda.ai')) {
          // Add a system message to strongly encourage tool use
          const systemMessage = {
            role: 'system' as const,
            content: 'IMPORTANT: The user is asking for current/recent information. You MUST use the web_search function to get accurate, up-to-date information before responding. Do not guess or use outdated information.'
          };
          messages.splice(messages.length - 1, 0, systemMessage);
          console.log('🔧 Added system message to encourage web search for Lambda Labs');
        } else {
          // For OpenAI, we can use tool_choice
          completionParams.tool_choice = { type: 'function' as const, function: { name: 'web_search' } };
        }
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
      
      // If tool_choice failed with Lambda Labs, retry without it
      if (error.status === 400 && error.message?.includes('tool_choice') && this.config.baseURL?.includes('lambda.ai')) {
        console.log('🔧 Retrying Lambda Labs without tool_choice...');
        delete completionParams.tool_choice;
        try {
          const retryCompletion = await this.client.chat.completions.create(completionParams);
          const retryMessage = retryCompletion.choices[0]?.message;
          
          // Process the retry response
          let retryContent = retryMessage?.content || '';
          if (this.config.model?.toLowerCase().includes('deepseek') && retryContent) {
            retryContent = this.processDeepseekResponse(retryContent);
          }
          
          return {
            content: retryContent || 'I need a moment to process that request. Please try again.',
            model: retryCompletion.model,
            provider: this.name,
            usage: retryCompletion.usage ? {
              promptTokens: retryCompletion.usage.prompt_tokens,
              completionTokens: retryCompletion.usage.completion_tokens,
              totalTokens: retryCompletion.usage.total_tokens,
            } : undefined,
            timestamp: Date.now(),
          };
        } catch (retryError) {
          console.error('🔍 Retry also failed:', retryError);
          // Fall through to throw original error
        }
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
    
    // For Lambda Labs or custom endpoints, don't validate key format
    if (this.config.baseURL) {
      return true;
    }
    
    // Validate OpenAI API key format (should start with 'sk-')
    return this.config.apiKey.startsWith('sk-');
  }
}