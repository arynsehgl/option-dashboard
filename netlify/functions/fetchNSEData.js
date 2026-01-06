/**
 * Netlify Serverless Function to fetch NSE Option Chain Data
 *
 * This function acts as a proxy to bypass CORS restrictions.
 * NSE API requires specific headers (User-Agent, Referer) to work.
 *
 * Endpoint: /.netlify/functions/fetchNSEData?symbol=NIFTY
 * Query Params:
 *   - symbol: NIFTY or BANKNIFTY (default: NIFTY)
 */

// Using CommonJS export for better Netlify Functions compatibility
exports.handler = async (event, context) => {
  // Log for debugging
  console.log("Function called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryString: event.queryStringParameters,
  });

  // Handle CORS preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: "",
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Method not allowed. Use GET.",
      }),
    };
  }

  // Get symbol from query parameters (NIFTY or BANKNIFTY)
  const symbol = event.queryStringParameters?.symbol || "NIFTY";

  // Validate symbol
  const validSymbols = ["NIFTY", "BANKNIFTY", "FINNIFTY"];
  if (!validSymbols.includes(symbol.toUpperCase())) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Invalid symbol. Use NIFTY, BANKNIFTY, or FINNIFTY",
      }),
    };
  }

  // NSE Option Chain API endpoint
  const nseUrl = `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol.toUpperCase()}`;
  const nseBaseUrl = "https://www.nseindia.com";

  // Headers required by NSE API
  // These mimic a browser request to avoid blocking
  const baseHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
  };

  try {
    // Step 1: Establish session by visiting NSE homepage
    console.log("Step 1: Getting NSE session cookies...");
    const sessionResponse = await fetch(nseBaseUrl, {
      method: "GET",
      headers: {
        ...baseHeaders,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        Referer: "https://www.google.com/",
      },
    });

    // Extract cookies - Node.js fetch compatible method
    let cookieString = "";

    // Try different methods to get set-cookie header
    // Method 1: Try getAll() if available (for multiple set-cookie headers)
    let setCookieHeaders = [];
    try {
      if (typeof sessionResponse.headers.getAll === "function") {
        setCookieHeaders = sessionResponse.headers.getAll("set-cookie");
      }
    } catch (e) {
      // getAll not available, try get() instead
    }

    // Method 2: If getAll didn't work, try get()
    if (setCookieHeaders.length === 0) {
      const singleCookie = sessionResponse.headers.get("set-cookie");
      if (singleCookie) {
        setCookieHeaders = [singleCookie];
      }
    }

    // Extract cookie name=value pairs
    if (setCookieHeaders.length > 0) {
      cookieString = setCookieHeaders
        .map((cookie) => {
          // Extract name=value before first semicolon (ignore Path, Domain, etc.)
          const match = cookie.match(/^([^=]+=[^;]+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
        .join("; ");
    }

    console.log(
      "Cookies extracted:",
      cookieString ? `${cookieString.substring(0, 100)}...` : "NONE"
    );

    // Small delay to ensure session is established (NSE sometimes needs this)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 2: Fetch option chain data with cookies
    console.log("Step 2: Fetching option chain data from NSE API...");
    const apiHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://www.nseindia.com/option-chain",
      Origin: "https://www.nseindia.com",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "Cache-Control": "no-cache",
    };

    // CRITICAL: Add cookies if we have them
    if (cookieString) {
      apiHeaders["Cookie"] = cookieString;
    } else {
      console.warn("No cookies - attempting request anyway (might fail)");
    }

    const response = await fetch(nseUrl, {
      method: "GET",
      headers: apiHeaders,
    });

    console.log("NSE API Response Status:", response.status);

    // Check if request was successful
    if (!response.ok) {
      const text = await response.text();
      console.error("NSE API Error Response:", text.substring(0, 500));

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error(
          `NSE API returned HTML instead of JSON (status ${response.status}). The API may be blocking the request or cookies are invalid.`
        );
      }
      throw new Error(
        `NSE API returned status ${response.status}: ${response.statusText}`
      );
    }

    // Check content type before parsing
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("NSE returned non-JSON:", text.substring(0, 500));
      throw new Error(
        `NSE API returned ${contentType || "unknown"} instead of JSON`
      );
    }

    // Parse JSON response
    const data = await response.json();
    console.log(
      "Successfully fetched NSE data, strikes:",
      data?.records?.data?.length || 0
    );

    // Return successful response
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Allow frontend to access
        "Cache-Control": "public, max-age=30", // Cache for 30 seconds
      },
      body: JSON.stringify({
        success: true,
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString(),
        data: data,
      }),
    };
  } catch (error) {
    // Log error for debugging (in production, use a logging service)
    console.error("Error fetching NSE data:", error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch data from NSE API",
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
