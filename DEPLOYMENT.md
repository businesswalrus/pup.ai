# Deployment Guide for pup.ai

## Quick Start

### 1. Test Locally in HTTP Mode
```bash
# Already done - your .env now has SLACK_APP_TOKEN commented out
npm run dev
```

### 2. Set up ngrok (for local testing)
```bash
# Sign up at https://dashboard.ngrok.com/signup
# Get your authtoken and run:
./ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start ngrok tunnel
./ngrok http 3000
```

### 3. Update Slack App
1. Go to https://api.slack.com/apps
2. Select your app
3. Go to "Event Subscriptions"
4. Update Request URL to: `https://YOUR-NGROK-ID.ngrok.io/slack/events`
5. Wait for "Verified ✓"
6. Save changes

### 4. Deploy to Railway

#### Option A: CLI Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link  # Select "Create New Project"
railway up
```

#### Option B: GitHub Integration
1. Push your code to GitHub
2. Go to https://railway.app
3. "Start a New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Add environment variables (see below)
6. Deploy!

### 5. Environment Variables for Production

In Railway dashboard, add these variables:
```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret
MY_USER_ID=U026HDNUSUU
OPENAI_API_KEY=sk-proj-your-key

# DO NOT ADD SLACK_APP_TOKEN - this forces HTTP mode
```

### 6. Update Slack with Production URL
1. After deployment, Railway gives you URL like: `https://pup-ai-production.up.railway.app`
2. Go back to Slack app settings
3. Update Event Subscriptions URL to: `https://pup-ai-production.up.railway.app/slack/events`
4. Save and verify

## Monitoring

- Health check: `https://your-app.railway.app/health`
- Railway dashboard shows logs, metrics, deployments

## Rollback

Railway keeps deployment history. Click any previous deployment to rollback instantly.

## Troubleshooting

**Bot not responding?**
- Check Railway logs
- Verify environment variables
- Ensure Slack Event URL is verified

**"Request URL verification failed"?**
- Check SLACK_SIGNING_SECRET is correct
- Ensure no SLACK_APP_TOKEN in production env

**Deployment failed?**
- Check build logs in Railway
- Run `npm run build` locally to test