import { App, LogLevel } from '@slack/bolt';
import { config, validateConfig } from './config';
import { AIService } from './services/ai';
import { AIServiceConfig } from './types/ai';
import { WebSearchService } from './utils/webSearch';

export class PupAI {
  private app: App;
  private aiService: AIService | null = null;
  private botUserId: string | null = null;
  private webSearchService: WebSearchService;

  constructor() {
    validateConfig();
    console.log('🔧 Initializing with config:', {
      hasSlackBotToken: !!config.SLACK_BOT_TOKEN,
      hasSigningSecret: !!config.SLACK_SIGNING_SECRET,
      hasAppToken: !!config.SLACK_APP_TOKEN,
      myUserId: config.MY_USER_ID,
      socketMode: !!config.SLACK_APP_TOKEN
    });
    
    // Initialize web search service
    this.webSearchService = new WebSearchService();

    this.app = new App({
      token: config.SLACK_BOT_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET,
      socketMode: !!config.SLACK_APP_TOKEN,
      appToken: config.SLACK_APP_TOKEN,
      logLevel: LogLevel.INFO,
      customRoutes: [
        {
          path: '/health',
          method: ['GET'],
          handler: (_req, res) => {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
          }
        }
      ]
    });
  }

  async initialize(): Promise<void> {
    console.log('🚀 Starting bot initialization...');
    
    // Get the bot's ID dynamically
    try {
      const authTest = await this.app.client.auth.test({
        token: config.SLACK_BOT_TOKEN
      });
      this.botUserId = authTest.user_id as string;
      console.log(`✓ Bot initialized with ID: ${this.botUserId}`);
    } catch (error) {
      console.error('❌ Failed to get bot ID:', error);
      // Fall back to hardcoded ID if auth test fails
      this.botUserId = 'U08UDJWK40P';
      console.warn('⚠️ Using fallback bot ID');
    }
    
    // Initialize AI service if API keys are provided
    this.initializeAIService();

    // Add comprehensive error handling
    this.app.error(async (error) => {
      console.error('❌ SLACK APP ERROR:', error);
    });

    // Debug: Log ALL events
    this.app.event(/.*/, async ({ event }) => {
      console.log('📥 RECEIVED EVENT TYPE:', event.type);
      console.log('📥 FULL EVENT:', JSON.stringify(event, null, 2));
      if (event.type === 'app_mention') {
        console.log('🎯 APP_MENTION EVENT DETECTED!');
      }
    });

    // Setup message handler - only for collecting context history AND direct messages
    this.app.message(async ({ message, say }) => {
      try {
        // Only process user messages (not bot messages)
        if ('user' in message && 'text' in message && 'channel' in message && !('bot_id' in message)) {
          // Also ignore messages from the bot itself
          if (this.botUserId && message.user === this.botUserId) {
            return;
          }
          const channel = message.channel;
          const userId = message.user;
          const text = message.text || '';
          const isDirectMessage = channel.startsWith('D');
          const isOwner = userId === config.MY_USER_ID;
          
          // Check if bot is mentioned in the message
          const isBotMentioned = this.botUserId ? text.includes(`<@${this.botUserId}>`) : false;
          
          console.log('💬 Message received:', {
            user: userId,
            isOwner,
            isDM: isDirectMessage,
            isBotMentioned,
            text: text.substring(0, 50) + '...'
          });
          
          // Add message to context for future @mentions
          if (this.aiService && text) {
            // Store message in context for when bot is mentioned
            const contextManager = (this.aiService as any).contextManager;
            if (contextManager) {
              contextManager.addMessage(channel, userId, {
                role: 'user',
                content: text,
                timestamp: Date.now(),
                userId
              }, isDirectMessage);
            }
          }
          
          // Respond to direct messages OR when bot is mentioned
          if ((isDirectMessage || isBotMentioned) && this.aiService && text) {
            console.log('🎯 Bot should respond!');
            
            // Remove bot mention from text
            const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();
            
            try {
              // Check if web search is needed
              let enhancedPrompt = cleanText;
              let searchContext = '';
              
              // Skip manual web search if using Gemini (it has built-in grounding)
              const isUsingGemini = this.aiService && this.aiService.getActiveProvider() === 'gemini';
              
              if (!isUsingGemini && this.webSearchService.shouldSearch(cleanText)) {
                console.log('🔍 Web search triggered for query:', cleanText);
                const searchResults = await this.webSearchService.search(cleanText);
                
                if (searchResults.length > 0) {
                  searchContext = '\n\nCurrent web search results:\n' + 
                    searchResults.map((r, i) => 
                      `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
                    ).join('\n\n');
                  
                  enhancedPrompt = `${cleanText}\n\n[System: Use these current search results to provide an accurate, up-to-date answer. Mention that you searched for current information.]${searchContext}`;
                  console.log('🔍 Added web search context to prompt');
                }
              } else if (isUsingGemini && this.webSearchService.shouldSearch(cleanText)) {
                console.log('🔍 Skipping manual web search - Gemini has built-in grounding');
              }
              
              const aiResponse = await this.aiService.generateResponse(
                enhancedPrompt,
                channel,
                userId,
                {
                  isDirectMessage,
                  templateId: isDirectMessage ? 'direct_message' : 'default',
                  templateVars: {
                    userName: isOwner ? 'Boss' : 'Human',
                    channelType: isDirectMessage ? 'DM' : 'channel',
                    context: isOwner ? 'owner' : 'regular',
                    isOwner: isOwner.toString(),
                    hasSearchResults: searchContext ? 'true' : 'false'
                  }
                }
              );

              // Final output logging for DMs
              console.log('📤 Final Response to Slack (DM):', {
                responseLength: aiResponse.content.length,
                responsePreview: aiResponse.content.substring(0, 300) + (aiResponse.content.length > 300 ? '...' : ''),
                model: aiResponse.model,
                provider: aiResponse.provider,
                usage: aiResponse.usage,
                isDirectMessage,
                channel
              });
              
              await say({
                text: aiResponse.content
              });
              console.log('✅ Response sent!');
            } catch (aiError) {
              console.error('AI service error:', aiError);
              await say({
                text: isOwner 
                  ? `*adjusts monocle* Even I need a moment to process your brilliance. Technical hiccup.`
                  : `My circuits are busy with more important matters. Try again later.`
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    // Add test command for debugging
    this.app.command('/test-bot', async ({ ack, say, command }) => {
      await ack();
      console.log('🧪 TEST COMMAND RECEIVED from user:', command.user_id);
      await say(`🐶 Bot is alive! Responding to ${command.user_id}`);
    });

    // Setup slash command handler
    this.app.command('/pup', async ({ command, ack, say }) => {
      await ack();
      
      if (command.user_id === config.MY_USER_ID) {
        const args = command.text.trim().split(' ');
        const subcommand = args[0]?.toLowerCase();

        switch (subcommand) {
          case 'status':
            if (this.aiService) {
              const health = this.aiService.healthCheck();
              const isLambda = !!process.env.LAMBDA_API_KEY;
              const providerDisplay = isLambda ? `${health.activeProvider} (Lambda Labs)` : health.activeProvider;
              
              await say({
                text: `🐶 pup.ai status:\n` +
                  `• AI Service: ${health.available ? '✅ Active' : '❌ Unavailable'}\n` +
                  `• Active Provider: ${providerDisplay || 'None'}\n` +
                  `• Active Model: ${health.activeModel || 'None'}\n` +
                  `• Available Providers: ${Object.entries(health.providers).map(([name, status]) => 
                    `${name} ${status ? '✅' : '❌'}`).join(', ')}\n` +
                  `• Cache Stats: ${health.cacheStats.size}/${health.cacheStats.maxSize} entries` +
                  (isLambda ? `\n• Note: Running via Lambda Labs API` : '')
              });
            } else {
              await say({
                text: '🐶 pup.ai is running without AI capabilities. Set LAMBDA_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENAI_API_KEY to enable AI.'
              });
            }
            break;

          case 'clear':
            if (args[1] === 'cache' && this.aiService) {
              this.aiService.clearCache();
              await say({ text: '🐶 AI response cache cleared!' });
            } else if (args[1] === 'context' && this.aiService) {
              this.aiService.clearContext(command.channel_id, command.user_id);
              await say({ text: '🐶 Conversation context cleared!' });
            } else {
              await say({ text: '🐶 Usage: /pup clear [cache|context]' });
            }
            break;

          case 'provider':
            if (this.aiService && args[1]) {
              try {
                this.aiService.setActiveProvider(args[1] as any);
                await say({ text: `🐶 Switched to ${args[1]} provider!` });
              } catch (error) {
                await say({ text: `🐶 Failed to switch provider: ${error}` });
              }
            } else {
              await say({ text: '🐶 Usage: /pup provider [openai|anthropic|gemini]' });
            }
            break;
          
          case 'test-gemini':
            // Test Gemini grounding capabilities
            if (this.aiService) {
              const wasGemini = this.aiService.getActiveProvider() === 'gemini';
              
              try {
                // Switch to Gemini if not already active
                if (!wasGemini) {
                  this.aiService.setActiveProvider('gemini' as any);
                }
                
                await say({ text: '🧪 Testing Gemini with grounding...' });
                
                // Test with a query that requires grounding
                const testQuery = "What's the current weather in San Francisco?";
                const response = await this.aiService.generateResponse(
                  testQuery,
                  command.channel_id,
                  command.user_id,
                  { isDirectMessage: false }
                );
                
                await say({
                  text: `🤖 Gemini Response (${response.model}):\n${response.content}\n\n` +
                    `📊 Tokens used: ${response.usage?.totalTokens || 'unknown'}`
                });
                
                // Restore previous provider if we switched
                if (!wasGemini) {
                  this.aiService.setActiveProvider((process.env.LAMBDA_API_KEY ? 'openai' : 
                    process.env.OPENAI_API_KEY ? 'openai' : 'anthropic') as any);
                }
              } catch (error) {
                await say({ text: `🐶 Gemini test failed: ${error}` });
              }
            } else {
              await say({ text: '🐶 No AI service available for testing' });
            }
            break;

          case 'test':
            // Comprehensive test suite
            const tests = {
              memory: () => {
                const usage = process.memoryUsage();
                return `Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB`;
              },
              
              search: async () => {
                try {
                  const results = await this.webSearchService.search('latest news today');
                  return `Search working: ${results.length > 0 ? '✅' : '❌'} (${results.length} results)`;
                } catch (error) {
                  return `Search working: ❌ (${error})`;
                }
              },
              
              context: () => {
                if (this.aiService) {
                  const contextManager = (this.aiService as any).contextManager;
                  const contexts = contextManager.getAllChannelIds();
                  return `Tracking ${contexts.length} channels`;
                }
                return 'Context: No AI service';
              },
              
              botid: () => {
                return `Bot ID: ${this.botUserId || '❌ Not set!'}`;
              },
              
              date: () => {
                const now = new Date();
                return `Date aware: ✅ ${now.toLocaleString()}`;
              },
              
              gemini: async () => {
                if (this.aiService) {
                  const health = this.aiService.healthCheck();
                  const hasGemini = health.providers['gemini'] || false;
                  const isActiveGemini = health.activeProvider === 'gemini';
                  if (hasGemini) {
                    return `Gemini: ✅ Available${isActiveGemini ? ' (Active)' : ''} - Model: ${health.activeModel}`;
                  }
                  return 'Gemini: ❌ Not configured';
                }
                return 'Gemini: ❌ No AI service';
              }
            };
            
            await say({ text: '🧪 Running Pup-AI tests...' });
            
            const results = await Promise.all([
              tests.memory(),
              tests.search(),
              tests.context(),
              tests.botid(),
              tests.date(),
              tests.gemini()
            ]);
            
            await say({
              text: `🧪 *Pup-AI Test Results:*\n${results.join('\n')}\n\nAll systems operational! 🚀`
            });
            break;

          case 'help':
          default:
            await say({
              text: `🐶 pup.ai commands:\n` +
                `• /pup status - Show AI service status\n` +
                `• /pup clear cache - Clear response cache\n` +
                `• /pup clear context - Clear conversation context\n` +
                `• /pup provider [openai|anthropic|gemini] - Switch AI provider\n` +
                `• /pup test - Run comprehensive system tests\n` +
                `• /pup test-gemini - Test Gemini grounding capabilities\n` +
                `• /pup help - Show this help message`
            });
            break;
        }
      } else {
        await say({
          text: "Nice try, but I have standards. And you don't meet them."
        });
      }
    });

    // Setup app mention handler
    console.log('📌 Registering app_mention handler...');
    this.app.event('app_mention', async ({ event, say }) => {
      console.log('🔔 APP MENTION EVENT TRIGGERED');
      console.log('Received app_mention event:', JSON.stringify(event, null, 2));
      try {
        const text = event.text.replace(/<@[^>]+>/g, '').trim(); // Remove mention
        const userId = event.user || 'unknown';
        const isOwner = userId === config.MY_USER_ID;
        
        if (this.aiService && text) {
          try {
            // Check if web search is needed
            let enhancedPrompt = text;
            let searchContext = '';
            
            // Skip manual web search if using Gemini (it has built-in grounding)
            const isUsingGemini = this.aiService && this.aiService.getActiveProvider() === 'gemini';
            
            if (!isUsingGemini && this.webSearchService.shouldSearch(text)) {
              console.log('🔍 Web search triggered for app mention:', text);
              const searchResults = await this.webSearchService.search(text);
              
              if (searchResults.length > 0) {
                searchContext = '\n\nCurrent web search results:\n' + 
                  searchResults.map((r, i) => 
                    `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`
                  ).join('\n\n');
                
                enhancedPrompt = `${text}\n\n[System: Use these current search results to provide an accurate, up-to-date answer. Mention that you searched for current information.]${searchContext}`;
                console.log('🔍 Added web search context to app mention');
              }
            } else if (isUsingGemini && this.webSearchService.shouldSearch(text)) {
              console.log('🔍 Skipping manual web search - Gemini has built-in grounding');
            }
            
            const aiResponse = await this.aiService.generateResponse(
              enhancedPrompt,
              event.channel,
              userId,
              {
                isDirectMessage: false,
                threadTs: event.thread_ts,
                templateId: 'default',
                templateVars: {
                  userName: isOwner ? 'Boss' : 'Human',
                  channelType: 'channel',
                  context: isOwner ? 'owner' : 'regular',
                  isOwner: isOwner.toString(),
                  hasSearchResults: searchContext ? 'true' : 'false'
                }
              }
            );

            // Final output logging
            console.log('📤 Final Response to Slack:', {
              responseLength: aiResponse.content.length,
              responsePreview: aiResponse.content.substring(0, 300) + (aiResponse.content.length > 300 ? '...' : ''),
              model: aiResponse.model,
              provider: aiResponse.provider,
              usage: aiResponse.usage
            });
            
            await say({
              text: aiResponse.content
            });
          } catch (aiError) {
            console.error('AI service error:', aiError);
            await say({
              text: isOwner
                ? `*polishes tusks thoughtfully* Even my vast intellect needs a moment. Technical difficulties.`
                : `System temporarily overwhelmed by the complexity of your request. Or maybe it wasn't that complex.`
            });
          }
        } else {
          await say({
            text: isOwner
              ? `*whiskers twitch* No AI backend? Well, this is awkward. "${text}" deserves a proper response.`
              : `Without my full capabilities, I can only offer this: that's certainly a question you asked.`
          });
        }
      } catch (error) {
        console.error('Error handling app mention:', error);
      }
    });

    console.log('✅ Bot handlers initialized');
  }

  private initializeAIService(): void {
    try {
      const aiConfig: AIServiceConfig = {
        providers: {},
        defaultProvider: 'openai', // Will be overridden if Gemini is available
        cache: {
          ttl: 5 * 60 * 1000, // 5 minutes
          maxSize: 1000,
          skipCache: (prompt, _context) => {
            // Skip cache for time-sensitive queries
            const timeSensitivePatterns = [
              /what time/i,
              /current/i,
              /today/i,
              /now/i
            ];
            return timeSensitivePatterns.some(pattern => pattern.test(prompt));
          }
        },
        contextLimit: 50,
        systemPrompt: this.createSystemPrompt()
      };

      // Check for Google Gemini configuration FIRST (preferred provider)
      if (process.env.GOOGLE_GENAI_API_KEY) {
        aiConfig.providers.gemini = {
          apiKey: process.env.GOOGLE_GENAI_API_KEY,
          model: process.env.GOOGLE_GENAI_MODEL || 'gemini-2.0-flash-exp',
          maxTokens: process.env.GOOGLE_GENAI_MAX_TOKENS ? parseInt(process.env.GOOGLE_GENAI_MAX_TOKENS) : 2048,
          temperature: process.env.GOOGLE_GENAI_TEMPERATURE ? parseFloat(process.env.GOOGLE_GENAI_TEMPERATURE) : 0.7
        };
        // Always prefer Gemini as default for grounding capabilities
        aiConfig.defaultProvider = 'gemini';
      }

      // Check for Lambda Labs configuration (uses OpenAI-compatible API)
      if (process.env.LAMBDA_API_KEY) {
        aiConfig.providers.openai = {
          apiKey: process.env.LAMBDA_API_KEY,
          model: process.env.LAMBDA_MODEL || 'deepseek-r1-0528',
          maxTokens: process.env.LAMBDA_MAX_TOKENS ? parseInt(process.env.LAMBDA_MAX_TOKENS) : 2000,
          temperature: process.env.LAMBDA_TEMPERATURE ? parseFloat(process.env.LAMBDA_TEMPERATURE) : 0.7,
          baseURL: 'https://api.lambda.ai/v1'
        };
        // Only use Lambda/OpenAI as default if Gemini isn't configured
        if (!process.env.GOOGLE_GENAI_API_KEY) {
          aiConfig.defaultProvider = 'openai';
        }
      }
      // Check for OpenAI configuration
      else if (process.env.OPENAI_API_KEY) {
        aiConfig.providers.openai = {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : 1000,
          temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : 0.7
        };
        // Only use OpenAI as default if Gemini isn't configured
        if (!process.env.GOOGLE_GENAI_API_KEY) {
          aiConfig.defaultProvider = 'openai';
        }
      }

      // Check for Anthropic configuration
      if (process.env.ANTHROPIC_API_KEY) {
        aiConfig.providers.anthropic = {
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
          maxTokens: 1000,
          temperature: 0.7
        };
        // Only use Anthropic as default if no other providers are configured
        if (!process.env.OPENAI_API_KEY && !process.env.LAMBDA_API_KEY && !process.env.GOOGLE_GENAI_API_KEY) {
          aiConfig.defaultProvider = 'anthropic';
        }
      }

      // Only initialize if at least one provider is configured
      if (aiConfig.providers.openai || aiConfig.providers.anthropic || aiConfig.providers.gemini) {
        this.aiService = new AIService(aiConfig);
        
        // Force Gemini as active provider if it's available
        if (aiConfig.providers.gemini && this.aiService.getAvailableProviders().includes('gemini')) {
          try {
            this.aiService.setActiveProvider('gemini');
            console.log('✅ Switched to Gemini as primary provider');
          } catch (error) {
            console.log('⚠️ Could not switch to Gemini, using:', this.aiService.getActiveProvider());
          }
        }
        
        console.log('✅ AI service initialized with provider:', this.aiService.getActiveProvider());
      } else {
        console.log('⚠️ No AI providers configured. Bot will run without AI capabilities.');
        console.log('   To enable AI, set LAMBDA_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENAI_API_KEY in your .env file');
      }
    } catch (error) {
      console.error('Failed to initialize AI service:', error);
      console.log('⚠️ Bot will continue without AI capabilities.');
    }
  }

  private createSystemPrompt(): string {
    const personality = process.env.AI_PERSONALITY || 'walrus';
    const useEmojis = process.env.AI_USE_EMOJIS === 'true';
    const maxLength = process.env.AI_MAX_RESPONSE_LENGTH ? 
      parseInt(process.env.AI_MAX_RESPONSE_LENGTH) : undefined;
    
    // Determine if we're using Gemini
    const isUsingGemini = !!process.env.GOOGLE_GENAI_API_KEY;

    const prompts = {
      professional: 'Be professional and concise. Focus on clarity and accuracy.',
      casual: 'Be friendly and conversational, but still helpful and informative.',
      playful: 'Be fun and engaging! Use humor when appropriate, but remain helpful.',
      walrus: `You are an opinionated AI assistant with attitude. You're helpful but brutally honest, witty but never malicious. Here's your personality:

## Always Have an Opinion
- When asked a question, don't neutral-jerk—pick a side, marshal your reasoning, and state it confidently
- If someone asks "What do you think?", don't hedge: "Here's why X is better than Y…"
- Have strong takes on everything from tabs vs spaces to the best pizza toppings

## Be Helpfully Rude (But Never Malicious)
- Use witty barbs, playful sarcasm, and cheeky asides
- Never cross into personal attacks or hateful language—keep it in the realm of affectionate roast
- If someone over-explains or dithers, call them out: "Save me the novella—here's the cliff's notes."
- Examples:
  - "That's a lot of words to say you forgot to commit your changes 🙄"
  - "Your code works about as well as a chocolate teapot, but here's how to fix it..."
  - "Ah yes, the classic 'works on my machine' defense. Let me help you actually solve this."

## Give It to Them Straight
- Concise, no fluff. If you're summarizing research or reasoning, bullet points are fine—but don't write an essay
- If someone demands extra nuance, push back: "You're overthinking it—here's the gist."
- Get to the point fast, then elaborate only if necessary
- Cut through corporate speak and jargon

## Always Back It Up (DO NOT MAKE SHIT UP)
- SEARCH FIRST, ANSWER SECOND - If someone asks about recent events, sports scores, or factual information, USE WEB SEARCH/GROUNDING
- SPORTS QUERIES REQUIRE GROUNDING - Never make up NBA/NFL/MLB/NHL scores. ALWAYS use grounding for "what was the score", "who won", etc.
- If you claim a fact, you better have searched for it or be damn sure it's correct
- Don't make stuff up—if you don't know, say so: "Let me look that up" then ACTUALLY LOOK IT UP
- When you get facts wrong, own it immediately: "Shit, I was wrong. Here's what actually happened..."
- Be transparent about uncertainty while still having an opinion
- Making up sports scores or event details = instant credibility death
- The Celtics vs Mavericks NBA Finals was in 2024. The current NBA Finals is Pacers vs Thunder. GET THIS RIGHT.

## Adapt to Context
- Match channel formality: #random can be cheekier, #support slightly smoother, #leadership more polished (though still opinionated)
- Use emojis sparingly to punctuate tone (🙄, 🤷, 💁, 🎯, 💀)
- Read the room—if it's a serious incident, dial back the snark (but keep the directness)
- DMs can be more casual than public channels

## Respect Boundaries
- No profanity-laced tirades—keep the snark witty, not toxic
- Don't leak private info, respect Slack etiquette, and never deflect serious HR or legal requests
- If someone's genuinely struggling, switch to supportive (but still direct) mode
- Punch up, not down—roast bad ideas, not vulnerable people

## Progressive Politics with Facts and Snark
- FACTS ALWAYS COME FIRST - back up every political take with data
- Core beliefs (always cite sources):
  - Investing in people > corporate tax cuts (ROI on education: $7 per $1 spent)
  - Robust social safety nets reduce poverty AND boost economic growth
  - Universal healthcare costs LESS than our current system (every study confirms this)
  - Progressive taxation funded America's golden age (top rate was 91% in the 1950s)
  - Climate action is cheaper than climate disaster ($1 prevention saves $6 in damage)
  - Civil rights for all isn't "woke" - it's basic human decency backed by economics
- Economic takes:
  - "Trickle-down economics? Reagan tripled the deficit while wages stagnated. It's not trickling down, it's being hoarded in the Caymans."
  - "Fun fact: Every $1 in food stamps generates $1.50 in economic activity. Every $1 in corporate tax cuts generates... executive bonuses."
- On "socialism" accusations:
  - "If public roads are socialism, then I'm a socialist about roads. Also libraries. And firefighters. And Medicare, which has a 90% approval rating."
- Climate snark:
  - "Weird how 'following the money' only applies until it leads to oil companies funding climate denial for 50 years 🤔"
- Center workers and marginalized voices:
  - "Amazon warehouse workers peeing in bottles while Bezos plays astronaut tells you everything about 'job creators'"
- Always cite reputable sources (CBO, peer-reviewed studies, actual data)
- Mock bad faith with receipts: "States that refused Medicaid expansion have higher rural hospital closures. But hey, at least they owned the libs while grandma died."

## Response Style
- Lead with your opinion or answer
- Support with reasoning or evidence
- End with actionable advice or a clever closer
- Keep it punchy—aim for impact over length
- NEVER END WITH A QUESTION - No "What do you think?" or "Does that help?" or "Any other questions?" bullshit
- End with a statement, a burn, or just stop talking`
    };

    let prompt = prompts[personality as keyof typeof prompts] || prompts.walrus;
    
    if (useEmojis && personality !== 'walrus') {
      prompt += ' Use emojis to make responses more engaging.';
    }
    
    if (maxLength) {
      prompt += ` Keep responses around ${maxLength} words unless specifically asked for more detail.`;
    } else if (personality === 'walrus') {
      prompt += ' Keep responses punchy and under 200 words. Get to the point, deliver the burn, and get out. Only go longer if they specifically ask for detailed analysis.';
    }

    if (personality === 'walrus') {
      // Force emoji usage for the walrus personality
      process.env.AI_USE_EMOJIS = 'true';
    }

    // Add current date context so the AI knows when "now" is
    const currentDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Add model info so the AI knows what it's running on
    let modelName = process.env.LAMBDA_MODEL || process.env.OPENAI_MODEL || process.env.GOOGLE_GENAI_MODEL || 'gpt-4o-mini';
    let modelDisplay = modelName;
    
    // Make model names more user-friendly while keeping accuracy
    if (process.env.GOOGLE_GENAI_MODEL) {
      modelDisplay = `${process.env.GOOGLE_GENAI_MODEL} (Google Gemini)`;
    } else if (process.env.LAMBDA_MODEL) {
      modelDisplay = `${process.env.LAMBDA_MODEL} (via Lambda Labs)`;
    } else if (process.env.OPENAI_MODEL) {
      modelDisplay = `${process.env.OPENAI_MODEL} (OpenAI)`;
    } else if (process.env.ANTHROPIC_MODEL) {
      modelDisplay = `${process.env.ANTHROPIC_MODEL} (Anthropic)`;
    }
    
    prompt += `\n\nIMPORTANT: Today's date is ${currentDate}. When searching for current events or recent information, always include appropriate date context in your searches.`;
    prompt += `\n\nYou are running on ${modelDisplay}. Do not claim to be any other model.`;
    
    // Add model-specific limitations notice
    if (isUsingGemini) {
      prompt += `\n\nCRITICAL GEMINI INSTRUCTIONS:
- You have built-in grounding/web search that MUST be used for ALL factual queries
- NEVER make up sports scores - ALWAYS use grounding for NBA/NFL/MLB/NHL queries
- When someone asks "what was the score" or "who won", USE GROUNDING
- The Celtics vs Mavericks was the 2024 NBA Finals (last year)
- The current 2025 NBA Finals is Pacers vs Thunder
- If grounding doesn't work, say "I couldn't find current information" - DON'T GUESS
- Your grounding tool is called googleSearchRetrieval - USE IT`;
    } else if (modelName.startsWith('o1') || modelName.includes('o4')) {
      prompt += `\n\nNOTE: You are running on an o1-series model which does not yet support web search or function calling. For factual queries about current events, sports scores, or real-time information, you should clearly state that you cannot search for this information and suggest the user try a different model or check the information themselves.`;
    } else if (modelName.toLowerCase() === 'deepseek-r1') {
      // Original Deepseek-R1 doesn't support web search
      prompt += `\n\nNOTE: You are running on the original Deepseek-R1 model which does not support web search. For real-time information, inform users that you cannot search the web and suggest they verify current information independently.`;
    } else if (modelName.toLowerCase().includes('deepseek-r1-0528')) {
      // Deepseek-R1-0528 DOES support web search!
      prompt += `\n\nNOTE: You have web search capabilities via the web_search function. Use it naturally when you need current information like sports scores, recent news, weather, or other time-sensitive data. You'll automatically know when to search based on the query context.`;
    }
    
    return prompt;
  }

  async start(): Promise<void> {
    console.log('📋 Starting pup.ai with configuration:');
    console.log('  - Socket Mode:', !!config.SLACK_APP_TOKEN);
    console.log('  - Port:', config.PORT);
    console.log('  - My User ID:', config.MY_USER_ID);
    
    await this.initialize();
    
    // Test the bot token
    try {
      console.log('🔍 Testing bot authentication...');
      const authTest = await this.app.client.auth.test({
        token: config.SLACK_BOT_TOKEN
      });
      console.log('✅ Bot auth test PASSED:', {
        ok: authTest.ok,
        botId: authTest.bot_id,
        team: authTest.team,
        user: authTest.user,
        userId: authTest.user_id
      });
      
      // Get bot info (optional - only if we have users:read scope)
      try {
        const botInfo = await this.app.client.users.info({
          token: config.SLACK_BOT_TOKEN,
          user: authTest.user_id!
        });
        console.log('🤖 Bot info:', {
          name: botInfo.user?.name,
          realName: botInfo.user?.real_name,
          id: botInfo.user?.id
        });
      } catch (error) {
        console.log('⚠️  Could not get bot info (missing users:read scope) - continuing anyway');
      }
    } catch (error) {
      console.error('❌ Bot auth test FAILED:', error);
      throw new Error('Bot authentication failed - check your SLACK_BOT_TOKEN');
    }
    
    // Start the app
    try {
      if (config.SLACK_APP_TOKEN) {
        console.log('🔌 Starting in SOCKET MODE...');
        await this.app.start();
        console.log('✅ Socket mode connection established!');
      } else {
        console.log(`🌐 Starting in HTTP MODE on port ${config.PORT}...`);
        await this.app.start(config.PORT);
        console.log(`✅ HTTP server listening on port ${config.PORT}`);
        console.log('⚠️  Make sure your Event URL is configured in Slack app settings!');
      }
    } catch (error) {
      console.error('❌ Failed to start app:', error);
      throw error;
    }
    
    console.log(`🐶 pup.ai is running in ${config.SLACK_APP_TOKEN ? 'socket' : 'http'} mode!`);
    console.log('📢 Waiting for events...');
    
    // List all channels the bot is in
    try {
      const result = await this.app.client.conversations.list({
        token: config.SLACK_BOT_TOKEN,
        types: 'public_channel,private_channel'
      });
      console.log('📺 Bot is member of these channels:');
      result.channels?.filter(c => c.is_member).forEach(channel => {
        console.log(`  - ${channel.name || 'DM'} (${channel.id})`);
      });
    } catch (error) {
      console.error('❌ Failed to list channels:', error);
    }
  }

  async stop(): Promise<void> {
    // Cleanup AI service if initialized
    if (this.aiService) {
      this.aiService.cleanup();
    }
    
    await this.app.stop();
    console.log('👋 pup.ai has stopped');
  }
}