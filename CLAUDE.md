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
   # Option 1: Lambda Labs (for Deepseek models)
   LAMBDA_API_KEY=your-lambda-api-key
   
   # Option 2: OpenAI
   OPENAI_API_KEY=sk-your-key-here
   
   # Option 3: Anthropic
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

### 🧠 AI Configuration

**AI Provider Options**:

1. **Lambda Labs** (OpenAI-compatible API for advanced models):
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

2. **OpenAI**:
   ```bash
   OPENAI_MODEL=gpt-4o-mini           # Options: gpt-4o, gpt-4o-mini, gpt-3.5-turbo, o1-mini, o1-preview
   OPENAI_MAX_TOKENS=1000            # Max response tokens (default: 1000)
   OPENAI_TEMPERATURE=0.7            # Creativity 0-2 (default: 0.7, o1 models ignore this)
   ```

3. **Anthropic**:
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
- Available with OpenAI provider and Deepseek-R1-0528 via Lambda Labs
- NOT available with o1 models or original Deepseek-R1
- Deepseek-R1-0528 has FULL web search capabilities via function calling
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
- `/pup provider [openai|anthropic]` - Switch providers (Lambda Labs uses 'openai' provider)
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

**Last Updated**: 2025-01-13  
**Updated By**: Claude (pup.ai agent)  
**Session**: Critical Web Search Fix - Bot now properly searches instead of hallucinating