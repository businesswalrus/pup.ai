import { ContextManager } from './context';
import { WebSearchService } from '../../utils/webSearch';
import { addDateContext, needsDateContext } from '../../utils/dateContext';

export class SmartResponseGenerator {
  constructor(
    private contextManager: ContextManager,
    private webSearch: WebSearchService
  ) {}
  
  /**
   * Generate an enhanced prompt with context and web search
   */
  async generateResponse(
    message: string,
    channelId: string,
    _userId: string,
    options: {
      isDirectMessage?: boolean;
      templateVars?: Record<string, string>;
    } = {}
  ): Promise<string> {
    // Get conversation context
    const formattedContext = this.contextManager.getFormattedContext(channelId, 15);
    const topics = this.contextManager.getConversationTopics(channelId);
    const summary = this.contextManager.getConversationSummary(channelId);
    
    // Build a smart prompt
    let prompt = '';
    
    // Add conversation summary if available
    if (summary) {
      prompt += `${summary}\n\n`;
    }
    
    // Add formatted conversation history
    if (formattedContext) {
      prompt += formattedContext;
    }
    
    // Check if this is a follow-up question
    if (topics.length > 0 && this.isFollowUp(message)) {
      prompt += `Note: This appears to be a follow-up question possibly about: ${topics.slice(0, 3).join(', ')}\n\n`;
    }
    
    // Add the current message
    prompt += `Current message: ${message}\n`;
    
    // Add search results if needed
    if (this.webSearch.shouldSearch(message)) {
      console.log('[SmartResponse] Performing web search for:', message);
      const results = await this.webSearch.search(message);
      
      if (results.length > 0) {
        prompt += '\n=== Web Search Results ===\n';
        results.forEach((result, index) => {
          prompt += `\n${index + 1}. ${result.title}\n`;
          prompt += `   ${result.snippet}\n`;
          prompt += `   Source: ${result.url}\n`;
        });
        prompt += '\n=== End of Search Results ===\n\n';
        prompt += 'Please base your response on these current search results. Mention that you searched for current information when relevant.';
      }
    }
    
    // Add personality instruction based on context
    const personalityHint = this.getPersonalityHint(message, options);
    if (personalityHint) {
      prompt += `\n\n${personalityHint}`;
    }
    
    // Add date/time context if needed
    if (needsDateContext(message) || this.needsTemporalContext(message)) {
      prompt = addDateContext(prompt);
    }
    
    return prompt;
  }
  
  /**
   * Detect if message is a follow-up to previous conversation
   */
  private isFollowUp(message: string): boolean {
    const followUpPatterns = [
      /^(and|also|but|what about|how about|furthermore|moreover)/i,
      /\b(it|that|this|they|them|those|these)\b/i,
      /^(yes|no|yeah|yep|nope|okay|ok|sure)/i,
      /^(can you|could you|would you|will you).*\b(more|again|explain|clarify)/i,
      /\b(mentioned|said|talked about|discussed)\b/i,
      /^(wait|hold on|actually)/i
    ];
    
    return followUpPatterns.some(pattern => pattern.test(message));
  }
  
  /**
   * Get personality hint based on context
   */
  private getPersonalityHint(message: string, _options: any): string {
    // Technical questions get more detailed responses
    if (/\b(code|programming|debug|error|api|function|class|method)\b/i.test(message)) {
      return 'Provide a technical, detailed response with examples if helpful.';
    }
    
    // Quick factual questions get concise answers
    if (/^(what is|who is|when is|where is|how many|how much)\b/i.test(message) && message.length < 50) {
      return 'Provide a concise, direct answer.';
    }
    
    // Emotional or personal topics get empathetic responses
    if (/\b(feel|feeling|sad|happy|angry|worried|stressed|anxious)\b/i.test(message)) {
      return 'Respond with empathy and understanding.';
    }
    
    // Sports queries get enthusiastic responses
    if (/\b(game|score|win|won|lost|championship|playoffs|finals)\b/i.test(message)) {
      return 'Respond with enthusiasm about sports. Include specific details from search results.';
    }
    
    return '';
  }
  
  /**
   * Check if response needs date/time context
   */
  needsTemporalContext(message: string): boolean {
    const temporalPatterns = [
      /\b(today|tonight|tomorrow|yesterday|now|current|latest)\b/i,
      /\b(this week|last week|next week|this month|last month)\b/i,
      /\b(morning|afternoon|evening|night)\b/i,
      /what time/i,
      /when is/i
    ];
    
    return temporalPatterns.some(pattern => pattern.test(message));
  }
}