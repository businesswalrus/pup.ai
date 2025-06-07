// Quick socket mode debug script
import { App, LogLevel } from '@slack/bolt';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Debug Configuration:');
console.log('- SLACK_APP_TOKEN exists:', !!process.env.SLACK_APP_TOKEN);
console.log('- SLACK_APP_TOKEN starts with:', process.env.SLACK_APP_TOKEN?.substring(0, 10) + '...');
console.log('- Socket Mode enabled:', !!process.env.SLACK_APP_TOKEN);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN!,
  logLevel: LogLevel.DEBUG,
});

// Listen for all events
app.event(/.*/, async ({ event }) => {
  console.log('📨 Event received:', event.type);
});

app.event('app_mention', async ({ event, say }) => {
  console.log('🎯 APP MENTION!', event);
  await say('I heard you!');
});

(async () => {
  await app.start();
  console.log('⚡️ Socket Mode app is running!');
})();