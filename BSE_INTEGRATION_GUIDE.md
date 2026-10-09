# BSE SENSEX Integration Guide

## Current Implementation

- `netlify/functions/fetchBSEData.js` proxies the official BSE SENSEX endpoints with `scrip_cd=1`.
- `src/utils/api-proxy.js` routes SENSEX requests to the BSE function and NSE symbols to the NSE function.
- `src/utils/bseTransformer.js` converts BSE rows into the NSE-compatible structure consumed by the dashboard.
- `src/pages/Dashboard.jsx` clears the previous symbol's expiry, ignores stale in-flight responses, and adopts the backend's canonical active expiry.

## Expiry Catalogue

The BSE catalogue is read from `Table1[].ExpiryDate`. Values are trimmed and deduplicated while preserving BSE order. The function returns the complete catalogue to the dashboard even though it fetches only one option chain per request.

When the requested expiry is no longer active, the function uses the first active BSE expiry. A valid requested expiry is tried first without duplication.

## Upstream Access Recovery

BSE may return an Akamai HTTP 403 or an HTML denial page to a serverless request. For SENSEX only, the function:

1. Uses one consistent full browser identity and the official SENSEX derivatives page as the Referer.
2. Warms the official derivatives page at most once per function invocation after a 403 or HTML response.
3. Retries the exact denied API request once.
4. Returns HTTP 502 with `BSE_UPSTREAM_ACCESS_FAILED` if access is still denied.

The retry is deliberately bounded. It does not use a residential proxy, headless-browser bypass, persistent cookie store, or guessed expiry dates after an access denial.

## Response Shape

The successful function response includes:

```json
{
  "success": true,
  "symbol": "SENSEX",
  "expiry": "08 Oct 2026",
  "source": "BSE",
  "data": {
    "Table": [],
    "ASON": {},
    "UlaValue": 0,
    "expiryDates": [],
    "totals": {}
  }
}
```

`Table` contains call fields prefixed with `C_`, put fields without that prefix, the strike price, underlying value, and expiry timestamp. The transformer maps these fields into the common dashboard model.

## Local Validation

```bash
npm run dev:netlify
```

Then test:

```text
http://localhost:8888/.netlify/functions/fetchBSEData?symbol=SENSEX
http://localhost:8888/.netlify/functions/fetchBSEData?symbol=SENSEX&expiry=15%20Oct%202026
```

Validate direct success, a stale requested expiry, an active expiry, the final catalogue expiry, 403/HTML recovery, persistent-denial 502 behavior, and a NIFTY regression request.

## Troubleshooting

- `BSE_UPSTREAM_ACCESS_FAILED`: BSE denied the serverless source even after the bounded warm-up retry.
- Valid JSON with no contracts: confirm the expiry still has published option rows.
- Correct backend data but incorrect dashboard fields: inspect `src/utils/bseTransformer.js` mappings.
- Previous symbol or expiry appears after switching: verify the Dashboard request-generation guard remains intact.
