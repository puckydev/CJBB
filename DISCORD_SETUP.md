# Discord Bot Setup Guide

## Common Problems and Fixes

### Problem 1: "Used disallowed intents" Error
Your bot is failing to connect because it's requesting intents that aren't properly configured in Discord Developer Portal.

**🔧 IMMEDIATE FIX NEEDED:** Follow these steps to configure intents in Discord Developer Portal:

1. **Go to Discord Developer Portal**: https://discord.com/developers/applications
2. **Select your application** (CRAWJU Buy Bot)
3. **Click "Bot" in the left sidebar**
4. **Scroll down to "Privileged Gateway Intents"**
5. **DISABLE ALL privileged intents**:
   - ❌ Presence Intent (should be OFF)
   - ❌ Server Members Intent (should be OFF) 
   - ❌ Message Content Intent (should be OFF)
6. **Click "Save Changes"**
7. **Redeploy your Railway application**

**Note:** This bot only needs basic Guild access to send notifications. No privileged intents are required.

### Problem 2: "Missing Access" Error  
Your bot lacks the necessary permissions to send messages to your Discord channel.

## Quick Fix Steps

### 1. Check Bot Permissions in Discord Server

1. **Open Discord** and go to your server
2. **Right-click your bot** in the member list
3. **Click "Manage"** → **"Permissions"**
4. **Ensure these permissions are enabled:**
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History

### 2. Check Channel-Specific Permissions

1. **Go to the target channel** (ID: `1411385603961913344`)
2. **Click the gear icon** next to the channel name → **"Permissions"**
3. **Click the "+" button** to add your bot specifically
4. **Select your bot** and ensure these permissions are **ALLOWED** (green):
   - ✅ View Channel
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files

### 3. Re-invite Bot (if necessary)

If the above doesn't work, you may need to re-invite your bot with proper permissions:

1. **Go to Discord Developer Portal**: https://discord.com/developers/applications
2. **Select your application** → **"OAuth2"** → **"URL Generator"**
3. **Select scopes**: `bot`
4. **Select bot permissions**:
   - View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
5. **Copy the generated URL** and open it in your browser
6. **Re-invite the bot** to your server

### 4. Verify Bot Token

If you're still getting errors, verify that:
- Your `DISCORD_TOKEN` environment variable is correct
- The bot hasn't been regenerated in Discord Developer Portal
- The bot is still a member of your server

## Environment Variables Required

Make sure these are set in your Railway deployment:

```
DISCORD_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=1411385603961913344
BLOCKFROST_API_KEY=your_blockfrost_key
```

## Testing the Fix

After making these changes:
1. **Redeploy your Railway app**
2. **Check the logs** - you should see:
   ```
   🔍 Permission check results:
   - View Channel: ✅
   - Send Messages: ✅
   - Embed Links: ✅
   - Attach Files: ✅
   ✅ Startup message sent successfully
   ```

## Common Issues

### "Channel not found"
- Double-check the channel ID: `1411385603961913344`
- Ensure the bot is in the same server as the channel
- Make sure the channel exists and isn't deleted

### "Missing Permissions" 
- Follow the permission setup steps above
- Some servers have role hierarchies - make sure the bot's role is high enough

### "Bot was removed"
- The bot might have been kicked from the server
- Re-invite using the OAuth2 URL with proper permissions

## Advanced: Discord Bot Intents (For Developers)

If you need to modify the bot's capabilities in the future, you may need to adjust intents:

### Current Intents (Minimal for notification bot):
```javascript
intents: [
  GatewayIntentBits.Guilds  // Basic guild info only
]
```

### If You Need Additional Features:
- **Read Messages**: Add `GuildMessages` intent
- **Message Content**: Add `MessageContent` intent (requires enabling in Developer Portal)
- **Member Info**: Add `GuildMembers` intent (privileged)

### Enabling Privileged Intents:
1. Go to Discord Developer Portal → Your Application → Bot
2. Scroll down to "Privileged Gateway Intents"
3. Enable required intents (Message Content Intent, Server Members Intent, etc.)
4. Update the code with the corresponding `GatewayIntentBits`

## Need Help?

If you're still having issues:
1. Check Railway logs for specific error messages
2. Verify all environment variables are set correctly
3. Test with a different channel to isolate the issue
4. For intent errors, check that the bot code matches your Developer Portal settings
