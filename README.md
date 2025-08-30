# CRAWJU Buy Bot

A Discord bot that monitors the Cardano blockchain for $CRAWJU token purchases and sends real-time notifications to your Discord server.

## Features

- 🔍 **Real-time Monitoring**: Continuously monitors the Cardano blockchain for $CRAWJU token transactions
- 🚀 **Instant Notifications**: Sends beautiful Discord embeds when buy transactions are detected
- 👑 **Custom Branding**: Includes the king.JPG image in notifications
- 📊 **Transaction Details**: Shows token amount, ADA value, and links to blockchain explorer
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

2. **Bot Permissions**: The bot needs the following permissions:
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History

3. **Invite Bot**: Use this URL to invite the bot to your server:
   ```
   https://discord.com/oauth2/authorize?client_id=1411196158663196713&permissions=84992&integration_type=0&scope=bot
   ```

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

## Support

For issues or questions about the $CRAWJU token or this bot, please refer to the project documentation or community channels.

## License

MIT License - see LICENSE file for details.
