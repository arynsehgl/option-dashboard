/**
 * API Proxy Utility
 *
 * Fetches Option Chain data from backend proxy (NSE or BSE)
 * Always tries real data first, throws error if it fails (no auto-fallback)
 */

import { generateMockData } from "./mockData";
import { transformBSEToNSE } from "./bseTransformer";

// Configuration - Change this based on your setup
const USE_EXPRESS_SERVER = false; // Set to true if using Express server
const USE_NETLIFY_FUNCTION = true; // Set to true if using Netlify Functions

// API endpoints
const EXPRESS_SERVER_URL = "http://localhost:3001"; // Change to your server URL
const NETLIFY_FUNCTION_PATH = "/.netlify/functions/fetchNSEData";

// Exchange mapping - determines which API to use
const EXCHANGE_MAP = {
  NIFTY: "NSE",
  BANKNIFTY: "NSE",
  FINNIFTY: "NSE",
  MIDCPNIFTY: "NSE",
  SENSEX: "BSE",
  BANKEX: "BSE",
};

/**
 * Get exchange for a symbol
 * @param {string} symbol - Symbol name
 * @returns {string} Exchange name ('NSE' or 'BSE')
 */
function getExchange(symbol) {
  return EXCHANGE_MAP[symbol.toUpperCase()] || "NSE";
}

/**
 * Fetch Option Chain data - REAL DATA ONLY
 * Throws error if fetch fails (no auto-fallback)
 * Automatically routes to NSE or BSE based on symbol
 *
 * @param {string} symbol - 'NIFTY', 'BANKNIFTY', 'SENSEX', etc. (default: 'NIFTY')
 * @param {string} expiry - Optional expiry date (NSE: '13-Jan-2026', BSE: '13 Jan 2026')
 * @returns {Promise<Object>} - Option chain data (normalized to NSE format)
 */
export async function fetchOptionChainData(symbol = "NIFTY", expiry = "") {
  const exchange = getExchange(symbol);

  // Route to appropriate exchange
  if (exchange === "BSE") {
    return await fetchBSEData(symbol, expiry);
  } else {
    return await fetchNSEData(symbol, expiry);
  }
}

/**
 * Fetch NSE data
 */
async function fetchNSEData(symbol, expiry) {
  // Try Netlify Function first
  if (USE_NETLIFY_FUNCTION) {
    return await fetchViaNetlifyFunction(symbol, expiry);
  }

  // Try Express Server
  if (USE_EXPRESS_SERVER) {
    return await fetchViaExpressServer(symbol);
  }

  // No backend configured
  throw new Error(
    "No API backend configured. Please enable Netlify Functions or Express Server."
  );
}

/**
 * Fetch BSE data
 */
async function fetchBSEData(symbol, expiry) {
  if (USE_NETLIFY_FUNCTION) {
    return await fetchBSEViaNetlifyFunction(symbol, expiry);
  }

  throw new Error("BSE data fetching is only available via Netlify Functions.");
}

/**
 * Fetch mock/test data - explicitly called by user
 * @param {string} symbol - 'NIFTY' or 'BANKNIFTY'
 * @returns {Promise<Object>} - Mock data
 */
export async function fetchMockData(symbol = "NIFTY") {
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate delay
  return generateMockData(symbol);
}

/**
 * Fetch via Express Server
 */
async function fetchViaExpressServer(symbol) {
  const url = `${EXPRESS_SERVER_URL}/api/option-chain?symbol=${symbol}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to fetch option chain data");
  }

  return result;
}

/**
 * Fetch via Netlify Function (for production)
 */
async function fetchViaNetlifyFunction(symbol, expiry = "") {
  let url = `/.netlify/functions/fetchNSEData?symbol=${symbol}`;
  if (expiry) {
    url += `&expiry=${encodeURIComponent(expiry)}`;
  }

  // Check if we're in local dev (not using netlify dev)
  const isLocalDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  try {
    const response = await fetch(url);

    // Handle 404 - function not found
    if (response.status === 404) {
      if (isLocalDev) {
        throw new Error(
          'Netlify Function not found. To test functions locally, run "npm run dev:netlify" instead of "npm run dev".'
        );
      }
      throw new Error(
        "Netlify Function not found (404). Make sure the function is deployed on Netlify."
      );
    }

    // Check content type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();

      // If we get HTML in local dev, it means netlify dev isn't running
      if (
        (isLocalDev && text.includes("<!doctype")) ||
        text.includes("<!DOCTYPE")
      ) {
        throw new Error(
          'Netlify Functions are not available. Run "npm run dev:netlify" to test functions locally, or deploy to Netlify for production.'
        );
      }

      throw new Error(
        `Unexpected response type: ${
          contentType || "unknown"
        }. The function may not be working correctly.`
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error details");
      throw new Error(
        `HTTP error! status: ${response.status}. ${errorText.substring(0, 200)}`
      );
    }

    const result = await response.json();

    // Log the result structure for debugging
    console.log("Netlify Function response:", {
      success: result.success,
      hasData: !!result.data,
      hasRecords: !!result.data?.records,
      hasRecordsData: !!result.data?.records?.data,
      recordsDataLength: result.data?.records?.data?.length || 0,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch option chain data");
    }

    // Check if data structure is valid
    if (
      !result.data ||
      !result.data.records ||
      !result.data.records.data ||
      result.data.records.data.length === 0
    ) {
      throw new Error(
        "Netlify function returned empty data. The NSE API may not be responding or the data structure changed."
      );
    }

    return result;
  } catch (error) {
    console.error("Netlify Function error:", error);
    throw error; // Re-throw to be caught by parent try-catch
  }
}

/**
 * Fetch BSE data via Netlify Function
 */
async function fetchBSEViaNetlifyFunction(symbol, expiry = "") {
  let url = `/.netlify/functions/fetchBSEData?symbol=${symbol}`;
  if (expiry) {
    // Convert NSE expiry format to BSE format if needed
    // BSE: "29 Jan 2026", NSE: "29-Jan-2026"
    let bseExpiry = expiry;
    if (expiry.includes("-")) {
      // Convert from NSE format to BSE format
      bseExpiry = expiry.replace(/-/g, " ");
    }
    url += `&expiry=${encodeURIComponent(bseExpiry)}`;
  }

  // Check if we're in local dev
  const isLocalDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  try {
    const response = await fetch(url);

    // Handle 404 - function not found
    if (response.status === 404) {
      if (isLocalDev) {
        throw new Error(
          'BSE Netlify Function not found. To test functions locally, run "npm run dev:netlify" instead of "npm run dev".'
        );
      }
      throw new Error(
        "BSE Netlify Function not found (404). Make sure the function is deployed on Netlify."
      );
    }

    // Check content type
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();

      if (
        (isLocalDev && text.includes("<!doctype")) ||
        text.includes("<!DOCTYPE")
      ) {
        throw new Error(
          'BSE Netlify Functions are not available. Run "npm run dev:netlify" to test functions locally, or deploy to Netlify for production.'
        );
      }

      throw new Error(
        `Unexpected response type: ${
          contentType || "unknown"
        }. The BSE function may not be working correctly.`
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error details");
      throw new Error(
        `HTTP error! status: ${response.status}. ${errorText.substring(0, 200)}`
      );
    }

    const result = await response.json();

    console.log("BSE Netlify Function response:", {
      success: result.success,
      source: result.source,
      hasData: !!result.data,
      hasTable: !!result.data?.Table,
      tableLength: result.data?.Table?.length || 0,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch BSE option chain data");
    }

    // Check if data structure is valid
    if (
      !result.data ||
      !result.data.Table ||
      !Array.isArray(result.data.Table) ||
      result.data.Table.length === 0
    ) {
      throw new Error(
        "BSE function returned empty data. The BSE API may not be responding or the data structure changed."
      );
    }

    // Transform BSE response to NSE format for frontend compatibility
    const transformedResult = transformBSEToNSE(result);

    return transformedResult;
  } catch (error) {
    console.error("BSE Netlify Function error:", error);
    throw error;
  }
}

// Removed fetchViaProxy - using mock data for development instead
