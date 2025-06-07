# pup.ai Debug Guide - Bot Not Responding to @mentions

## Issue: Bot not responding when @mentioned in Slack

### 1. Check Your Slack App Configuration

#### Event Subscriptions (CRITICAL!)
1. Go to https://api.slack.com/apps → Select your app
2. Navigate to "Event Subscriptions" in the left sidebar
3. **Enable Events** must be ON
4. If using HTTP mode:
   - Request URL should be: `http://your-server:3000/slack/events`
   - It must show "Verified" ✓
5. Subscribe to bot events:
   - `app_mention` (REQUIRED for @mentions)
   - `message.channels`
   - `message.groups`
   - `message.im`
   - `message.mpim`
6. Click "Save Changes"

#### OAuth Scopes
Navigate to "OAuth & Permissions" and ensure these Bot Token Scopes are added:
- `app_mentions:read` (CRITICAL!)
- `chat:write`
- `channels:history`
- `channels:read`
- `groups:history`
- `groups:read`
- `im:history`
- `im:read`
- `mpim:history`
- `mpim:read`
- `users:read`

#### Socket Mode (if using SLACK_APP_TOKEN)
1. Go to "Socket Mode" in settings
2. Enable Socket Mode
3. Under "Event Subscriptions", ensure it shows "Socket Mode"

### 2. Verify Your .env Configuration

```bash
# Check these are set correctly:
SLACK_BOT_TOKEN=xoxb-...  # Must start with xoxb-
SLACK_SIGNING_SECRET=...   # From Basic Information
SLACK_APP_TOKEN=xapp-...  # Only if using Socket Mode
MY_USER_ID=U...           # Your actual Slack user ID
```

### 3. Bot Must Be In The Channel

The bot MUST be invited to the channel to receive @mention events!

**To invite the bot:**
- In Slack, type: `/invite @your-bot-name` in the channel
- Or click channel name → Integrations → Add apps → Add your bot

### 4. Test Sequence

1. **Run the bot** with debug logging:
   ```bash
   npm run dev
   ```

2. **Check startup logs** - you should see:
   ```
   🚀 Starting bot initialization...
   ✅ Bot auth test PASSED
   ✅ Socket mode connection established! (or HTTP server listening)
   📺 Bot is member of these channels:
   ```

3. **Test slash command first**:
   Type `/pup status` in Slack
   - If this works, the bot connection is good

4. **Test @mention**:
   Type `@your-bot-name hello` in a channel where the bot is a member

### 5. Common Issues & Solutions

#### Nothing in terminal when @mentioning:
- **Bot not in channel**: Invite the bot to the channel
- **Event subscriptions not enabled**: Check Slack app settings
- **Wrong event URL** (HTTP mode): Verify Request URL in Event Subscriptions
- **Socket Mode not enabled** (if using app token): Enable in Slack app settings
- **app_mention event not subscribed**: Add in Event Subscriptions

#### Bot connects but no events:
- **Reinstall the app**: Go to OAuth & Permissions → Reinstall to Workspace
- **Check bot permissions**: Ensure all required scopes are added

#### HTTP Mode specific:
- **Firewall/Network issues**: Slack must be able to reach your server
- **Wrong port**: Ensure PORT in .env matches your setup
- **HTTPS required**: For production, Slack requires HTTPS

### 6. Debug Commands

Add this test endpoint to verify basic functionality:

```typescript
// In app.ts initialize()
this.app.command('/test-bot', async ({ ack, say }) => {
  await ack();
  await say('🐶 Bot is alive and responding to commands!');
});
```

### 7. Manual Event Test

You can manually test if events are reaching your app:

1. In your Slack app settings, go to "Event Subscriptions"
2. Scroll down to "Send a test event"
3. Select `app_mention` event
4. Send test
5. Check your terminal for logs

### 8. Full Reinstall Process

If nothing works:
1. Remove app from workspace
2. Clear all tokens from .env
3. In Slack app settings:
   - Regenerate Signing Secret
   - Reinstall app to workspace
   - Copy new tokens
4. Update .env with new credentials
5. Restart bot

### 9. Socket Mode vs HTTP Mode

**Socket Mode** (Recommended for development):
- Requires `SLACK_APP_TOKEN`
- No public URL needed
- Works behind firewalls
- Real-time connection

**HTTP Mode**:
- No `SLACK_APP_TOKEN` in .env
- Requires public URL
- Must configure Event URL in Slack app
- Slack sends POST requests to your server

### 10. Enable More Debug Logging

Set in .env:
```
LOG_LEVEL=debug
```

Or modify the app initialization:
```typescript
this.app = new App({
  // ... other config
  logLevel: LogLevel.DEBUG,
});
```

---

**Still not working?** 
1. Check the bot ID matches what's in the auth test
2. Try mentioning the bot by ID: `<@BOT_USER_ID> hello`
3. Check Slack's API status: https://status.slack.com/