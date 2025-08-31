// Debug script for analyzing specific CRAWJU transactions
const axios = require('axios');
const config = require('./config');

// Note: We'll copy the functions locally since they're not exported from index.js

// Blockfrost API helper class (simplified copy from index.js)
class BlockfrostAPI {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.headers = {
      'project_id': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(endpoint) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: this.headers,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error(`Blockfrost API error for ${endpoint}:`, error.message);
      throw error;
    }
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

// Copy of isDexTransaction function from index.js
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

// Copy of analyzeTransaction function from index.js
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

// Debug a specific transaction
async function debugTransaction(txHash) {
  console.log(`🔍 Debugging transaction: ${txHash}`);
  console.log('='.repeat(80));
  
  try {
    const blockfrost = new BlockfrostAPI(config.cardano.blockfrostApiKey, config.cardano.blockfrostApiUrl);
    
    // Get transaction data
    const [txDetails, txUtxos, txMetadata] = await Promise.all([
      blockfrost.getTransactionDetails(txHash),
      blockfrost.getTransactionUtxos(txHash),
      blockfrost.getTransactionMetadata(txHash).catch(() => [])
    ]);
    
    console.log('\n📊 Transaction Details:');
    console.log(`- Hash: ${txDetails.hash}`);
    console.log(`- Block: ${txDetails.block}`);
    console.log(`- Block Time: ${new Date(txDetails.block_time * 1000).toISOString()}`);
    console.log(`- Fee: ${txDetails.fees} lovelaces`);
    console.log(`- Size: ${txDetails.size} bytes`);
    
    console.log('\n🔗 Metadata Analysis:');
    if (txMetadata.length === 0) {
      console.log('- No metadata found');
    } else {
      console.log(`- Found ${txMetadata.length} metadata entries`);
      txMetadata.forEach((meta, index) => {
        console.log(`  [${index}] Label: ${meta.label}, Data:`, meta.json_metadata);
      });
    }
    
    // Check if DEX transaction
    const dexCheck = isDexTransaction(txMetadata, txUtxos);
    console.log(`- Is DEX Transaction: ${dexCheck.isDex}`);
    if (dexCheck.isDex) {
      console.log(`- DEX Name: ${dexCheck.dexName}`);
    }
    
    console.log('\n💰 UTXO Analysis:');
    console.log(`📥 INPUTS (${txUtxos.inputs.length} total):`);
    let totalInputADA = 0;
    let totalInputCRAWJU = 0;
    
    txUtxos.inputs.forEach((input, index) => {
      console.log(`  [${index}] Address: ${input.address}`);
      input.amount.forEach(asset => {
        if (asset.unit === 'lovelace') {
          const ada = parseInt(asset.quantity) / 1000000;
          totalInputADA += ada;
          console.log(`    - ${ada.toFixed(6)} ₳`);
        } else if (asset.unit.includes(config.cardano.policyId)) {
          const tokens = parseInt(asset.quantity);
          totalInputCRAWJU += tokens;
          console.log(`    - ${tokens.toLocaleString()} $CRAWJU`);
        } else {
          console.log(`    - ${asset.quantity} ${asset.unit.substring(0, 20)}...`);
        }
      });
    });
    
    console.log(`📤 OUTPUTS (${txUtxos.outputs.length} total):`);
    let totalOutputADA = 0;
    let totalOutputCRAWJU = 0;
    
    txUtxos.outputs.forEach((output, index) => {
      console.log(`  [${index}] Address: ${output.address}`);
      const isSplashDEX = output.address === config.cardano.dexAddresses.splash;
      if (isSplashDEX) {
        console.log(`    ⚡ This is a Splash DEX address!`);
      }
      
      output.amount.forEach(asset => {
        if (asset.unit === 'lovelace') {
          const ada = parseInt(asset.quantity) / 1000000;
          totalOutputADA += ada;
          console.log(`    - ${ada.toFixed(6)} ₳`);
        } else if (asset.unit.includes(config.cardano.policyId)) {
          const tokens = parseInt(asset.quantity);
          totalOutputCRAWJU += tokens;
          console.log(`    - ${tokens.toLocaleString()} $CRAWJU`);
        } else {
          console.log(`    - ${asset.quantity} ${asset.unit.substring(0, 20)}...`);
        }
      });
    });
    
    console.log('\n📈 Summary:');
    console.log(`- Total Input ADA: ${totalInputADA.toFixed(6)} ₳`);
    console.log(`- Total Output ADA: ${totalOutputADA.toFixed(6)} ₳`);
    console.log(`- ADA Difference: ${(totalInputADA - totalOutputADA).toFixed(6)} ₳ (fee + spent)`);
    console.log(`- Total Input CRAWJU: ${totalInputCRAWJU.toLocaleString()}`);
    console.log(`- Total Output CRAWJU: ${totalOutputCRAWJU.toLocaleString()}`);
    console.log(`- CRAWJU Difference: ${(totalOutputCRAWJU - totalInputCRAWJU).toLocaleString()}`);
    
    // Analyze transaction using the bot's logic
    console.log('\n🤖 Bot Analysis:');
    const txAnalysis = analyzeTransaction(txUtxos, config.cardano.policyId);
    console.log('- Transaction Type:', txAnalysis.type);
    console.log('- Token Amount:', txAnalysis.amount.toLocaleString());
    console.log('- Input Tokens:', txAnalysis.inputTokens.toLocaleString());
    console.log('- Output Tokens:', txAnalysis.outputTokens.toLocaleString());
    console.log('- DEX Input Tokens:', txAnalysis.dexInputTokens.toLocaleString());
    console.log('- DEX Output Tokens:', txAnalysis.dexOutputTokens.toLocaleString());
    console.log('- User Input Tokens:', txAnalysis.userInputTokens.toLocaleString());
    console.log('- User Output Tokens:', txAnalysis.userOutputTokens.toLocaleString());
    
    console.log('\n🎯 Conclusion:');
    if (dexCheck.isDex && txAnalysis.type === 'buy') {
      console.log('✅ This transaction WOULD trigger a BUY notification');
    } else if (dexCheck.isDex && txAnalysis.type === 'sell') {
      console.log('❌ This transaction WOULD NOT trigger a notification (SELL detected)');
    } else if (!dexCheck.isDex) {
      console.log('❌ This transaction WOULD NOT trigger a notification (not a DEX transaction)');
    } else {
      console.log('❓ This transaction would not trigger a notification (unknown type)');
    }
    
  } catch (error) {
    console.error('❌ Error debugging transaction:', error.message);
  }
}

// Command line usage
if (require.main === module) {
  const txHash = process.argv[2];
  if (!txHash) {
    console.log('Usage: node debug_transaction.js <transaction_hash>');
    console.log('Example: node debug_transaction.js b064936f452b66b8f17c8a815e2ee7b3bf112e9fdc364849a8ff08f9d4521a78');
    process.exit(1);
  }
  
  debugTransaction(txHash).catch(console.error);
}

module.exports = { debugTransaction };
