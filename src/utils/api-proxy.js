/**
 * API Proxy Utility
 *
 * Fetches NSE Option Chain data from backend proxy
 * Always tries real data first, throws error if it fails (no auto-fallback)
 */

import { generateMockData } from "./mockData";

// Configuration - Change this based on your setup
const USE_EXPRESS_SERVER = false; // Set to true if using Express server
const USE_NETLIFY_FUNCTION = true; // Set to true if using Netlify Functions

// API endpoints
const EXPRESS_SERVER_URL = "http://localhost:3001"; // Change to your server URL
const NETLIFY_FUNCTION_PATH = "/.netlify/functions/fetchNSEData";

/**
 * Fetch NSE Option Chain data - REAL DATA ONLY
 * Throws error if fetch fails (no auto-fallback)
 *
 * @param {string} symbol - 'NIFTY' or 'BANKNIFTY' (default: 'NIFTY')
 * @returns {Promise<Object>} - Option chain data from NSE
 */
export async function fetchOptionChainData(symbol = "NIFTY") {
  // Try Netlify Function first
  if (USE_NETLIFY_FUNCTION) {
    return await fetchViaNetlifyFunction(symbol);
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
async function fetchViaNetlifyFunction(symbol) {
  const url = `/.netlify/functions/fetchNSEData?symbol=${symbol}`;

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

// Removed fetchViaProxy - using mock data for development instead
