// Minimal test bot to debug event reception
import { App, LogLevel } from '@slack/bolt';
import dotenv from 'dotenv';

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  socketMode: !!process.env.SLACK_APP_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG, // Maximum logging
});

// Log EVERYTHING
app.use(async ({ payload, next }) => {
  console.log('🔍 Middleware - Payload type:', payload.type);
  await next();
});

// Catch all events
app.event(/.*/, async ({ event }) => {
  console.log('📨 EVENT RECEIVED:', event.type);
  console.log('Full event:', JSON.stringify(event, null, 2));
});

// Specific app_mention handler
app.event('app_mention', async ({ event, say }) => {
  console.log('🎯 APP MENTION DETECTED!');
  try {
    await say(`Hello <@${event.user}>! I received your mention.`);
  } catch (error) {
    console.error('Error responding:', error);
  }
});

// Test command
app.command('/test', async ({ ack, say }) => {
  await ack();
  await say('Test command received!');
});

(async () => {
  try {
    // Test auth
    const auth = await app.client.auth.test({
      token: process.env.SLACK_BOT_TOKEN!
    });
    console.log('✅ Auth test passed:', auth);

    // Start app
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Test bot is running!');
    console.log('Socket mode:', !!process.env.SLACK_APP_TOKEN);
    
    // List conversations
    const convos = await app.client.conversations.list({
      token: process.env.SLACK_BOT_TOKEN!
    });
    console.log('Bot is in channels:', convos.channels?.filter(c => c.is_member).map(c => c.name));
  } catch (error) {
    console.error('Failed to start:', error);
  }
})();