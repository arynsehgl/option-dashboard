# Troubleshooting Guide

## Function Returns 404

If you're getting a 404 error when calling the Netlify function:

1. **Restart Netlify Dev**: Stop the server (Ctrl+C) and restart:
   ```bash
   npm run dev:netlify
   ```

2. **Check Function Location**: Verify the function exists:
   ```bash
   ls netlify/functions/
   ```
   Should show `fetchNSEData.js`

3. **Test Function Directly**: Open in browser:
   ```
   http://localhost:8888/.netlify/functions/fetchNSEData?symbol=NIFTY
   ```

4. **Check Terminal Logs**: Look for errors in the terminal where `netlify dev` is running

5. **Clear Cache**: Sometimes Netlify Dev caches functions:
   ```bash
   rm -rf .netlify
   npm run dev:netlify
   ```

## Function Returns HTML Instead of JSON

If you get HTML responses:
- Make sure you're using `npm run dev:netlify` (not `npm run dev`)
- Check the redirects in `netlify.toml` aren't intercepting function calls

