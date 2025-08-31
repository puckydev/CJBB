const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('./config');

// Initialize Discord client with minimal intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ],
  // Ensure we're not accidentally requesting any privileged intents
  partials: []
});

// Suppress the deprecation warning about 'ready' event rename
// This is likely coming from a dependency, not our code
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  // Only show warnings that aren't the ready event deprecation
  if (!warning.message.includes('ready event has been renamed to clientReady')) {
    console.warn('Node.js warning:', warning.message);
  }
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

// Check if transaction is a DEX transaction based on metadata and addresses
function isDexTransaction(metadata, utxos = null) {
  // First check metadata
  if (metadata && metadata.length > 0) {
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
  }
  
  // If no metadata found or no DEX detected, check addresses in UTXOs
  if (utxos) {
    // Check if any input or output involves known DEX addresses
    const allAddresses = [
      ...utxos.inputs.map(input => input.address),
      ...utxos.outputs.map(output => output.address)
    ];
    
    // Check for Splash DEX address
    if (allAddresses.includes(config.cardano.dexAddresses.splash)) {
      return { isDex: true, dexName: 'Splash' };
    }
  }
  
  return { isDex: false, dexName: '' };
}

// Analyze transaction to determine if it's a buy or sell and get amounts
function analyzeTransaction(utxos, policyId) {
  // Count CRAWJU tokens in inputs vs outputs to determine buy/sell
  let inputTokens = 0;
  let outputTokens = 0;
  let dexInputTokens = 0; // Tokens coming from DEX addresses
  let dexOutputTokens = 0; // Tokens going to DEX addresses
  let userInputTokens = 0; // Tokens coming from user addresses
  let userOutputTokens = 0; // Tokens going to user addresses
  
  // Calculate input tokens and categorize by source
  for (const input of utxos.inputs) {
    let crawjuAmount = 0;
    
    for (const asset of input.amount) {
      if (asset.unit && asset.unit.includes(policyId)) {
        crawjuAmount = parseInt(asset.quantity);
        inputTokens += crawjuAmount;
      }
    }
    
    // Check if this input comes from a known DEX address
    if (crawjuAmount > 0) {
      const isDexInput = input.address === config.cardano.dexAddresses.splash;
      
      if (isDexInput) {
        dexInputTokens += crawjuAmount;
      } else {
        userInputTokens += crawjuAmount;
      }
    }
  }
  
  // Calculate output tokens and categorize by recipient
  for (const output of utxos.outputs) {
    let crawjuAmount = 0;
    
    for (const asset of output.amount) {
      if (asset.unit && asset.unit.includes(policyId)) {
        crawjuAmount = parseInt(asset.quantity);
        outputTokens += crawjuAmount;
      }
    }
    
    // Check if this output goes to a known DEX address
    if (crawjuAmount > 0) {
      const isDexOutput = output.address === config.cardano.dexAddresses.splash;
      
      if (isDexOutput) {
        dexOutputTokens += crawjuAmount;
      } else {
        userOutputTokens += crawjuAmount;
      }
    }
  }
  
  // Determine transaction type based on token flow with improved logic
  let transactionType = 'unknown';
  let tokenAmount = 0;
  
  // NEW LOGIC: Focus on user perspective and DEX interaction
  // If tokens flow FROM DEX TO USER = BUY
  // If tokens flow FROM USER TO DEX = SELL
  
  if (dexInputTokens > 0 && userOutputTokens > 0) {
    // Tokens coming from DEX and going to user = BUY
    transactionType = 'buy';
    tokenAmount = userOutputTokens;
  } else if (userInputTokens > 0 && dexOutputTokens > 0) {
    // Tokens coming from user and going to DEX = SELL
    transactionType = 'sell';
    tokenAmount = userInputTokens;
  } else if (inputTokens === 0 && userOutputTokens > 0) {
    // No tokens in inputs, user receives tokens = BUY (token minting/initial distribution)
    transactionType = 'buy';
    tokenAmount = userOutputTokens;
  } else if (userInputTokens > 0 && userOutputTokens === 0) {
    // User has tokens in inputs, no tokens to user = SELL (complete sale)
    transactionType = 'sell';
    tokenAmount = userInputTokens;
  } else if (userInputTokens > 0 && userOutputTokens > 0) {
    // Tokens in inputs and user receives tokens = could be a swap/buy with change
    if (userOutputTokens > userInputTokens) {
      // User receives more tokens than they put in = BUY
      transactionType = 'buy';
      tokenAmount = userOutputTokens - userInputTokens;
    } else if (userInputTokens > userOutputTokens) {
      // User puts in more tokens than they receive = SELL (with change)
      transactionType = 'sell';
      tokenAmount = userInputTokens - userOutputTokens;
    }
  } else {
    // Fallback logic
    if (outputTokens > inputTokens) {
      // More tokens in outputs than inputs = likely BUY
      transactionType = 'buy';
      tokenAmount = outputTokens - inputTokens;
    } else if (inputTokens > outputTokens) {
      // More tokens in inputs than outputs = likely SELL
      transactionType = 'sell';
      tokenAmount = inputTokens - outputTokens;
    }
  }
  
  return {
    type: transactionType,
    amount: tokenAmount,
    inputTokens,
    outputTokens,
    dexInputTokens,
    dexOutputTokens,
    userInputTokens,
    userOutputTokens
  };
}

// Create transaction notification embed
async function createTransactionNotification(transaction, tokenAmount, adaAmount, transactionType, dexName = 'DEX') {
  const isBuy = transactionType === 'buy';
  const color = isBuy ? '#00ff00' : '#ff0000'; // Green for buy, red for sell
  const emoji = isBuy ? '🦞' : '💸';
  const action = isBuy ? 'BUY' : 'SELL';
  const description = isBuy ? `$CRAWJU ${action} detected!` : `$CRAWJU sold on ${dexName}!`;
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} $CRAWJU ${action} DETECTED!`)
    .setDescription(description)
    .addFields(
      { name: '💰 Amount', value: `${formatNumber(tokenAmount)} $CRAWJU`, inline: true },
      { name: '💎 Value', value: `${formatADA(adaAmount)} ₳`, inline: true },
      { name: '📊 Transaction', value: `[View on Cardanoscan](https://cardanoscan.io/transaction/${transaction.hash})`, inline: false }
    )
    .setTimestamp(new Date(transaction.block_time * 1000))
    .setFooter({ text: 'Powered by King Crawju' });

  // Add king image if it exists
  const kingImagePath = path.join(__dirname, 'king.JPG');
  if (fs.existsSync(kingImagePath)) {
    const attachment = new AttachmentBuilder(kingImagePath, { name: 'king.jpg' });
    embed.setImage('attachment://king.jpg');
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
        const dexCheck = isDexTransaction(txMetadata, txUtxos);
        
        if (!dexCheck.isDex) {
          console.log(`Skipping transaction ${tx.tx_hash} - not a DEX transaction`);
          continue;
        }
        
        // Analyze transaction to determine if it's a buy or sell
        const txAnalysis = analyzeTransaction(txUtxos, config.cardano.policyId);
        
        // Log transaction analysis for debugging
        console.log(`Transaction ${tx.tx_hash} analysis:`, {
          type: txAnalysis.type,
          amount: txAnalysis.amount,
          inputTokens: txAnalysis.inputTokens,
          outputTokens: txAnalysis.outputTokens,
          dexInputTokens: txAnalysis.dexInputTokens,
          dexOutputTokens: txAnalysis.dexOutputTokens,
          userInputTokens: txAnalysis.userInputTokens,
          userOutputTokens: txAnalysis.userOutputTokens
        });
        
        // Only send notifications for BUY transactions, not sells
        if (txAnalysis.amount > 0 && txAnalysis.type === 'buy') {
          console.log(`${dexCheck.dexName} DEX ${txAnalysis.type} detected: ${txAnalysis.amount} $CRAWJU in transaction ${tx.tx_hash}`);
          
          // Calculate ADA amount involved - find the actual ADA spent by the buyer
          // Look for inputs that don't contain CRAWJU tokens (buyer's payment)
          let adaAmount = '0';
          
          // Find buyer's ADA inputs (inputs without CRAWJU tokens)
          let buyerAdaInputs = [];
          
          for (const input of txUtxos.inputs) {
            let hasTokens = false;
            let inputAda = 0;
            
            for (const asset of input.amount) {
              if (asset.unit === 'lovelace') {
                inputAda = parseInt(asset.quantity);
              }
              if (asset.unit && asset.unit.includes(config.cardano.policyId)) {
                hasTokens = true;
              }
            }
            
            // If this input only has ADA (no CRAWJU tokens), it's from the buyer
            if (!hasTokens && inputAda > 0) {
              buyerAdaInputs.push(inputAda);
            }
          }
          
          // The buyer's payment is typically the largest ADA-only input
          if (buyerAdaInputs.length > 0) {
            adaAmount = Math.max(...buyerAdaInputs).toString();
          } else {
            // Fallback: calculate net ADA difference (less accurate but better than nothing)
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
            
            adaAmount = (totalInputADA - totalOutputADA).toString();
          }
          
          // Create and send notification
          const notification = await createTransactionNotification(txDetails, txAnalysis.amount, adaAmount, txAnalysis.type, dexCheck.dexName);
          
          const channel = client.channels.cache.get(config.discord.channelId);
          if (channel) {
            // Check permissions before sending
            const permissions = await checkBotPermissions(channel);
            
            if (permissions.error || !permissions.canSend || !permissions.canEmbed) {
              console.error('❌ Cannot send notification - insufficient permissions:');
              console.log(`- View Channel: ${permissions.canView ? '✅' : '❌'}`);
              console.log(`- Send Messages: ${permissions.canSend ? '✅' : '❌'}`);
              console.log(`- Embed Links: ${permissions.canEmbed ? '✅' : '❌'}`);
              console.log(`- Attach Files: ${permissions.canAttach ? '✅' : '❌'}`);
              if (permissions.error) console.log(`- Error: ${permissions.error}`);
              return;
            }

            try {
              await channel.send(notification);
              console.log(`✅ ${txAnalysis.type.toUpperCase()} notification sent to Discord`);
            } catch (error) {
              console.error(`❌ Failed to send ${txAnalysis.type} notification:`, error.message);
              if (error.code === 50001) {
                console.error('Missing Access - The bot token may be invalid or the bot was removed from the server');
              } else if (error.code === 50013) {
                console.error('Missing Permissions - Please check bot permissions in the channel');
              }
            }
          } else {
            console.error(`❌ Discord channel with ID ${config.discord.channelId} not found`);
            console.log('Please verify the channel ID and ensure the bot has access to the server');
          }
        } else if (txAnalysis.amount > 0 && txAnalysis.type === 'sell') {
          console.log(`${dexCheck.dexName} DEX SELL detected (notification skipped): ${txAnalysis.amount} $CRAWJU in transaction ${tx.tx_hash}`);
        } else if (txAnalysis.amount > 0) {
          console.log(`${dexCheck.dexName} DEX transaction with unknown type detected: ${txAnalysis.type}, amount: ${txAnalysis.amount} $CRAWJU in transaction ${tx.tx_hash}`);
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

// Function to check bot permissions in a channel
async function checkBotPermissions(channel) {
  if (!channel || !channel.guild) {
    return { canSend: false, canEmbed: false, canAttach: false, error: 'Channel not found or not in a guild' };
  }

  try {
    const botMember = await channel.guild.members.fetch(client.user.id);
    const permissions = channel.permissionsFor(botMember);
    
    return {
      canSend: permissions.has('SendMessages'),
      canEmbed: permissions.has('EmbedLinks'),
      canAttach: permissions.has('AttachFiles'),
      canView: permissions.has('ViewChannel'),
      error: null
    };
  } catch (error) {
    return { canSend: false, canEmbed: false, canAttach: false, canView: false, error: error.message };
  }
}

// Function to send startup message with retry
async function sendStartupMessage() {
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount < maxRetries) {
    try {
      // Get channel and check permissions
      const channel = client.channels.cache.get(config.discord.channelId);
      if (!channel) {
        console.log(`⏳ Channel not found, retrying... (${retryCount + 1}/${maxRetries})`);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        continue;
      }

      // Check permissions
      const permissions = await checkBotPermissions(channel);
      
      if (permissions.error) {
        console.error(`❌ Error checking permissions: ${permissions.error}`);
        return false;
      }

      console.log('🔍 Permission check results:');
      console.log(`- View Channel: ${permissions.canView ? '✅' : '❌'}`);
      console.log(`- Send Messages: ${permissions.canSend ? '✅' : '❌'}`);
      console.log(`- Embed Links: ${permissions.canEmbed ? '✅' : '❌'}`);
      console.log(`- Attach Files: ${permissions.canAttach ? '✅' : '❌'}`);

      if (!permissions.canView || !permissions.canSend || !permissions.canEmbed) {
        console.error('❌ Bot lacks required permissions. Please ensure the bot has:');
        console.log('- View Channel permission');
        console.log('- Send Messages permission');
        console.log('- Embed Links permission');
        console.log('- Attach Files permission (for images)');
        return false;
      }

      // Send startup message
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🤖 CRAWJU Buy Bot Online!')
        .setDescription('Bot is now monitoring the Cardano blockchain for $CRAWJU purchases. Only BUY transactions will trigger notifications.')
        .setTimestamp();
      
      await channel.send({ embeds: [embed] });
      console.log('✅ Startup message sent successfully');
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to send startup message (attempt ${retryCount + 1}):`, error.message);
      
      if (error.code === 50001) {
        console.error('Missing Access - The bot token may be invalid or the bot was removed from the server');
        return false;
      } else if (error.code === 50013) {
        console.error('Missing Permissions - Please check bot permissions in the channel');
        return false;
      }
      
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`⏳ Retrying in 2 seconds... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error(`❌ Failed to send startup message after ${maxRetries} attempts`);
  console.log('Please verify:');
  console.log('- The channel ID is correct');
  console.log('- The bot has access to the guild/server');
  console.log('- The bot has proper permissions');
  return false;
}

// Bot event handlers
client.once('clientReady', async () => {
  console.log(`✅ ${client.user.tag} is online and monitoring $CRAWJU!`);
  console.log(`📊 Monitoring policy ID: ${config.cardano.policyId}`);
  console.log(`💬 Sending notifications to channel: ${config.discord.channelId}`);
  
  // Send startup message with retry logic
  await sendStartupMessage();
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

// Login to Discord with enhanced error handling
console.log('🤖 Attempting to login to Discord...');
console.log('🔐 Token length:', config.discord.token ? config.discord.token.length : 'undefined');
console.log('🎯 Intents configured: Guilds only (most basic configuration)');

client.login(config.discord.token).catch(error => {
  console.error('❌ Failed to login to Discord:', error);
  
  if (error.message.includes('disallowed intents')) {
    console.error('\n🚨 INTENT ERROR DETECTED:');
    console.error('The bot is requesting intents that are not enabled in Discord Developer Portal.');
    console.error('\n📋 QUICK FIX:');
    console.error('1. Go to https://discord.com/developers/applications');
    console.error('2. Select your bot application');
    console.error('3. Click "Bot" in sidebar');
    console.error('4. Scroll to "Privileged Gateway Intents"');
    console.error('5. DISABLE all privileged intents (they should all be OFF)');
    console.error('6. Save changes and redeploy');
    console.error('\nThis bot only needs basic Guild access - no privileged intents required!');
  } else if (error.message.includes('token')) {
    console.error('\n🔑 TOKEN ERROR:');
    console.error('Check that DISCORD_TOKEN environment variable is set correctly');
  }
  
  process.exit(1);
});

module.exports = { client, monitorCRAWJUTransactions };
