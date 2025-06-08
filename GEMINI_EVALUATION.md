# Gemini AI Evaluation for pup.ai

## Executive Summary

This document evaluates switching pup.ai from its current AI providers (OpenAI, Anthropic, Lambda Labs/Deepseek) to Google's Gemini AI, with a focus on web search capabilities and overall suitability for a Slack bot.

**Key Finding**: Gemini offers compelling advantages including built-in Google Search grounding, competitive pricing, and excellent multimodal capabilities, but has some limitations compared to current setup.

## Current State Issues

### Deepseek Web Search Problem
- Deepseek-R1-0528 claims to support function calling but isn't reliably performing web searches
- Lambda Labs integration adds complexity with tool_choice parameter issues
- Hallucination problems persist (e.g., NBA Finals teams)

## Gemini AI Analysis

### Models Available

1. **Gemini 2.5 Flash** (Recommended for pup.ai)
   - Cost: $0.15/1M input tokens, $0.60/1M output tokens
   - Fast, cost-efficient
   - Supports grounding with Google Search
   - Multimodal capabilities

2. **Gemini 2.5 Pro**
   - Cost: $1.25-$2.50/1M input, $10-$15/1M output
   - Most powerful, but likely overkill for Slack bot
   - Better for complex reasoning tasks

### Key Advantages

1. **Native Google Search Grounding**
   - Built-in, no separate API needed
   - Dynamic retrieval with confidence thresholds
   - 1,500 free searches/day, then $35/1,000
   - Provides source citations and confidence scores
   - 30-day accessible URIs for fact-checking

2. **Function Calling Support**
   - Parallel function calling (multiple simultaneous calls)
   - Compositional calling (chaining functions)
   - AUTO/ANY/NONE modes for control
   - Compatible with TypeScript SDK

3. **Cost Efficiency**
   - Gemini 2.5 Flash is significantly cheaper than GPT-4o
   - Free tier available for testing
   - Grounding has generous free tier (1,500/day)

4. **Developer Experience**
   - Official TypeScript SDK (`@google/genai`)
   - Clean API design
   - Good documentation
   - Multimodal support out of the box

### Limitations

1. **Model Constraints**
   - Grounding only works with Gemini 1.5+ models
   - Limited to Google's ecosystem for search
   - Less flexibility than custom web search

2. **Search Limitations**
   - Cannot programmatically access search URIs after 30 days
   - Less control over search parameters vs custom APIs
   - Tied to Google's search algorithm

3. **Ecosystem Maturity**
   - Newer than OpenAI's ecosystem
   - Fewer community resources
   - Less battle-tested in production

## Alternative Web Search Solutions

### For Any AI Provider

1. **Serper API** (Best Overall)
   - $0.30-$1.00 per 1,000 searches
   - 1-2 second response time
   - Clean JSON API
   - Works with any AI provider

2. **SerpApi** (Most Comprehensive)
   - $50/month for 5,000 searches
   - Supports Google, Bing, YouTube, Maps, etc.
   - More expensive but feature-rich

3. **Tavily AI** (AI-Optimized)
   - Designed specifically for AI agents
   - Pre-filters results for relevance
   - $100/month for 10,000 searches

4. **Bing Search API** (Retiring August 2025)
   - Not recommended due to upcoming retirement

## Implementation Plan

### Option 1: Full Migration to Gemini (Recommended)

```typescript
// Example implementation
import { GoogleGenerativeAI } from '@google/generativeai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "text/plain",
  },
  tools: [{
    googleSearchRetrieval: {
      dynamicRetrievalConfig: {
        mode: "MODE_DYNAMIC",
        dynamicThreshold: 0.3  // Adjust based on testing
      }
    }
  }]
});
```

**Pros**:
- Unified AI + search solution
- Cost-effective
- Reliable grounding for factual queries
- No separate web search API needed

**Cons**:
- Single vendor dependency
- Less flexibility in search customization

### Option 2: Keep Multi-Provider + Add Serper API

```typescript
// Add Serper for any provider
async function webSearch(query: string) {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query })
  });
  return response.json();
}
```

**Pros**:
- Works with existing providers
- More control over search
- Provider flexibility maintained

**Cons**:
- Additional API to manage
- Extra cost for search
- More complex integration

## Cost Comparison

### Current Setup (Monthly Estimate)
- Lambda Labs: ~$10-50 (usage dependent)
- Google Search API: $0 (free tier)
- Total: $10-50

### Gemini Setup (Monthly Estimate)
- Gemini 2.5 Flash: ~$5-20 (typical Slack bot usage)
- Grounding: $0 (within free tier)
- Total: $5-20

### Multi-Provider + Serper (Monthly Estimate)
- Current providers: $10-50
- Serper API: $30-50
- Total: $40-100

## Recommendation

**Switch to Gemini 2.5 Flash with native grounding** for the following reasons:

1. **Solves the core problem**: Reliable web search that actually works
2. **Cost-effective**: Cheaper than current setup
3. **Simpler architecture**: One provider for AI + search
4. **Better factual accuracy**: Native grounding reduces hallucinations
5. **Future-proof**: Google's continued investment in AI

## Migration Steps

1. **Phase 1: Proof of Concept**
   - Create new Gemini provider in `src/services/ai/providers/`
   - Test grounding with problematic queries (NBA Finals, etc.)
   - Compare response quality and speed

2. **Phase 2: Integration**
   - Add Gemini as provider option
   - Implement dynamic retrieval thresholds
   - Test slash commands compatibility

3. **Phase 3: Migration**
   - Make Gemini default provider
   - Monitor for issues
   - Keep other providers as fallback initially

4. **Phase 4: Optimization**
   - Fine-tune grounding thresholds
   - Optimize prompts for Gemini
   - Remove legacy provider code

## Key Implementation Notes

1. **Grounding Configuration**
   ```typescript
   // Adjust threshold based on query type
   const threshold = query.match(/latest|current|today|score/) ? 0.1 : 0.5;
   ```

2. **Response Processing**
   ```typescript
   // Extract grounding sources
   const sources = response.groundingMetadata?.groundingChunks || [];
   ```

3. **Error Handling**
   ```typescript
   // Gemini-specific error codes
   if (error.code === 'RESOURCE_EXHAUSTED') {
     // Handle rate limits
   }
   ```

## Conclusion

Gemini represents a significant upgrade for pup.ai, solving the web search reliability issue while reducing costs and complexity. The native grounding feature directly addresses the hallucination problems experienced with Deepseek, making it the recommended path forward.

The migration risk is low given the ability to run multiple providers in parallel during transition. Starting with a proof of concept will validate the approach before full commitment.