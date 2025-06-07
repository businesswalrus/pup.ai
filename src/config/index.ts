import dotenv from 'dotenv';

dotenv.config();

export const config = {
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN || '',
  MY_USER_ID: process.env.MY_USER_ID || '',
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  AI_PROVIDER: process.env.AI_PROVIDER || 'openai',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

export function validateConfig(): void {
  const required = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
  const missing = required.filter(key => !config[key as keyof typeof config]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}