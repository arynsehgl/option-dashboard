# Setup Guide: Fetch Real NSE Data

## Option 1: Use Express Server (Recommended - More Reliable)

### Setup Steps:

1. **Install server dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Run server locally:**
   ```bash
   npm start
   # Server runs on http://localhost:3001
   ```

3. **Update frontend API:**
   Edit `src/utils/api-proxy.js` to point to your server:
   ```javascript
   // Change this line in fetchOptionChainData:
   const API_BASE = 'http://localhost:3001'; // For local
   // Or your deployed server URL for production
   ```

4. **Deploy server to Railway/Render:**
   - **Railway:** Connect GitHub repo, auto-deploys
   - **Render:** Connect repo, set root to `server/`, build: `npm install`, start: `npm start`
   - **Heroku:** Similar process

5. **Update frontend to use production server:**
   ```javascript
   const API_BASE = process.env.NODE_ENV === 'production' 
     ? 'https://your-server.railway.app' 
     : 'http://localhost:3001';
   ```

---

## Option 2: Fix Netlify Functions

### Current Status:
- Function code looks correct
- Cookie handling improved
- May need testing after deployment

### Test Netlify Function:

1. **Deploy to Netlify:**
   ```bash
   netlify deploy --prod
   ```

2. **Test the function:**
   ```
   https://your-site.netlify.app/.netlify/functions/fetchNSEData?symbol=NIFTY
   ```

3. **If it works:** Update `api-proxy.js` to always use Netlify function:
   ```javascript
   // Remove the isDevelopment check
   return await fetchViaNetlifyFunction(symbol);
   ```

---

## Option 3: Test Current Netlify Function Locally

If you want to try fixing Netlify Functions first:

1. **Try running Netlify Dev again:**
   ```bash
   npm run dev:netlify
   ```

2. **Check if function is detected** (look for "Loaded function" messages)

3. **Test endpoint:**
   ```
   http://localhost:8888/.netlify/functions/fetchNSEData?symbol=NIFTY
   ```

---

## Which Option to Choose?

**For immediate reliability:** Use Option 1 (Express Server)
**If Netlify is working:** Use Option 2 (Netlify Functions)
**To test locally first:** Try Option 3

---

## Next Steps

1. Let me know which option you prefer
2. I'll help you set it up step by step
3. We'll test it together

