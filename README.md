# 🐶 pup.ai - Intelligent Slack Bot

A TypeScript-based Slack bot that listens to your messages and responds intelligently. Built with production-ready architecture, AI capabilities, and extensible plugin system.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Slack workspace with admin access
- Slack App created at https://api.slack.com/apps

### Setup

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Configure your Slack App:**
   - Go to https://api.slack.com/apps
   - Create a new app (or use existing)
   - Add Bot Token Scopes: `chat:write`, `channels:history`, `im:history`, `app_mentions:read`
   - Install app to workspace
   - Copy Bot Token (xoxb-...) and Signing Secret

3. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Find your Slack User ID:**
   - In Slack, click your profile
   - Click "More" → "Copy member ID"
   - Add to .env as MY_USER_ID

5. **Run the bot:**
```bash
npm run dev
```

### For Socket Mode (recommended for development):
- Enable Socket Mode in your Slack app
- Generate an App-Level Token with `connections:write` scope
- Add as SLACK_APP_TOKEN in .env

### For HTTP Mode (production):
- Use ngrok for local development: `ngrok http 3000`
- Set Request URL in Event Subscriptions: `https://your-url.ngrok.io/slack/events`

## 📝 Available Scripts

- `npm run dev` - Start bot in development mode
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built bot
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run format` - Auto-format code

## 🏗️ Project Structure

```
pup-ai/
├── src/
│   ├── app.ts           # Main bot class
│   ├── index.ts         # Entry point
│   ├── config/          # Configuration
│   ├── commands/        # Slash commands
│   ├── services/        # Core services (AI, plugins, etc.)
│   └── types/           # TypeScript types
├── tests/               # Test files
└── plugins/             # Plugin modules
```

## 🤖 Current Features

- Responds only to configured user (MY_USER_ID)
- Thread-aware responses
- Health check endpoint
- Slash command support (`/pup`)
- Socket mode and HTTP mode support

## 🚧 Roadmap

- [ ] AI integration (OpenAI/Anthropic)
- [ ] Plugin system
- [ ] Workflow automation
- [ ] Multi-workspace support
- [ ] Analytics dashboard

## 📄 License

ISC