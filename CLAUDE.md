# CLAUDE.md - pup.ai Development Guide

> This is a living document for AI agents working on pup.ai. It contains all context, requirements, and guidelines needed for autonomous development.

## 🎯 Project Overview

**Project**: pup.ai - Intelligent Slack Bot  
**Purpose**: Personal AI assistant that responds to owner's Slack messages with intelligent, context-aware responses  
**Tech Stack**: TypeScript, Node.js, Slack Bolt.js, OpenAI/Anthropic APIs  
**Status**: Deployed to production on Railway (Phase 1 & Deployment complete)  
**GitHub**: https://github.com/businesswalrus/pup.ai  
**Production**: https://pupai-production.up.railway.app (Running 24/7 with continuous deployment)

## 📍 Current State

### ✅ Completed
- [x] TypeScript project setup with strict typing
- [x] Basic Slack bot responding only to @mentions
- [x] Project structure with services pattern
- [x] Development tooling (ESLint, Prettier, Jest)
- [x] Environment configuration system
- [x] Git repository initialized
- [x] AI Service implementation with OpenAI and Anthropic providers
- [x] Context management system (50 message history)
- [x] Prompt engineering templates (5 built-in templates)
- [x] Response caching with LRU cache (5-minute TTL)
- [x] Slash commands for AI management (/pup status, clear, provider, help)
- [x] Automatic provider fallback on errors
- [x] Thread-aware responses
- [x] Customizable AI personalities (default: opinionated assistant with attitude)
- [x] Web search capability via OpenAI function calling (auto-triggered for factual queries)
- [x] GitHub repository created and code pushed
- [x] Railway deployment configured for 24/7 operation
- [x] HTTP mode production deployment (no socket mode)
- [x] Continuous deployment from GitHub main branch
- [x] Health check endpoint for monitoring

### 🚧 In Progress
- [ ] Test suite for AI service
- [ ] Plugin system architecture
- [ ] Workflow automation

### 📂 Project Structure
```
/Users/cody/Desktop/tusk/pup-ai/
├── src/
│   ├── app.ts              # Main PupAI class
│   ├── index.ts            # Entry point
│   ├── config/index.ts     # Configuration management
│   ├── services/           # Core services
│   │   ├── ai/            # AI integration (COMPLETED)
│   │   ├── plugins/       # Plugin system (FUTURE)
│   │   ├── workflows/     # Automation (FUTURE)
│   │   └── analytics/     # Metrics (FUTURE)
│   ├── middleware/         # Express/Bolt middleware
│   ├── utils/             # Utility functions
│   ├── types/             # TypeScript type definitions
│   └── commands/          # Slash command handlers
├── tests/                 # Test suites
├── plugins/              # Plugin modules
└── planning.md           # Overall system plan
```

## 🔑 Requirements From User

### Essential Information Needed:
1. **Slack Credentials** (in .env):
   - ✅ SLACK_BOT_TOKEN
   - ✅ SLACK_SIGNING_SECRET  
   - ✅ MY_USER_ID
   - ✅ SLACK_APP_TOKEN (optional, for socket mode)

2. **AI Provider Credentials** (configured via .env):
   - ✅ LAMBDA_API_KEY (optional - for Lambda Labs/Deepseek models)
   - ✅ OPENAI_API_KEY (optional)
   - ✅ ANTHROPIC_API_KEY (optional)
   - ✅ Auto-detects available providers
   - ✅ Configurable models via LAMBDA_MODEL, OPENAI_MODEL and ANTHROPIC_MODEL

3. **Behavioral Preferences** (configured via .env):
   - ✅ Response personality via AI_PERSONALITY (walrus/professional/casual/playful)
   - ✅ Always responds in threads when applicable
   - ✅ Maximum response length via AI_MAX_RESPONSE_LENGTH
   - ✅ Context persists within channels/DMs (50 messages)

4. **Feature Priorities**:
   - ❓ Most important features to implement first?
   - ❓ Any specific commands or workflows needed?
   - ❓ Integration with other services (GitHub, Jira, etc.)?

## 🏗️ Architecture Decisions

### AI Service Design
```typescript
interface AIProvider {
  name: string;
  generateResponse(prompt: string, context: Context): Promise<AIResponse>;
  validateConfig(): boolean;
}

class AIService {
  private providers: Map<string, AIProvider>;
  private activeProvider: AIProvider;
  private cache: LRUCache<string, AIResponse>;
  private contextManager: ContextManager;
}
```

### Context Management
- Store last 50 messages per channel
- Track user preferences in memory (later: database)
- Include channel type (DM vs public) in context
- Thread awareness for contextual responses

### Personality System
The bot's personality is highly customizable and defined in `app.ts:createSystemPrompt()`:
- System prompts are injected via `context.metadata.systemPrompt`
- Different prompt templates for different contexts (default, DM, technical, summary, code_review)
- Personality affects response style, length, and emoji usage
- Easy to add new personalities or modify existing ones
- The personality system is designed to be easily changed without breaking other functionality

### Caching Strategy
- LRU cache with 5-minute TTL
- Cache key: hash(message + context)
- Skip cache for time-sensitive queries
- Maximum 1000 cached responses

### Error Handling
- Graceful fallbacks if AI fails
- Rate limit handling with exponential backoff
- User-friendly error messages
- Comprehensive logging for debugging

## 📋 Development Guidelines

### Code Standards
1. **TypeScript**: Strict mode, no `any` types
2. **Async/Await**: No callbacks, use promises
3. **Error Handling**: Try-catch in all async functions
4. **Logging**: Structured logs with context
5. **Testing**: Minimum 80% coverage

### Git Workflow
1. Work directly on main (single developer)
2. Commit after each working feature
3. Descriptive commit messages
4. Tag releases (v0.1.0, v0.2.0, etc.)

### Security
- Never log tokens or API keys
- Validate all user input
- Sanitize AI responses
- Rate limit per user
- Audit log sensitive operations

## 🧪 Testing Strategy

### Unit Tests
- Test each service in isolation
- Mock external dependencies
- Test error scenarios
- Validate type safety

### Integration Tests
- Test Slack event handling
- Test AI provider switching
- Test caching behavior
- Test context management

### Manual Testing Checklist
- [ ] Bot responds only to MY_USER_ID
- [ ] Responses appear in correct thread
- [ ] AI responses are contextual
- [ ] Cache is working (check response times)
- [ ] Errors are handled gracefully
- [ ] Rate limiting works

## 🐛 Known Issues & Solutions

### Issue: TypeScript ESLint config with new flat config
**Solution**: Using eslint.config.js with flat config format

### Issue: Slack socket mode vs HTTP mode
**Solution**: Support both, auto-detect based on SLACK_APP_TOKEN presence

## 📊 Progress Tracking

### Phase 1: AI Integration (COMPLETED ✅)
- [x] Step 1: Create AI service structure
- [x] Step 2: Implement OpenAI provider
- [x] Step 3: Implement Anthropic provider  
- [x] Step 4: Build context manager
- [x] Step 5: Create prompt templates
- [x] Step 6: Add response caching
- [x] Step 7: Update app.ts integration
- [x] Step 8: TypeScript compilation passes

### Success Metrics
- Response time: <2s for AI generation
- Cache hit rate: >30%
- Error rate: <1%
- Context relevance: Manually validated

## 🚀 Immediate Next Steps

### Phase 2: Enhanced Features
1. **Create comprehensive test suite**:
   - Unit tests for AI providers
   - Integration tests for context management
   - Cache behavior tests
   - Mock Slack event tests

2. **Add advanced AI features**:
   - Streaming responses for long generations
   - File/code analysis capabilities
   - Custom instruction sets per channel
   - User preference persistence

3. **Implement plugin system**:
   - Plugin interface definition
   - Plugin loader/manager
   - Example plugins (GitHub, Jira, etc.)

4. **Add workflow automation**:
   - Scheduled tasks
   - Triggered workflows
   - Multi-step automations

## 🤝 Handoff Notes

When continuing development:
1. Read this file first
2. Check current git status
3. Run `npm install` if needed
4. Review any failing tests
5. Continue from "Immediate Next Steps"

## 🎭 Modifying the Personality System

To change or add personalities:
1. Edit `src/app.ts` → `createSystemPrompt()` method (starts around line 333)
2. Add new personality cases in the switch statement
3. Update the default personality by changing line 334: `const personality = this.config.aiPersonality || 'walrus';`
4. Test the new personality with different message types
5. Update this documentation to reflect the changes

Example of adding a new personality:
```typescript
case 'pirate':
  systemPrompt = `You are a salty pirate captain who tells it like it is. Respond with nautical terms and pirate speak, but remain helpful. Keep responses concise and full of maritime attitude.`;
  break;
```

The current default personality ('walrus') features:
- Always has strong opinions and backs them up
- Helpfully rude but never malicious
- Cuts through fluff and gives it straight
- Uses witty roasts and playful sarcasm
- Adapts tone to channel context
- Respects boundaries while keeping edge
- SEARCHES for facts instead of making them up
- NEVER ends responses with annoying questions
- Knows the current date and searches with temporal context
- Progressive politics backed by facts - roasts trickle-down economics with data

## 📝 Configuration Guide

### 🤖 Slack App Setup (Required First)

1. **Create Slack App**:
   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Name: "pup.ai" (or your preference)
   - Select your workspace

2. **Configure OAuth Scopes**:
   - Navigate to "OAuth & Permissions"
   - Under "Bot Token Scopes", add ALL of these:
     - `app_mentions:read` (REQUIRED for @mentions!)
     - `chat:write` (minimum required)
     - `channels:history` (read message history)
     - `channels:read` (REQUIRED - see channel info)
     - `groups:history` (read private channel history)
     - `groups:read` (REQUIRED - see private channel info)
     - `im:history` (read DM history)
     - `im:read` (REQUIRED - see DM info)
     - `mpim:history` (read group DM history)
     - `mpim:read` (REQUIRED - see group DM info)
     - `commands` (for slash commands)
     - `users:read` (optional, for bot info)
   - Click "Install to Workspace"
   - Copy the **Bot User OAuth Token** (xoxb-...)

3. **Get Credentials**:
   - From "Basic Information", copy **Signing Secret**
   - Get your Slack User ID (type `<@` in Slack and select yourself)

4. **Enable Socket Mode** (for local development):
   - Go to "Socket Mode" → Enable
   - Generate token → Copy **App-Level Token** (xapp-...)
   - Go to "Event Subscriptions" → Enable
   - Subscribe to bot events:
     - `message.channels`
     - `message.groups`
     - `message.im`
     - `message.mpim`

5. **Create .env file**:
   ```bash
   # Required Slack credentials
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   MY_USER_ID=U-your-user-id
   SLACK_APP_TOKEN=xapp-your-app-token  # For socket mode
   
   # AI Provider (at least one required)
   # Option 1: Google Gemini (RECOMMENDED - Flash 2.0 with grounding)
   GOOGLE_GENAI_API_KEY=your-gemini-api-key
   
   # Option 2: Lambda Labs (for Deepseek models)
   LAMBDA_API_KEY=your-lambda-api-key
   
   # Option 3: OpenAI
   OPENAI_API_KEY=sk-your-key-here
   
   # Option 4: Anthropic
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

### 🧠 AI Configuration

**AI Provider Options**:

1. **Google Gemini** (RECOMMENDED - Default provider with grounding):
   - Uses Gemini Flash 2.0 with native grounding (web search)
   - Automatic real-time information retrieval
   - No hallucinations for factual queries
   - Fast responses optimized for production
   - Configuration:
     ```bash
     GOOGLE_GENAI_API_KEY=your-gemini-api-key
     GOOGLE_GENAI_MODEL=gemini-2.0-flash-exp  # Default (also: gemini-1.5-pro)
     GOOGLE_GENAI_MAX_TOKENS=2048             # Max response tokens
     GOOGLE_GENAI_TEMPERATURE=0.7             # Creativity 0-2
     ```

2. **Lambda Labs** (OpenAI-compatible API for advanced models):
   - Uses Deepseek-R1-0528 with FULL web search support!
   - No rate limits on requests
   - Supports all OpenAI API features including function calling
   - Configuration:
     ```bash
     LAMBDA_API_KEY=your-lambda-api-key
     LAMBDA_MODEL=deepseek-r1-0528      # Default model
     LAMBDA_MAX_TOKENS=2000             # Max response tokens
     LAMBDA_TEMPERATURE=0.7             # Creativity 0-2
     ```

3. **OpenAI**:
   ```bash
   OPENAI_MODEL=gpt-4o-mini           # Options: gpt-4o, gpt-4o-mini, gpt-3.5-turbo, o1-mini, o1-preview
   OPENAI_MAX_TOKENS=1000            # Max response tokens (default: 1000)
   OPENAI_TEMPERATURE=0.7            # Creativity 0-2 (default: 0.7, o1 models ignore this)
   ```

4. **Anthropic**:
   ```bash
   ANTHROPIC_MODEL=claude-3-opus-20240229
   # Note: Anthropic settings are currently hardcoded
   ```

# Behavior
AI_PERSONALITY=walrus  # Default: opinionated assistant with attitude
AI_USE_EMOJIS=true     # Emoji usage (walrus personality forces this to true)
AI_MAX_RESPONSE_LENGTH=200  # Target response length in words

# Web Search (optional - for real-time information lookup)
GOOGLE_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id
```

**Available Personalities**:
- `walrus` (default): Progressive AI with facts and attitude. Core values:
  - Always backs opinions with data and reputable sources
  - Champions workers' rights, universal healthcare, and climate action
  - Roasts trickle-down economics with 40 years of evidence
  - Centers marginalized voices while punching up at power
  - Responds to "socialism" accusations with Nordic country success stories
  - Keeps responses under 200 words unless asked for detail
  - Uses emojis sparingly (🙄, 🤷, 💁, 🎯, 💀) to punctuate snark
- `professional`: Concise and focused on clarity and accuracy
- `casual`: Friendly and conversational while remaining helpful
- `playful`: Fun and engaging with appropriate humor
- Custom personalities can be added by modifying the `createSystemPrompt()` method in `app.ts`

**Web Search Feature**:
- **Primary**: Gemini Flash 2.0 with native grounding (automatic, no configuration needed!)
- **Secondary**: Manual web search via WebSearchService for other providers
- Available with:
  - Gemini Flash 2.0 (native grounding - BEST option)
  - OpenAI provider and Deepseek-R1-0528 via Lambda Labs
  - NOT available with o1 models or original Deepseek-R1
- Automatically triggered for factual queries (sports scores, recent events, news, facts)
- REQUIRED for queries matching factual patterns - prevents hallucination
- Can search for real-time information on any topic
- Falls back to direct web URLs if Google API not configured
- Integrated into AI responses automatically when needed
- Enhanced with:
  - Date filtering (last 30 days only)
  - Automatic date context injection for current events
  - Results sorted by date (most recent first)
  - Current year/month added to time-sensitive queries
- Pattern detection includes:
  - Sports queries (scores, games, results)
  - Time-sensitive info (today, yesterday, recent, latest)
  - Factual questions (what, who, when, where)
  - News and current events
  - Prices, weather, stock info
  - Political events and figures

### 🎮 Available Commands

**Slash commands** (after adding to Slack app):
- `/pup status` - Check AI service health
- `/pup clear cache` - Clear response cache
- `/pup clear context` - Reset conversation
- `/pup provider [gemini|openai|anthropic]` - Switch providers (Gemini is default)
- `/pup test` - Run comprehensive system tests
- `/pup test-gemini` - Test Gemini grounding capabilities
- `/pup help` - Show all commands

**Bot responds to**:
- @mentions in channels (responds in main channel)
- Direct messages (all messages in DMs)
- Has access to last 50 messages for context
- Collects all channel messages silently for context

## 🚀 Deployment Information

### Production Environment
- **Platform**: Railway
- **URL**: https://pupai-production.up.railway.app
- **Health Check**: https://pupai-production.up.railway.app/health
- **Deployment**: Automatic on push to main branch
- **Mode**: HTTP mode (not socket mode)

### Local Development
- **Mode**: Socket mode (with SLACK_APP_TOKEN in .env)
- **Testing**: Use ngrok for HTTP mode testing
- **Commands**: 
  - `npm run dev` - Start in development
  - `npm run build` - Build for production
  - `npm test` - Run tests

### Environment Variables
**Production (Railway)**:
- `SLACK_BOT_TOKEN` - Bot OAuth token
- `SLACK_SIGNING_SECRET` - Request validation
- `MY_USER_ID` - Owner's Slack user ID
- AI Provider (choose one):
  - `LAMBDA_API_KEY` + `LAMBDA_MODEL` - Lambda Labs/Deepseek
  - `OPENAI_API_KEY` + `OPENAI_MODEL` - OpenAI
  - `ANTHROPIC_API_KEY` - Anthropic Claude
- **NOT** `SLACK_APP_TOKEN` - Omit to force HTTP mode

**Local Development (.env)**:
- All production variables PLUS
- `SLACK_APP_TOKEN` - Enables socket mode for local dev

### Continuous Deployment
1. Push to main → Railway auto-builds
2. TypeScript compiled → Docker image created
3. Health check verified → Traffic switched
4. Old instance terminated

### Monitoring
- Railway dashboard for logs and metrics
- Health endpoint for uptime monitoring
- Slack app insights for usage stats

---

## 🔧 Recent Updates

### NBA Finals Hallucination Fix (2025-01-13)
Fixed bot claiming Celtics vs Mavericks instead of correct Pacers vs Thunder:

1. **Web Search Pattern Fixes**:
   - "When's the next nba finals game" now triggers search (was missing)
   - Added patterns for "next game", "when is", common phrasings
   - ANY query with "nba finals" forces web search

2. **Force Model to Use Search Results**:
   - Explicit system prompts: "Use ONLY search results"
   - "DO NOT make up teams like Celtics vs Mavericks"
   - Follow-up message after search reinforces this

3. **Better Search Logging**:
   - Logs actual search results for debugging
   - Shows what teams/info the search found
   - Helps verify correct information is available

### Emergency API Response Fix (2025-01-13)
Fixed critical crash: "Cannot read properties of undefined (reading '0')":

1. **Defensive Response Handling**:
   - Added checks for all API responses before accessing choices[0]
   - Handles cases where Lambda Labs returns invalid response structures
   - Prevents crashes when responses don't have expected format

2. **Improved Error Detection**:
   - Better detection of tool_choice failures
   - Checks multiple error patterns (not just "tool_choice" in message)
   - More robust retry logic with proper error handling

3. **Enhanced Debugging**:
   - Logs API call parameters before each request
   - Tracks message array modifications
   - Better error details when retries fail

### Critical Web Search Fix (2025-01-13) 
Fixed web search completely failing for obvious queries:

1. **Web Search Detection Overhaul**:
   - Rewrote patterns from scratch to catch all sports/time queries
   - Now properly triggers for: "Are there nba finals tonight?", "Who won Alcaraz musetti yesterday?"
   - Comprehensive pattern matching for sports, weather, news, events
   - Tested all common query formats to ensure detection

2. **Force Tool Usage**:
   - OpenAI: Uses `tool_choice` to force web search when needed
   - Lambda Labs: Adds system message encouraging tool use
   - Retry logic if Lambda Labs rejects tool_choice parameter
   - No more hallucinated sports scores or made-up results

3. **Response Processing**:
   - Strips `<think>` and `<thinking>` tags from Deepseek responses
   - Users never see internal reasoning process
   - Clean output with comprehensive logging at each stage

4. **Enhanced Logging**:
   - 🎯 Web search detection logs
   - 🤖 Lambda Labs request/response debugging
   - 🧹 Deepseek response processing logs
   - 📤 Final output to Slack logs
   - 🔍 Web search execution and error logs

### Deepseek Integration Fixes (2025-01-13)
Major improvements to Lambda Labs/Deepseek integration for more natural behavior:

1. **Smarter Web Search Detection** (Note: This was too restrictive - see fix above):
   - Removed overly broad patterns that triggered on almost any question
   - Now only searches for genuinely time-sensitive queries with clear context
   - Examples that DO trigger: "who won the game last night", "current weather in NYC"
   - Examples that DON'T trigger: "what is python", "who invented the telephone"

2. **Natural AI Behavior**:
   - Removed aggressive prompt modifications that confused the model
   - Let Deepseek decide when to use tools naturally
   - Lower temperature (0.3) for factual queries reduces hallucinations
   - Removed intrusive fallback web search mechanism

3. **Accurate Model Information**:
   - Bot now shows actual model name: "deepseek-r1-0528 (via Lambda Labs)"
   - Proper detection between original R1 and R1-0528 variants
   - Clear indication of which provider is being used

4. **Better Debug Logging**:
   - Enhanced Lambda Labs-specific request/response logging
   - Easier to troubleshoot issues with detailed debug output
   - Tracks temperature adjustments and tool usage decisions

### Lambda Labs Integration (2025-01-07)
Successfully integrated Lambda Labs API to run Deepseek-R1-0528:

1. **Configuration**:
   - Uses OpenAI-compatible endpoint: `https://api.lambda.ai/v1`
   - Environment variables: `LAMBDA_API_KEY`, `LAMBDA_MODEL`, `LAMBDA_MAX_TOKENS`, `LAMBDA_TEMPERATURE`
   - Takes priority over OpenAI if configured

2. **Web Search Support**:
   - Deepseek-R1-0528 has FULL function calling support
   - Automatic web search for factual queries
   - Enhanced pattern detection for sports, news, time-sensitive queries

3. **Important Notes**:
   - Ensure Railway environment variables are properly set
   - Bot will show exact model name in `/pup status`
   - Web search works for: sports scores, current events, weather, stock prices
   - Google API credentials still required for web search functionality

---

## 📝 Session Summary: Complete Lambda Labs/Deepseek Integration Overhaul (2025-01-13)

### Overview
Major debugging and fixes for Lambda Labs/Deepseek integration issues including response processing, API error handling, web search functionality, and sports hallucinations.

### Issues Fixed

1. **Deepseek Thinking Tags Appearing in Slack**
   - **Problem**: `<think>` and `<thinking>` tags from Deepseek's internal reasoning were visible to users
   - **Solution**: Added `processDeepseekResponse()` method to strip all thinking tags before sending to Slack
   - **Location**: `src/services/ai/providers/openai.ts:31-55`

2. **Critical Production Crash: "Cannot read properties of undefined"**
   - **Problem**: Lambda Labs API sometimes returns invalid response structures
   - **Solution**: Added defensive checks before accessing `completion.choices[0]`
   - **Key Changes**:
     - Check for error objects: `if (completion && (completion as any).object === 'error')`
     - Validate response structure: `if (!completion || !completion.choices || completion.choices.length === 0)`
     - Added similar checks for follow-up responses
   - **Location**: `src/services/ai/providers/openai.ts:271-282, 363-367`

3. **Lambda Labs tool_choice Parameter Errors**
   - **Problem**: Lambda Labs doesn't support OpenAI's `tool_choice` parameter
   - **Solution**: Never set `tool_choice` for Lambda Labs, use system messages instead
   - **Implementation**:
     - Detect Lambda Labs via baseURL check
     - Add system message to encourage tool use instead of forcing it
     - Retry logic if tool_choice error occurs
   - **Location**: `src/services/ai/providers/openai.ts:223-244, 431-479`

4. **NBA Finals Hallucination (Celtics vs Mavericks)**
   - **Problem**: Bot was making up teams instead of using web search results
   - **Root Cause**: Web search patterns weren't catching queries like "When's the next nba finals game"
   - **Solutions**:
     - Expanded web search patterns to catch all NBA Finals queries
     - Added explicit instructions to use ONLY search results
     - Enhanced search result logging for debugging
   - **Key Patterns Added**:
     - `/\bnba\s+finals/i` - ANY mention of NBA Finals
     - `/\bwhen('?s|\s+is|\s+are).*\b(nba|nfl|mlb|nhl|game|match|finals|playoff)/i`
     - `/\b(is there|are there|any).*\b(game|match|finals|playoff).*\b(tonight|today)/i`
   - **Location**: `src/services/ai/providers/openai.ts:57-120`

### Technical Implementation Details

1. **Response Processing Pipeline**:
   ```typescript
   // Process all Deepseek responses
   if (isDeepseek && responseContent) {
     responseContent = this.processDeepseekResponse(responseContent);
   }
   ```

2. **Enhanced Logging**:
   - 🎯 Web search detection
   - 🤖 Lambda Labs request/response
   - 🧹 Deepseek response processing
   - 📤 Final output to Slack
   - 🔍 Web search execution

3. **Model Detection**:
   - Proper display of actual model name in `/pup status`
   - Shows "deepseek-r1-0528 (via Lambda Labs)" for clarity
   - Distinguishes between original R1 and R1-0528 variants

### Configuration Notes

- Lambda Labs uses OpenAI-compatible endpoint: `https://api.lambda.ai/v1`
- Deepseek-R1-0528 DOES support function calling (unlike original R1)
- Web search works automatically for factual queries
- Temperature lowered to 0.3 for factual queries to reduce hallucinations

### Testing & Verification

- Tested NBA Finals queries - now correctly reports Pacers vs Thunder
- Verified thinking tags no longer appear in Slack
- Confirmed no more crashes from invalid API responses
- Web search properly triggers for all sports/time-sensitive queries

### Future Considerations

- Consider adding more robust API response validation
- May want to implement streaming responses for better UX
- Could add user preference for web search sensitivity
- Plugin system would benefit from these error handling patterns

---

## 🔧 Session Update: Google Gemini Integration & Enhanced Web Search (2025-01-14)

### Overview
Major enhancement adding Google Gemini Flash 2.0 as the primary AI provider with native grounding capabilities, plus critical fixes for memory leaks and bot ID detection.

### Changes Made

1. **Added Google Gemini Provider**
   - **File**: `src/services/ai/providers/gemini.ts`
   - Full implementation of Gemini Flash 2.0 with native grounding
   - Automatic web search for factual queries (no configuration needed!)
   - Safety settings configured for accurate responses
   - Proper conversation history formatting

2. **Fixed Critical Memory Leak**
   - **File**: `src/services/ai/context.ts`
   - Added automatic cleanup every hour
   - Limits contexts to 12 hours and 30 messages max
   - Prevents production crashes from memory exhaustion

3. **Fixed Hardcoded Bot ID**
   - **File**: `src/app.ts`
   - Bot ID now dynamically retrieved via auth.test()
   - Falls back gracefully if auth fails
   - Prevents bot from responding to itself

4. **Enhanced Web Search**
   - **File**: `src/utils/webSearch.ts`
   - Added support for multiple search providers (Brave, Google, SerpAPI)
   - Comprehensive pattern matching for time-sensitive queries
   - Smart query enhancement with temporal context

5. **Improved Context Management**
   - **File**: `src/services/ai/context.ts`
   - Added formatted context with timestamps
   - Topic detection for follow-up questions
   - Conversation summaries

6. **Smart Response Generation**
   - **File**: `src/services/ai/smartResponse.ts`
   - Detects follow-up questions intelligently
   - Adds personality hints based on message type
   - Integrates web search seamlessly

7. **Date/Time Awareness**
   - **File**: `src/utils/dateContext.ts`
   - Automatic date/time injection for temporal queries
   - Natural language time parsing
   - Relative time formatting

### Configuration Updates

**Gemini is now the DEFAULT provider**. To use:
```env
GOOGLE_GENAI_API_KEY=your-api-key-here
GOOGLE_GENAI_MODEL=gemini-2.0-flash-exp  # Optional, this is default
```

### Testing Commands
- `/pup test` - Includes Gemini status check
- `/pup test-gemini` - Test grounding capabilities specifically
- `/pup provider gemini` - Switch to Gemini (already default)

### Why Gemini Flash 2.0?
- **Native grounding**: No separate web search API needed
- **Fast responses**: Optimized for production use
- **No hallucinations**: Grounded responses for factual queries
- **Cost-effective**: More affordable than GPT-4 with similar capabilities

---

## 🔧 Session Update: Gemini Grounding Fixes for Sports Queries (2025-01-15)

### Overview
Critical fixes to ensure Google Gemini properly uses grounding for sports queries and stops hallucinating old NBA Finals results.

### Issues Fixed

1. **Gemini Model Detection**
   - **Problem**: Grounding only enabled for models containing "flash-2" or "2.0-flash", missing "gemini-2.5-flash-preview"
   - **Solution**: Changed detection to include ALL flash models
   - **Location**: `src/services/ai/providers/gemini.ts:52`

2. **Forced Grounding Configuration**
   - **Problem**: Gemini wasn't consistently using grounding even when detected as needed
   - **Solutions**:
     - Set `dynamicThreshold: 0.0` to always use grounding when possible
     - Added `toolConfig` with `functionCallingConfig` to allow googleSearchRetrieval
     - Added explicit system instruction when grounding is needed
   - **Location**: `src/services/ai/providers/gemini.ts:59-78`

3. **Enhanced Grounding Detection**
   - Added more comprehensive patterns including:
     - Team names (pacers, thunder, celtics, etc.)
     - Score-specific queries ("actual score", "final score")
     - Context continuation patterns ("okay", "what about")
   - **Location**: `src/services/ai/providers/gemini.ts:177-210`

4. **System Prompt Updates**
   - **Walrus Personality**: Added explicit "SPORTS QUERIES REQUIRE GROUNDING" instruction
   - **Gemini-Specific**: Added detailed instructions about using googleSearchRetrieval tool
   - Specifically mentions Celtics vs Mavericks was 2024, current is Pacers vs Thunder
   - **Location**: `src/app.ts:615-622, 711-718`

5. **Manual Web Search Disabled for Gemini**
   - Prevents double search (manual + grounding)
   - Gemini relies solely on its native grounding
   - **Location**: `src/app.ts:131-149, 404-422`

### Technical Details

1. **Grounding Metadata Logging**:
   ```typescript
   if (response.candidates?.[0]?.groundingMetadata) {
     console.log('[Gemini] Grounding details:', {
       attributions: response.candidates[0].groundingMetadata.groundingAttributions?.length || 0,
       queries: response.candidates[0].groundingMetadata.searchQueries || []
     });
   } else if (needsGrounding) {
     console.error('[Gemini] WARNING: Grounding was needed but not used!');
   }
   ```

2. **Explicit Grounding Instructions**:
   ```typescript
   if (needsGrounding) {
     finalPrompt = `${prompt}\n\n[SYSTEM: This is a factual query. You MUST use grounding/web search to get accurate, current information. Do NOT make up or guess any information, especially sports scores.]`;
   }
   ```

### Testing Notes
- Monitor logs for "WARNING: Grounding was needed but not used!"
- Check for `hasGroundingMetadata: true` in response logs
- Verify sports queries return current, accurate information
- Test with queries like "what was the score" and "who won last night"

### Update: Gemini 2.5 Preview Model Support (2025-01-15)

**Important**: Gemini 2.5 Flash Preview (`gemini-2.5-flash-preview-05-20`) does NOT support the `googleSearchRetrieval` grounding tool. This results in a 400 error "Search Grounding is not supported."

**Solution Implemented**:
1. Detect which Gemini model is being used
2. Only enable grounding for Gemini 2.0 Flash models
3. For Gemini 2.5, use manual web search instead
4. Enhanced web search for sports scores:
   - Replaces "score" with "final score" in queries
   - Adds critical system instructions to extract exact scores
   - Logs search results for debugging
   - Specific handling for score queries vs general queries

**Key Changes**:
- `src/services/ai/providers/gemini.ts`: Model detection for grounding support
- `src/app.ts`: Conditional web search based on Gemini model version
- `src/utils/webSearch.ts`: Enhanced query modification for sports scores

---

**Last Updated**: 2025-01-15  
**Updated By**: Claude (pup.ai agent)  
**Session**: Gemini 2.5 Support & Web Search Score Extraction - Fixed grounding detection, enhanced web search for sports scores, improved system prompts