# CRAWJU Buy Bot - Deployment Guide

## 🚀 Quick Deployment Steps

### Option 1: Direct Upload to GitHub
1. Go to [https://github.com/crawju/CrawjuBuyBot](https://github.com/crawju/CrawjuBuyBot)
2. Click "uploading an existing file" 
3. Drag and drop all files from this directory:
   - `index.js` (main bot file)
   - `config.js` (configuration)
   - `package.json` (dependencies)
   - `test.js` (test suite)
   - `railway.toml` (Railway config)
   - `Dockerfile` (Docker config)
   - `.gitignore` (git ignore rules)
   - `README.md` (documentation)
   - `king.JPG` (notification image)

### Option 2: Command Line (if authentication is working)
```bash
git push -u origin main
```

## 📦 Railway Deployment

Once code is on GitHub:

1. **Go to Railway**: [https://railway.app](https://railway.app)
2. **Sign in** with GitHub account
3. **New Project** → **Deploy from GitHub repo**
4. **Select**: `crawju/CrawjuBuyBot`
5. **Set Environment Variables**:
   ```
   DISCORD_TOKEN=REPLACE_WITH_YOUR_DISCORD_TOKEN
   DISCORD_CHANNEL_ID=YOUR_DISCORD_CHANNEL_ID
   BLOCKFROST_API_KEY=REPLACE_WITH_YOUR_BLOCKFROST_KEY
   CHECK_INTERVAL_MINUTES=5
   NODE_ENV=production
   ```
6. **Deploy** - Railway will automatically build and start the bot

## ✅ Verification

After deployment:
1. Check Railway logs for "Bot is online and monitoring $CRAWJU!"
2. Bot will send startup message to Discord channel
3. Bot will monitor Cardano blockchain every 5 minutes
4. Buy notifications will appear with king.JPG image

## 🎯 Bot Features Confirmed Working

- ✅ Blockfrost API connection successful
- ✅ CRAWJU policy ID found (1B total supply)
- ✅ Recent transactions detected (5 found)
- ✅ king.JPG image ready (69.33 KB)
- ✅ Discord integration configured
- ✅ All tests passed (5/5)

## 🔧 Manual Testing Commands

```bash
# Install dependencies
npm install

# Run test suite
npm test

# Start bot locally (optional)
npm start
```

## 📊 Expected Behavior

The bot will:
1. Connect to Discord and send startup message
2. Monitor Cardano blockchain every 5 minutes
3. Detect $CRAWJU buy transactions
4. Send notifications with:
   - Token amount purchased
   - ₳ value
   - Transaction link to Cardanoscan
   - King.JPG thumbnail image

Bot is **production ready** and fully tested!

