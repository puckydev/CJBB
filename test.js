// Test script for CRAWJU Buy Bot
const axios = require('axios');
const config = require('./config');

// Test Blockfrost API connection
async function testBlockfrostConnection() {
  console.log('🔍 Testing Blockfrost API connection...');
  
  try {
    const response = await axios.get(`${config.cardano.blockfrostApiUrl}/health`, {
      headers: {
        'project_id': config.cardano.blockfrostApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Blockfrost API connection successful!');
    console.log('Response:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Blockfrost API connection failed:', error.message);
    return false;
  }
}

// Test CRAWJU policy ID lookup
async function testCrawjuPolicyLookup() {
  console.log('\n🔍 Testing CRAWJU policy ID lookup...');
  
  try {
    const response = await axios.get(`${config.cardano.blockfrostApiUrl}/assets/${config.cardano.policyId}`, {
      headers: {
        'project_id': config.cardano.blockfrostApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ CRAWJU policy ID found!');
    console.log('Asset details:', response.data);
    return true;
  } catch (error) {
    console.error('❌ CRAWJU policy ID lookup failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    return false;
  }
}

// Test recent transactions lookup
async function testRecentTransactions() {
  console.log('\n🔍 Testing recent transactions lookup...');
  
  try {
    const response = await axios.get(`${config.cardano.blockfrostApiUrl}/assets/${config.cardano.policyId}/transactions?order=desc&count=5`, {
      headers: {
        'project_id': config.cardano.blockfrostApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Recent transactions lookup successful!');
    console.log(`Found ${response.data.length} recent transactions`);
    if (response.data.length > 0) {
      console.log('Latest transaction hash:', response.data[0].tx_hash);
    }
    return true;
  } catch (error) {
    console.error('❌ Recent transactions lookup failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    return false;
  }
}

// Test configuration
function testConfiguration() {
  console.log('\n🔍 Testing configuration...');
  
  const issues = [];
  
  if (!config.discord.token || config.discord.token.includes('your_discord_bot_token')) {
    issues.push('Discord token not properly configured');
  }
  
  if (!config.discord.channelId || config.discord.channelId === 'your_discord_channel_id') {
    issues.push('Discord channel ID not properly configured');
  }
  
  if (!config.cardano.blockfrostApiKey || config.cardano.blockfrostApiKey === 'your_blockfrost_api_key_here') {
    issues.push('Blockfrost API key not properly configured');
  }
  
  if (!config.cardano.policyId) {
    issues.push('CRAWJU policy ID not configured');
  }
  
  if (issues.length === 0) {
    console.log('✅ Configuration looks good!');
    return true;
  } else {
    console.log('❌ Configuration issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
    return false;
  }
}

// Test king.JPG file
function testKingImage() {
  console.log('\n🔍 Testing king.JPG file...');
  
  const fs = require('fs');
  const path = require('path');
  
  const kingImagePath = path.join(__dirname, 'king.JPG');
  
  if (fs.existsSync(kingImagePath)) {
    const stats = fs.statSync(kingImagePath);
    console.log('✅ king.JPG file found!');
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } else {
    console.log('❌ king.JPG file not found!');
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 CRAWJU Buy Bot - Test Suite\n');
  console.log('='.repeat(50));
  
  const results = {
    config: testConfiguration(),
    kingImage: testKingImage(),
    blockfrost: await testBlockfrostConnection(),
    policyLookup: await testCrawjuPolicyLookup(),
    transactions: await testRecentTransactions()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary:');
  console.log('='.repeat(50));
  
  let passed = 0;
  let total = 0;
  
  Object.entries(results).forEach(([test, result]) => {
    total++;
    if (result) passed++;
    console.log(`${result ? '✅' : '❌'} ${test}: ${result ? 'PASSED' : 'FAILED'}`);
  });
  
  console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🚀 All tests passed! Bot is ready for deployment.');
  } else {
    console.log('⚠️  Some tests failed. Please check the configuration and dependencies.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testBlockfrostConnection,
  testCrawjuPolicyLookup,
  testRecentTransactions,
  testConfiguration,
  testKingImage,
  runAllTests
};
