/**
 * API Proxy Utility
 * 
 * Fetches NSE Option Chain data from backend proxy
 * Supports multiple backends: Express Server, Netlify Functions, or Mock Data
 */

import { generateMockData } from './mockData';

// Configuration - Change this based on your setup
const USE_EXPRESS_SERVER = false; // Set to true if using Express server
const USE_NETLIFY_FUNCTION = true; // Set to true if using Netlify Functions
const USE_MOCK_DATA = false; // Set to true to use mock data (for testing)

// API endpoints
const EXPRESS_SERVER_URL = 'http://localhost:3001'; // Change to your server URL
const NETLIFY_FUNCTION_PATH = '/.netlify/functions/fetchNSEData';

/**
 * Fetch NSE Option Chain data
 * 
 * @param {string} symbol - 'NIFTY' or 'BANKNIFTY' (default: 'NIFTY')
 * @returns {Promise<Object>} - Option chain data from NSE
 */
export async function fetchOptionChainData(symbol = 'NIFTY') {
  try {
    // Priority: Mock Data > Express Server > Netlify Function
    if (USE_MOCK_DATA) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return generateMockData(symbol);
    }

    if (USE_EXPRESS_SERVER) {
      try {
        return await fetchViaExpressServer(symbol);
      } catch (error) {
        console.warn('Express server failed, falling back to mock data:', error.message);
        return generateMockData(symbol);
      }
    }

    if (USE_NETLIFY_FUNCTION) {
      try {
        return await fetchViaNetlifyFunction(symbol);
      } catch (error) {
        console.warn('Netlify function failed, falling back to mock data:', error.message);
        // Fallback to mock data instead of crashing
        return generateMockData(symbol);
      }
    }

    // Fallback to mock data
    console.warn('No API backend configured, using mock data');
    return generateMockData(symbol);
  } catch (error) {
    console.error('Error fetching option chain data:', error);
    // Always return mock data as fallback instead of throwing
    console.warn('Falling back to mock data due to error');
    return generateMockData(symbol);
  }
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
    throw new Error(result.error || 'Failed to fetch option chain data');
  }
  
  return result;
}

/**
 * Fetch via Netlify Function (for production)
 */
async function fetchViaNetlifyFunction(symbol) {
  const url = `/.netlify/functions/fetchNSEData?symbol=${symbol}`;
  
  try {
    const response = await fetch(url);
    
    // Handle 404 - function not found
    if (response.status === 404) {
      throw new Error('Netlify Function not found (404). Make sure the function is deployed.');
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Unexpected response type: ${contentType}. Response: ${text.substring(0, 100)}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`HTTP error! status: ${response.status}. ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch option chain data');
    }
    
    return result;
  } catch (error) {
    console.error('Netlify Function error:', error);
    throw error; // Re-throw to be caught by parent try-catch
  }
}

// Removed fetchViaProxy - using mock data for development instead

