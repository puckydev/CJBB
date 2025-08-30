const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('./config');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Store last processed transaction hash to avoid duplicates
let lastProcessedTxHash = null;

// HTTP server for health checks (Railway requirement)
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      bot: client.isReady() ? 'connected' : 'connecting',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`🌐 Health check server listening on port ${port}`);
});

// Blockfrost API helper
class BlockfrostAPI {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.headers = {
      'project_id': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(endpoint, retryCount = 0) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: this.headers,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error(`Blockfrost API error for ${endpoint}:`, error.message);
      
      if (retryCount < config.monitoring.maxRetries) {
        console.log(`Retrying... (${retryCount + 1}/${config.monitoring.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, config.monitoring.retryDelay));
        return this.makeRequest(endpoint, retryCount + 1);
      }
      
      throw error;
    }
  }

  async getAssetTransactions(policyId, limit = 10) {
    return this.makeRequest(`/assets/${policyId}/transactions?order=desc&count=${limit}`);
  }

  async getTransactionDetails(txHash) {
    return this.makeRequest(`/txs/${txHash}`);
  }

  async getTransactionUtxos(txHash) {
    return this.makeRequest(`/txs/${txHash}/utxos`);
  }

  async getTransactionMetadata(txHash) {
    return this.makeRequest(`/txs/${txHash}/metadata`);
  }
}

// Initialize Blockfrost API
const blockfrost = new BlockfrostAPI(config.cardano.blockfrostApiKey, config.cardano.blockfrostApiUrl);

// Format ADA amount
function formatADA(lovelaces) {
  return (parseInt(lovelaces) / 1000000).toFixed(2);
}

// Format large numbers with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Check if transaction is a DEX transaction based on metadata
function isDexTransaction(metadata) {
  if (!metadata || metadata.length === 0) {
    return { isDex: false, dexName: '' };
  }

  for (const meta of metadata) {
    // Check for standard DEX metadata (label 674)
    if (meta.label === '674') {
      const message = meta.json_metadata;
      const messageStr = JSON.stringify(message).toLowerCase();
      
      if (messageStr.includes('splash')) {
        return { isDex: true, dexName: 'Splash' };
      }
      
      // Check for other DEX patterns
      const dexPatterns = [
        { name: 'Minswap', patterns: ['minswap', 'order executed'] },
        { name: 'SundaeSwap', patterns: ['sundae', 'swap'] },
        { name: 'MuesliSwap', patterns: ['muesli', 'order'] },
        { name: 'WingRiders', patterns: ['wing', 'riders'] }
      ];
      
      for (const dex of dexPatterns) {
        if (dex.patterns.some(pattern => messageStr.includes(pattern))) {
          return { isDex: true, dexName: dex.name };
        }
      }
    }
    
    // Check for Splash DEX specific metadata (label 0 with 0x0100)
    else if (meta.label === '0' || meta.label === 0) {
      const message = meta.json_metadata;
      
      // Splash DEX uses label 0 with specific hex values
      if (message === '0x0100' || message === '0x0001' || (typeof message === 'string' && message.startsWith('0x01'))) {
        return { isDex: true, dexName: 'Splash' };
      }
    }
    
    // Check for other metadata that might indicate DEX activity
    else if (meta.label) {
      const message = meta.json_metadata;
      const messageStr = JSON.stringify(message).toLowerCase();
      
      if (messageStr.includes('splash') || messageStr.includes('dex') || messageStr.includes('swap')) {
        return { isDex: true, dexName: messageStr.includes('splash') ? 'Splash' : 'Unknown DEX' };
      }
    }
  }
  
  return { isDex: false, dexName: '' };
}

// Get token amount from transaction - only count tokens going to buyers (not change/existing holdings)
function getTokenAmount(utxos, policyId) {
  // Find outputs that have both ADA and CRAWJU tokens (these are likely buy transactions)
  // We want the smallest CRAWJU amount as that's likely the purchase, not the change
  let tokenAmounts = [];
  
  for (const output of utxos.outputs) {
    if (output.amount) {
      let hasADA = false;
      let crawjuAmount = 0;
      
      for (const asset of output.amount) {
        if (asset.unit === 'lovelace') {
          hasADA = true;
        }
        if (asset.unit && asset.unit.includes(policyId)) {
          crawjuAmount = parseInt(asset.quantity);
        }
      }
      
      // If this output has both ADA and CRAWJU, it's likely a buy transaction
      if (hasADA && crawjuAmount > 0) {
        tokenAmounts.push(crawjuAmount);
      }
    }
  }
  
  // Return the smallest amount (the actual purchase, not the change)
  return tokenAmounts.length > 0 ? Math.min(...tokenAmounts) : 0;
}

// Create buy notification embed
async function createBuyNotification(transaction, tokenAmount, adaAmount, dexName = 'DEX') {
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('🚀 $CRAWJU BUY DETECTED!')
    .setDescription(`A new purchase of $CRAWJU has been detected on ${dexName} DEX!`)
    .addFields(
      { name: '💰 Amount', value: `${formatNumber(tokenAmount)} $CRAWJU`, inline: true },
      { name: '💎 Value', value: `${formatADA(adaAmount)} ADA`, inline: true },
      { name: '🏛️ DEX', value: dexName, inline: true },
      { name: '📊 Transaction', value: `[View on Cardanoscan](https://cardanoscan.io/transaction/${transaction.hash})`, inline: false }
    )
    .setTimestamp(new Date(transaction.block_time * 1000))
    .setFooter({ text: 'CRAWJU Buy Bot | Powered by Cardano' });

  // Add king image if it exists
  const kingImagePath = path.join(__dirname, 'king.JPG');
  if (fs.existsSync(kingImagePath)) {
    const attachment = new AttachmentBuilder(kingImagePath, { name: 'king.jpg' });
    embed.setThumbnail('attachment://king.jpg');
    return { embeds: [embed], files: [attachment] };
  }

  return { embeds: [embed] };
}

// Monitor for CRAWJU transactions
async function monitorCRAWJUTransactions() {
  try {
    console.log('Checking for new $CRAWJU transactions...');
    
    // Get recent transactions for the CRAWJU policy ID
    const transactions = await blockfrost.getAssetTransactions(config.cardano.policyId, 5);
    
    if (!transactions || transactions.length === 0) {
      console.log('No recent transactions found');
      return;
    }

    // Check each transaction
    for (const tx of transactions) {
      // Skip if we've already processed this transaction
      if (lastProcessedTxHash === tx.tx_hash) {
        break;
      }

      try {
        // Get transaction details, UTXOs, and metadata
        const [txDetails, txUtxos, txMetadata] = await Promise.all([
          blockfrost.getTransactionDetails(tx.tx_hash),
          blockfrost.getTransactionUtxos(tx.tx_hash),
          blockfrost.getTransactionMetadata(tx.tx_hash).catch(() => [])
        ]);

        // First check if this is a DEX transaction
        const dexCheck = isDexTransaction(txMetadata);
        
        if (!dexCheck.isDex) {
          console.log(`Skipping transaction ${tx.tx_hash} - not a DEX transaction`);
          continue;
        }
        
        // Check if this is a buy transaction (has CRAWJU in outputs)
        const tokenAmount = getTokenAmount(txUtxos, config.cardano.policyId);
        
        if (tokenAmount > 0) {
          console.log(`${dexCheck.dexName} DEX buy detected: ${tokenAmount} $CRAWJU in transaction ${tx.tx_hash}`);
          
          // Calculate ADA amount involved - find pure ADA inputs (buyer's payment)
          let buyerInputs = [];
          
          for (const input of txUtxos.inputs) {
            let hasTokens = false;
            let adaAmount = 0;
            
            for (const asset of input.amount) {
              if (asset.unit === 'lovelace') {
                adaAmount = parseInt(asset.quantity);
              }
              if (asset.unit && asset.unit.includes(config.cardano.policyId)) {
                hasTokens = true;
              }
            }
            
            // If this input only has ADA (no CRAWJU tokens), it's likely from the buyer
            if (!hasTokens && adaAmount > 0) {
              buyerInputs.push(adaAmount);
            }
          }
          
          // Use the largest pure ADA input as the purchase amount (main purchase)
          let adaAmount = '0';
          if (buyerInputs.length > 0) {
            adaAmount = Math.max(...buyerInputs).toString();
          } else {
            // Fallback: Calculate difference between inputs and outputs
            let totalInputADA = 0;
            let totalOutputADA = 0;
            
            for (const input of txUtxos.inputs) {
              for (const asset of input.amount) {
                if (asset.unit === 'lovelace') {
                  totalInputADA += parseInt(asset.quantity);
                }
              }
            }
            
            for (const output of txUtxos.outputs) {
              for (const asset of output.amount) {
                if (asset.unit === 'lovelace') {
                  totalOutputADA += parseInt(asset.quantity);
                }
              }
            }
            
            const netSpent = totalInputADA - totalOutputADA;
            adaAmount = netSpent.toString();
          }
          
          // Create and send notification
          const notification = await createBuyNotification(txDetails, tokenAmount, adaAmount, dexCheck.dexName);
          
          const channel = client.channels.cache.get(config.discord.channelId);
          if (channel) {
            try {
              await channel.send(notification);
              console.log('Buy notification sent to Discord');
            } catch (error) {
              console.error('Failed to send buy notification:', error.message);
              if (error.code === 50001) {
                console.error('Missing Access - Please ensure the bot has proper permissions:');
                console.log('- Send Messages permission in the target channel');
                console.log('- Embed Links permission');
                console.log('- Attach Files permission (for images)');
                console.log('- View Channel permission');
              }
            }
          } else {
            console.error(`Discord channel with ID ${config.discord.channelId} not found`);
            console.log('Please verify the channel ID and bot permissions');
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${tx.tx_hash}:`, error.message);
      }
    }

    // Update last processed transaction
    if (transactions.length > 0) {
      lastProcessedTxHash = transactions[0].tx_hash;
    }

  } catch (error) {
    console.error('Error monitoring CRAWJU transactions:', error.message);
  }
}

// Bot event handlers
client.once('clientReady', () => {
  console.log(`✅ ${client.user.tag} is online and monitoring $CRAWJU!`);
  console.log(`📊 Monitoring policy ID: ${config.cardano.policyId}`);
  console.log(`💬 Sending notifications to channel: ${config.discord.channelId}`);
  
  // Send startup message
  const channel = client.channels.cache.get(config.discord.channelId);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🤖 CRAWJU Buy Bot Online!')
      .setDescription('Bot is now monitoring the Cardano blockchain for $CRAWJU purchases.')
      .setTimestamp();
    
    channel.send({ embeds: [embed] }).catch(error => {
      console.error('Failed to send startup message:', error.message);
      console.log('This might be due to missing permissions. Please ensure the bot has:');
      console.log('- Send Messages permission in the target channel');
      console.log('- Embed Links permission');
      console.log('- Attach Files permission (for images)');
    });
  } else {
    console.error(`Channel with ID ${config.discord.channelId} not found. Please verify:`);
    console.log('- The channel ID is correct');
    console.log('- The bot has access to the guild/server');
    console.log('- The bot has View Channel permission');
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.on('warn', (warning) => {
  console.warn('Discord client warning:', warning);
});

// Set up monitoring cron job (every 5 minutes by default)
const cronExpression = `*/${config.monitoring.checkIntervalMinutes} * * * *`;
console.log(`Setting up monitoring cron job: ${cronExpression}`);

cron.schedule(cronExpression, () => {
  monitorCRAWJUTransactions();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  server.close(() => {
    client.destroy();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down bot...');
  server.close(() => {
    client.destroy();
    process.exit(0);
  });
});

// Login to Discord
client.login(config.discord.token).catch(error => {
  console.error('Failed to login to Discord:', error);
  process.exit(1);
});

module.exports = { client, monitorCRAWJUTransactions };
