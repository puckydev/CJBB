# CRAWJU Buy Bot

A Discord bot that monitors the Cardano blockchain for $CRAWJU token purchases and sends real-time notifications to your Discord server.

## Features

- 🔍 **Real-time Monitoring**: Continuously monitors the Cardano blockchain for $CRAWJU token transactions
- 🚀 **Instant Notifications**: Sends beautiful Discord embeds when buy transactions are detected
- 👑 **Custom Branding**: Includes the king.JPG image in notifications
- 📊 **Transaction Details**: Shows token amount, ₳ value, and links to blockchain explorer
- 🛡️ **Error Handling**: Robust error handling with retries and logging
- ⚡ **Production Ready**: Configured for deployment on Railway

## Setup

### Prerequisites

- Node.js 18 or higher
- Discord Bot Token
- Blockfrost API Key for Cardano mainnet

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd CrawjuBuyBot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file with the following variables:
```env
DISCORD_TOKEN=REPLACE_WITH_YOUR_DISCORD_TOKEN
DISCORD_CHANNEL_ID=YOUR_DISCORD_CHANNEL_ID
BLOCKFROST_API_KEY=REPLACE_WITH_YOUR_BLOCKFROST_KEY
CHECK_INTERVAL_MINUTES=5
```

4. Run the bot:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Configuration

The bot is configured through the `config.js` file and environment variables:

- **Discord Token**: Set via environment variable `DISCORD_TOKEN`
- **Discord Channel ID**: Set via environment variable `DISCORD_CHANNEL_ID`
- **CRAWJU Policy ID**: `ac597ca62a32cab3f4766c8f9cd577e50ebb1d00383ec7fa3990b016435241574a55`
- **Blockfrost API Key**: Set via environment variable `BLOCKFROST_API_KEY`

## Deployment on Railway

1. **Connect Repository**: Link your GitHub repository to Railway

2. **Set Environment Variables**: In Railway dashboard, add:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `DISCORD_CHANNEL_ID`: Your Discord channel ID
   - `BLOCKFROST_API_KEY`: Your Blockfrost API key
   - `CHECK_INTERVAL_MINUTES`: 5 (or your preferred interval)

3. **Deploy**: Railway will automatically deploy using the included `railway.toml` and `Dockerfile`

## Discord Bot Setup

1. **Application Details**:
   - Application ID: `1411196158663196713`
   - Public Key: `2963bb3d4d4132e5c2f05a900ff75e3cff7332025f2f4b7c06305901b5efcbbf`

2. **Bot Permissions**: The bot needs the following permissions in your Discord server:
   - **View Channels** - To access the target channel
   - **Send Messages** - To post buy notifications
   - **Embed Links** - To send rich embeds with transaction details
   - **Attach Files** - To include the king.JPG image in notifications
   - **Read Message History** - General bot functionality

3. **Required Discord Intents**: The bot is configured with these intents:
   - `Guilds` - Access to guild information
   - `GuildMessages` - Ability to send messages
   - `MessageContent` - Access to message content (if needed)

4. **Invite Bot**: Use this URL to invite the bot to your server:
   ```
   https://discord.com/oauth2/authorize?client_id=1411196158663196713&permissions=84992&integration_type=0&scope=bot
   ```

5. **Channel Setup**: After inviting the bot:
   - Ensure the bot has access to your target channel
   - Verify the `DISCORD_CHANNEL_ID` in your environment variables matches your channel
   - Test by sending a message to confirm the bot can post in the channel

## How It Works

1. **Blockchain Monitoring**: The bot uses Blockfrost API to monitor Cardano blockchain transactions
2. **Transaction Analysis**: It filters transactions for the specific $CRAWJU policy ID
3. **Buy Detection**: When tokens appear in transaction outputs, it's detected as a buy
4. **Notification**: A Discord embed is created with transaction details and the king.JPG image
5. **Continuous Operation**: The process repeats every 5 minutes (configurable)

## Project Structure

```
CrawjuBuyBot/
├── index.js           # Main bot application
├── config.js          # Configuration settings
├── package.json       # Dependencies and scripts
├── railway.toml       # Railway deployment config
├── Dockerfile         # Docker container config
├── .gitignore         # Git ignore rules
├── king.JPG          # Notification image
└── README.md         # This file
```

## API Dependencies

- **Discord.js**: Discord bot framework
- **Blockfrost**: Cardano blockchain API
- **Axios**: HTTP client for API requests
- **Node-cron**: Task scheduling

## Monitoring

The bot logs all activities to console, including:
- Startup confirmation
- Transaction checks
- Buy detections
- Error messages
- API responses

## Troubleshooting

### Common Issues

1. **"Missing Access" Error (Error Code 50001)**:
   - Verify the bot has been invited to your Discord server
   - Check that the bot has "Send Messages" permission in the target channel
   - Ensure the bot has "Embed Links" and "Attach Files" permissions
   - Confirm the `DISCORD_CHANNEL_ID` is correct

2. **"Channel not found" Error**:
   - Double-check your `DISCORD_CHANNEL_ID` environment variable
   - Ensure the bot has "View Channels" permission
   - Verify the bot is in the same server as the target channel

3. **Deprecation Warnings**:
   - Updated to use `clientReady` event instead of deprecated `ready` event
   - All Discord.js v14 compatibility issues have been resolved

4. **Bot appears offline**:
   - Check your `DISCORD_TOKEN` environment variable
   - Verify the token is valid and hasn't been regenerated
   - Check the console logs for connection errors

5. **No buy notifications appearing**:
   - Verify your `BLOCKFROST_API_KEY` is valid
   - Check if there are recent $CRAWJU transactions on the blockchain
   - Review console logs for API errors

### Logs to Check

The bot provides detailed logging. Look for these messages:
- `✅ [BotName] is online and monitoring $CRAWJU!` - Bot connected successfully
- `📊 Monitoring policy ID: [policy_id]` - Confirms correct token monitoring
- `💬 Sending notifications to channel: [channel_id]` - Shows target channel
- `Buy notification sent to Discord` - Successful notification

## Support

For issues or questions about the $CRAWJU token or this bot, please refer to the project documentation or community channels.

## License

MIT License - see LICENSE file for details.
