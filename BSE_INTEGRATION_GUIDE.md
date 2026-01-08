# BSE Integration Guide for SENSEX

## ✅ What's Been Implemented

1. **BSE Serverless Function** (`netlify/functions/fetchBSEData.js`)
   - Fetches option chain data from BSE API
   - Handles expiry date formatting (BSE format: "DD MMM YYYY")
   - Returns BSE response structure

2. **BSE to NSE Transformer** (`src/utils/bseTransformer.js`)
   - Converts BSE API response to NSE-compatible format
   - Maps BSE field names to NSE field names
   - Ensures frontend works with both exchanges seamlessly

3. **Updated API Proxy** (`src/utils/api-proxy.js`)
   - Automatically routes SENSEX to BSE API
   - Routes NSE symbols to NSE API
   - Handles expiry date format conversion

4. **UI Updates**
   - Added SENSEX to symbol selector in Header
   - Added SENSEX lot size (default: 10 - needs verification)

## ⚠️ Required Information from You

### 1. SENSEX Script Code (`scrip_cd`)
The BSE API uses numeric script codes. You provided BANKEX with `scrip_cd=12`, but I need the code for SENSEX.

**Action Required:**
- Find the `scrip_cd` for SENSEX from the BSE website or API
- Update `netlify/functions/fetchBSEData.js` line 14:
  ```javascript
  const BSE_SCRIPT_CODES = {
    SENSEX: 1, // ⚠️ UPDATE THIS with actual SENSEX scrip_cd
    BANKEX: 12,
  };
  ```

### 2. Verify SENSEX Lot Size
I've set SENSEX lot size to 10, but please verify:
- Update `src/utils/lotSizes.js` if different

### 3. BSE API Headers/Cookies
Please test if the BSE API requires:
- Session cookies (like NSE)
- Specific headers
- Authentication

Currently, the function uses basic headers. If you encounter 403/401 errors, we may need to add cookie handling similar to NSE.

## 🧪 Testing Instructions

1. **Update SENSEX Script Code:**
   - Open `netlify/functions/fetchBSEData.js`
   - Update `SENSEX: 1` with the correct `scrip_cd`

2. **Test Locally:**
   ```bash
   npm run dev:netlify
   ```
   - This starts the Netlify dev server with functions support

3. **Test in Browser:**
   - Select SENSEX from the symbol selector
   - Check browser console for any errors
   - Verify data loads correctly

4. **Check Terminal Logs:**
   - Look for "BSE Function called" messages
   - Check for any API errors
   - Verify the response structure

## 📋 BSE API Response Structure

The BSE API returns:
```json
{
  "Table": [...], // Array of strikes (both CE and PE in each row)
  "ASON": { "DT_TM": "07 Jan 2026 | 19:11" },
  "tot_C_Open_Interest": "...",
  "tot_Open_Interest": "...",
  "tot_Vol_Traded": "...",
  "tot_C_Vol_Traded": "..."
}
```

Each row in `Table` contains:
- `C_*` fields = Call options (CE)
- Regular fields = Put options (PE)
- `Strike_Price` or `Strike_Price1` = Strike price
- `UlaValue` = Spot/Underlying price
- `End_TimeStamp` = Expiry date

## 🔄 Data Flow

1. User selects SENSEX → Frontend calls `fetchOptionChainData('SENSEX')`
2. API Proxy detects BSE exchange → Calls `fetchBSEData()`
3. BSE Function → Fetches from BSE API with correct `scrip_cd`
4. BSE Response → Transformed to NSE format via `transformBSEToNSE()`
5. Frontend → Receives NSE-compatible data, works seamlessly

## 🐛 Troubleshooting

**If SENSEX doesn't load:**
1. Check browser console for errors
2. Verify `scrip_cd` is correct
3. Check BSE API is accessible (CORS, authentication)
4. Verify expiry date format is correct

**If data structure is wrong:**
- Check `bseTransformer.js` field mappings
- Compare BSE response fields with transformer
- Update mappings if BSE API structure differs

## 📝 Next Steps

1. ✅ Provide SENSEX `scrip_cd`
2. ✅ Verify lot size
3. ✅ Test API access (cookies/headers if needed)
4. ✅ Test full integration
5. ✅ Deploy to Netlify

