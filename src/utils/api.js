/**
 * API Utility Functions
 * 
 * Helper functions to fetch data from Netlify serverless functions
 */

const NETLIFY_FUNCTION_BASE = '/.netlify/functions';

/**
 * Fetch NSE Option Chain data
 * 
 * @param {string} symbol - 'NIFTY' or 'BANKNIFTY' (default: 'NIFTY')
 * @returns {Promise<Object>} - Option chain data from NSE
 */
export async function fetchOptionChainData(symbol = 'NIFTY') {
  try {
    const url = `${NETLIFY_FUNCTION_BASE}/fetchNSEData?symbol=${symbol}`;
    
    const response = await fetch(url);
    
    // Handle 404 - function not found
    if (response.status === 404) {
      const text = await response.text();
      throw new Error(
        `Function not found (404). The Netlify function may not be running or configured correctly. ` +
        `Make sure you're running "npm run dev:netlify" (not just "npm run dev"). ` +
        `Response: ${text.substring(0, 100)}`
      );
    }
    
    // Check content type before parsing
    const contentType = response.headers.get('content-type');
    
    if (!contentType || !contentType.includes('application/json')) {
      // We got HTML instead of JSON
      const text = await response.text();
      
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<!DOCTYPE')) {
        throw new Error(
          `Received HTML instead of JSON (status ${response.status}). ` +
          `The Netlify function may not be found or the redirect rule is intercepting it. ` +
          `Make sure you're running "npm run dev:netlify".`
        );
      }
      
      throw new Error(`Unexpected response type: ${contentType || 'null'}. Expected JSON. Status: ${response.status}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`HTTP error! status: ${response.status}. ${errorText.substring(0, 200)}`);
    }
    
    const result = await response.json();
    
    // Check if the API call was successful
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch option chain data');
    }
    
    return result;
    
  } catch (error) {
    console.error('Error fetching option chain data:', error);
    
    // Re-throw with more context if it's a parsing error
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      throw new Error(
        'Received invalid JSON response. The Netlify function may not be running correctly. ' +
        'Please run "npm run dev:netlify" and check the terminal for errors.'
      );
    }
    
    throw error;
  }
}

