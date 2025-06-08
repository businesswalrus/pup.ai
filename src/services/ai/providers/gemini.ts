import { 
  GoogleGenerativeAI, 
  HarmCategory, 
  HarmBlockThreshold,
  GenerativeModel,
  GenerationConfig,
  Content,
  Tool
} from '@google/generative-ai';
import { BaseAIProvider } from './base';
import { AIResponse, AIContext, AIProviderConfig } from '../../../types/ai';

export class GeminiProvider extends BaseAIProvider {
  public name = 'gemini';
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  
  constructor(config: AIProviderConfig) {
    super(config);
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    
    // Safety settings - allow all content for accurate responses
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ];
    
    // Generation config
    const generationConfig: GenerationConfig = {
      temperature: config.temperature || 0.7,
      maxOutputTokens: config.maxTokens || 2048,
      topP: 0.95,
      topK: 40,
    };
    
    // Create model with grounding if using Flash 2.0
    const modelName = config.model || 'gemini-2.0-flash-exp';
    const isFlash2 = modelName.includes('flash-2') || modelName.includes('2.0-flash');
    
    // Configure model with or without grounding based on model type
    if (isFlash2) {
      console.log(`[Gemini] Initializing ${modelName} with grounding capabilities`);
      
      // Tools for grounding (web search)
      const tools: Tool[] = [{
        googleSearchRetrieval: {}
      }];
      
      this.model = this.genAI.getGenerativeModel({ 
        model: modelName,
        safetySettings,
        generationConfig,
        tools
      });
    } else {
      console.log(`[Gemini] Initializing ${modelName} without grounding`);
      this.model = this.genAI.getGenerativeModel({ 
        model: modelName,
        safetySettings,
        generationConfig
      });
    }
  }
  
  async generateResponse(prompt: string, context: AIContext): Promise<AIResponse> {
    try {
      console.log(`[Gemini] Generating response with model: ${this.config.model || 'gemini-2.0-flash-exp'}`);
      
      // Check if web search/grounding is needed
      const needsGrounding = this.shouldUseGrounding(prompt);
      console.log(`[Gemini] Grounding needed: ${needsGrounding}`);
      
      // Build conversation history in Gemini format
      const history = this.buildGeminiHistory(context);
      
      // Create chat session
      const chat = this.model.startChat({
        history
      });
      
      // Send message and get response
      let result;
      const startTime = Date.now();
      
      if (needsGrounding) {
        console.log('[Gemini] Sending message with grounding enabled');
      }
      
      result = await chat.sendMessage(prompt);
      const response = await result.response;
      const text = response.text();
      
      const endTime = Date.now();
      console.log(`[Gemini] Response generated in ${endTime - startTime}ms`);
      
      // Check if grounding was used
      if (response.candidates?.[0]?.groundingMetadata) {
        console.log('[Gemini] Response used grounding/web search');
      }
      
      // Calculate token usage (estimated)
      const usage = this.estimateTokenUsage(prompt, text, context);
      
      return {
        content: text,
        model: this.config.model || 'gemini-2.0-flash-exp',
        provider: this.name,
        usage,
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      console.error('[Gemini] Error generating response:', error);
      
      // Handle specific Gemini errors
      if (error.message?.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      
      if (error.message?.includes('SAFETY')) {
        throw new Error('Response blocked by safety filters. Please rephrase your question.');
      }
      
      throw error;
    }
  }
  
  /**
   * Determine if grounding should be used based on the prompt
   */
  private shouldUseGrounding(prompt: string): boolean {
    const groundingPatterns = [
      // Current events and news
      /\b(current|today|latest|recent|now|happening)\b/i,
      /\b(news|update|announcement|breaking)\b/i,
      
      // Sports and games
      /\b(score|game|match|win|won|lost|championship|finals)\b/i,
      /\b(nba|nfl|mlb|nhl|sports)\b/i,
      
      // Weather
      /\b(weather|temperature|forecast)\b/i,
      
      // Stock market / crypto
      /\b(stock|price|market|crypto|bitcoin)\b/i,
      
      // Factual queries that need current info
      /\b(who is|what is|when is|where is).*\b(president|leader|champion|winner)\b/i,
      
      // Time-sensitive questions
      /\b(when|what time|schedule)\b/i,
      
      // Explicit year mentions suggesting time-sensitive info
      /\b(202[4-9]|203\d)\b/
    ];
    
    return groundingPatterns.some(pattern => pattern.test(prompt));
  }
  
  /**
   * Build conversation history in Gemini format
   */
  private buildGeminiHistory(context: AIContext): Content[] {
    const history: Content[] = [];
    
    // Add system prompt as first user message if available
    if (context.metadata?.systemPrompt) {
      history.push({
        role: 'user',
        parts: [{ text: `System instructions: ${context.metadata.systemPrompt}` }]
      });
      history.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }
    
    // Add channel context if available
    if (context.metadata?.channelContext && Array.isArray(context.metadata.channelContext)) {
      if (context.metadata.channelContext.length > 0) {
        const contextText = 'Recent channel messages:\n' + 
          context.metadata.channelContext
            .map((msg: any) => `[${msg.userId || 'User'}]: ${msg.content}`)
            .join('\n');
        
        history.push({
          role: 'user',
          parts: [{ text: contextText }]
        });
        history.push({
          role: 'model',
          parts: [{ text: 'I understand the context of the conversation.' }]
        });
      }
    }
    
    // Add conversation history
    context.messages.forEach(msg => {
      // Gemini uses 'model' instead of 'assistant'
      const role = msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : msg.role;
      
      // Skip system messages as they're handled above
      if (msg.role !== 'system') {
        history.push({
          role: role as 'user' | 'model',
          parts: [{ text: msg.content }]
        });
      }
    });
    
    return history;
  }
  
  /**
   * Estimate token usage for Gemini
   */
  private estimateTokenUsage(prompt: string, response: string, context: AIContext) {
    // Build full context for estimation
    let fullPrompt = prompt;
    
    if (context.metadata?.systemPrompt) {
      fullPrompt = context.metadata.systemPrompt + '\n' + fullPrompt;
    }
    
    if (context.messages.length > 0) {
      const contextText = context.messages.map(m => m.content).join('\n');
      fullPrompt = contextText + '\n' + fullPrompt;
    }
    
    // Rough estimation: ~1.5 characters per token for Gemini
    const promptTokens = Math.ceil(fullPrompt.length / 1.5);
    const completionTokens = Math.ceil(response.length / 1.5);
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }
  
  isAvailable(): boolean {
    try {
      // Check if we have the required configuration
      return this.validateConfig() && !!this.model;
    } catch {
      return false;
    }
  }
  
  getModel(): string {
    return this.config.model || 'gemini-2.0-flash-exp';
  }
}