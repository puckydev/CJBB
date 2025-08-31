// Configuration file for the CRAWJU buy bot
module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN || 'REPLACE_WITH_YOUR_DISCORD_TOKEN',
    channelId: process.env.DISCORD_CHANNEL_ID || '1411385603961913344',
    clientId: '1411196158663196713'
  },
  cardano: {
    policyId: 'ac597ca62a32cab3f4766c8f9cd577e50ebb1d00383ec7fa3990b016435241574a55',
    tokenName: '$CRAWJU',
    blockfrostApiUrl: process.env.BLOCKFROST_API_URL || 'https://cardano-mainnet.blockfrost.io/api/v0',
    blockfrostApiKey: process.env.BLOCKFROST_API_KEY || 'mainnet2aTJWX1vVxEtCKSVn2MID4hW1TIAMNKp',
    // Known DEX addresses
    dexAddresses: {
      splash: 'addr1x89ksjnfu7ys02tedvslc9g2wk90tu5qte0dt4dge60hdudj764lvrxdayh2ux30fl0ktuh27csgmpevdu89jlxppvrsg0g63z'
    }
  },
  monitoring: {
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5,
    maxRetries: 3,
    retryDelay: 5000 // 5 seconds
  }
};
