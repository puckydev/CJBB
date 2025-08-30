// Configuration file for the CRAWJU buy bot
module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN || 'your_discord_bot_token_here',
    channelId: process.env.DISCORD_CHANNEL_ID || '1411157229566165155',
    clientId: '1411196158663196713'
  },
  cardano: {
    policyId: 'ac597ca62a32cab3f4766c8f9cd577e50ebb1d00383ec7fa3990b016435241574a55',
    tokenName: '$CRAWJU',
    blockfrostApiUrl: process.env.BLOCKFROST_API_URL || 'https://cardano-mainnet.blockfrost.io/api/v0',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY || 'your_blockfrost_api_key_here'
  },
  monitoring: {
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5,
    maxRetries: 3,
    retryDelay: 5000 // 5 seconds
  }
};
