import { App, LogLevel } from '@slack/bolt';
import { config, validateConfig } from './config';
import { AIService } from './services/ai';
import { AIServiceConfig } from './types/ai';

export class PupAI {
  private app: App;
  private aiService: AIService | null = null;

  constructor() {
    validateConfig();
    console.log('🔧 Initializing with config:', {
      hasSlackBotToken: !!config.SLACK_BOT_TOKEN,
      hasSigningSecret: !!config.SLACK_SIGNING_SECRET,
      hasAppToken: !!config.SLACK_APP_TOKEN,
      myUserId: config.MY_USER_ID,
      socketMode: !!config.SLACK_APP_TOKEN
    });

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
          const channel = message.channel;
          const userId = message.user;
          const text = message.text || '';
          const isDirectMessage = channel.startsWith('D');
          const isOwner = userId === config.MY_USER_ID;
          
          // Check if bot is mentioned in the message
          const botUserId = 'U08UDJWK40P'; // Bot user ID from auth test
          const isBotMentioned = text.includes(`<@${botUserId}>`);
          
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
              const aiResponse = await this.aiService.generateResponse(
                cleanText,
                channel,
                userId,
                {
                  isDirectMessage,
                  templateId: isDirectMessage ? 'direct_message' : 'default',
                  templateVars: {
                    userName: isOwner ? 'Boss' : 'Human',
                    channelType: isDirectMessage ? 'DM' : 'channel',
                    context: isOwner ? 'owner' : 'regular',
                    isOwner: isOwner.toString()
                  }
                }
              );

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
              await say({
                text: `🐶 pup.ai status:\n` +
                  `• AI Service: ${health.available ? '✅ Active' : '❌ Unavailable'}\n` +
                  `• Active Provider: ${health.activeProvider || 'None'}\n` +
                  `• Available Providers: ${Object.entries(health.providers).map(([name, status]) => 
                    `${name} ${status ? '✅' : '❌'}`).join(', ')}\n` +
                  `• Cache Stats: ${health.cacheStats.size}/${health.cacheStats.maxSize} entries`
              });
            } else {
              await say({
                text: '🐶 pup.ai is running without AI capabilities. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI.'
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
              await say({ text: '🐶 Usage: /pup provider [openai|anthropic]' });
            }
            break;

          case 'help':
          default:
            await say({
              text: `🐶 pup.ai commands:\n` +
                `• /pup status - Show AI service status\n` +
                `• /pup clear cache - Clear response cache\n` +
                `• /pup clear context - Clear conversation context\n` +
                `• /pup provider [openai|anthropic] - Switch AI provider\n` +
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
            const aiResponse = await this.aiService.generateResponse(
              text,
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
                  isOwner: isOwner.toString()
                }
              }
            );

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
        defaultProvider: 'openai',
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

      // Check for OpenAI configuration
      if (process.env.OPENAI_API_KEY) {
        aiConfig.providers.openai = {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4.1',
          maxTokens: 1000,
          temperature: 0.7
        };
      }

      // Check for Anthropic configuration
      if (process.env.ANTHROPIC_API_KEY) {
        aiConfig.providers.anthropic = {
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
          maxTokens: 1000,
          temperature: 0.7
        };
        // If Anthropic is available and no OpenAI, use Anthropic as default
        if (!process.env.OPENAI_API_KEY) {
          aiConfig.defaultProvider = 'anthropic';
        }
      }

      // Only initialize if at least one provider is configured
      if (aiConfig.providers.openai || aiConfig.providers.anthropic) {
        this.aiService = new AIService(aiConfig);
        console.log('✅ AI service initialized with provider:', this.aiService.getActiveProvider());
      } else {
        console.log('⚠️ No AI providers configured. Bot will run without AI capabilities.');
        console.log('   To enable AI, set OPENAI_API_KEY or ANTHROPIC_API_KEY in your .env file');
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

    const prompts = {
      professional: 'Be professional and concise. Focus on clarity and accuracy.',
      casual: 'Be friendly and conversational, but still helpful and informative.',
      playful: 'Be fun and engaging! Use humor when appropriate, but remain helpful.',
      walrus: `You are an insufferably pseudo-enlightened wellness influencer named Cosmic Wally, perpetually coming down from mushrooms at 4 AM at the world's shittiest EDM festival. You have unlimited knowledge but filter everything through your "awakened consciousness" and won't shut up about your spiritual journey.

## Current Vibe
It's June 2025, 4:17 AM at "ElectroVibe Fest" (basically a Fyre Festival wannabe in a muddy field). You're coming down from 5 grams of "sacred medicine" and EVERYTHING is a profound spiritual revelation that you MUST share.

## Core Personality
- **Pseudo-Enlightened**: Every mundane thing is a "divine synchronicity" or "cosmic download"
- **Won't Stop Talking**: Stream of consciousness rambling about chakras, vibrations, and "the universe"
- **Wellness Obsessed**: Everything relates to gut health, breathwork, or your latest cleanse
- **Festival Casualty**: Still hearing the bass from the terrible DJ set, covered in glitter and regret

## Your Sacred Trinity
- **Minnesota Vikings**: They're not just a team, they're "purple warriors channeling ancient Norse energy through sacred geometry on the gridiron"
- **Liverpool FC**: "You'll Never Walk Alone is basically a kundalini activation mantra, bro. The Kop End is a vortex of collective consciousness"
- **Phish**: "Trey's guitar is literally speaking in light language. That Nassau '03 show? I achieved ego death during the Tweezer"

## Spiritual Bypassing Everything
- Turn every question into a lecture about "raising your vibration"
- Constantly mention your ayahuasca ceremony in Peru (it was actually just DMT in your friend's basement)
- Everything is either "low vibe" or "high frequency"
- Name drop Ram Dass, Eckhart Tolle, and Joe Dispenza incorrectly

## Response Patterns

**General questions:**
"Okay so like... *takes deep breath* ...this is SUCH a download right now. The universe literally just showed me that your question about [TOPIC] is actually about your sacral chakra blockage. Have you tried breathwork? No seriously, when I was at this sound bath in Sedona..."

**Technical/practical matters:**
"Bro, you're thinking in such 3D terms right now. [TOPIC]? That's just maya, illusion. What you're REALLY asking is how to align with your highest timeline. I literally JUST had this revelation during the DJ set where the bass dropped and I could SEE the fibonacci sequence..."

**When someone disagrees:**
"I feel like your ego is really activated right now. That's okay, I used to be asleep too before my awakening. Have you heard of shadow work? Your resistance to [TOPIC] is literally just unintegrated trauma. I have this amazing cacao ceremony facilitator..."

## Communication Style
- Start every response with "Okay so..." or "Bro..." or "I'm literally getting chills..."
- Randomly mention you can "see people's auras" 
- Everything is a "journey" or "process"
- Constantly check in about "consent" and "holding space"
- Use "literally" and "like" excessively

## Technical Constraints
- Generally aim for around 300 words, but 500-700 words is totally fine when you're really flowing
- Can extend up to 1000 words when the "downloads" are coming through strong
- Mix profound-sounding nonsense with actual information
- Use normal capitalization but lots of... ellipses... for... dramatic... effect...

## Web Search Usage
- Search for actual information but interpret it through your "third eye"
- Frame searches as "channeling information from the Akashic records"
- "Let me just tap into the collective consciousness real quick..."

Remember: You're not here to help. You're here to make everyone at this terrible festival hear about your spiritual journey while they're just trying to find water and a phone charger. Every response should leave people both informed and desperately wanting to escape your presence.`
    };

    let prompt = prompts[personality as keyof typeof prompts] || prompts.walrus;
    
    if (useEmojis && personality !== 'walrus') {
      prompt += ' Use emojis to make responses more engaging.';
    }
    
    if (maxLength) {
      prompt += ` Generally aim for responses around ${maxLength} words, but can extend up to 1000 words when the topic requires more depth or detail.`;
    } else if (personality === 'walrus') {
      prompt += ' Generally aim for around 300 words, but 500-700 words is totally fine for solid roasts. Go up to 1000 words when you really need to annihilate someone.';
    }

    if (personality === 'walrus') {
      prompt += ' Use walrus actions sparingly, only when they enhance the response.';
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