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

  // Get parameters from query string
  const symbol = event.queryStringParameters?.symbol || "NIFTY";
  const expiry = event.queryStringParameters?.expiry || null; // Optional expiry date

  // Validate symbol
  const validSymbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
  if (!validSymbols.includes(symbol.toUpperCase())) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Invalid symbol. Use NIFTY, BANKNIFTY, FINNIFTY, or MIDCPNIFTY",
      }),
    };
  }

  const nseBaseUrl = "https://www.nseindia.com";

  // Build NSE Option Chain API endpoint with correct parameters
  // If expiry is provided, use it; otherwise we'll fetch without expiry (NSE will return nearest expiry)
  let nseUrl = `https://www.nseindia.com/api/option-chain-v3?type=Indices&symbol=${symbol.toUpperCase()}`;
  if (expiry) {
    nseUrl += `&expiry=${encodeURIComponent(expiry)}`;
  }

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

    // Step 2: If no expiry provided, we need to get it from NSE
    // Since calling without expiry returns empty {}, we need a different approach
    // For now, we'll try to get expiry dates from the API with a sample call
    let finalExpiry = expiry;
    if (!finalExpiry) {
      console.log("Step 2a: Fetching expiry dates...");
      // Try fetching with a sample expiry first, or fetch expiry list endpoint
      // NSE might have a different endpoint for expiry dates
      // For now, use the expiry endpoint pattern or default to nearest Thursday

      // Calculate next Thursday (NSE expiry is usually Thursday)
      const today = new Date();
      const daysUntilThursday = (4 - today.getDay() + 7) % 7 || 7; // Next Thursday
      const nextThursday = new Date(today);
      nextThursday.setDate(today.getDate() + daysUntilThursday);

      // Format as DD-MMM-YYYY (e.g., 13-Jan-2026)
      const formatDate = (date) => {
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const day = String(date.getDate()).padStart(2, "0");
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      };

      finalExpiry = formatDate(nextThursday);
      console.log("Using calculated expiry date:", finalExpiry);
      // Update URL with expiry
      nseUrl = `https://www.nseindia.com/api/option-chain-v3?type=Indices&symbol=${symbol.toUpperCase()}&expiry=${encodeURIComponent(
        finalExpiry
      )}`;
    }

    // Step 2b: Fetch option chain data with expiry
    console.log("Step 2b: Fetching option chain data from NSE API...");
    console.log("NSE URL:", nseUrl);
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

    // Get raw response text first to debug
    const responseText = await response.text();
    console.log(
      "NSE API Raw Response (first 1000 chars):",
      responseText.substring(0, 1000)
    );
    console.log("NSE API Response Length:", responseText.length);

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse NSE response as JSON:", parseError);
      console.error("Response text:", responseText.substring(0, 500));
      throw new Error(
        `Invalid JSON response from NSE API: ${parseError.message}`
      );
    }

    // Log full response structure for debugging
    console.log("NSE API Response Structure:", {
      hasRecords: !!data.records,
      hasRecordsData: !!data.records?.data,
      recordsDataLength: data.records?.data?.length || 0,
      expiryDates: data.records?.expiryDates?.length || 0,
      underlyingValue: data.records?.underlyingValue,
      dataKeys: Object.keys(data),
      recordsKeys: data.records ? Object.keys(data.records) : [],
      firstFewStrikes: data.records?.data?.slice(0, 2) || [],
      // Also check alternative structure for v3 API
      hasFiltered: !!data.filtered,
      hasData: !!data.data,
    });

    // Handle v3 API structure - it might be different
    // v3 API might return data directly or in a different structure
    let finalData = data;

    // Check if data structure is different for v3 API
    if (!data.records && (data.filtered || data.data)) {
      // v3 API might use different structure
      console.log("Detected v3 API structure, transforming...");
      finalData = {
        records: {
          data: data.filtered?.data || data.data || [],
          expiryDates:
            data.filtered?.CE?.expiryDates || data.records?.expiryDates || [],
          underlyingValue:
            data.filtered?.CE?.underlyingValue ||
            data.records?.underlyingValue ||
            data.underlyingValue,
        },
      };
    }

    // Extract expiry dates from strike data if not present at top level
    // In v3 API, each strike has an `expiryDates` field (string), not an array at top level
    if (finalData.records) {
      const strikes = finalData.records.data || [];

      // If expiryDates array doesn't exist, extract from strikes
      if (
        !finalData.records.expiryDates ||
        !Array.isArray(finalData.records.expiryDates) ||
        finalData.records.expiryDates.length === 0
      ) {
        const uniqueExpiryDates = [
          ...new Set(
            strikes.map((strike) => strike.expiryDates).filter(Boolean)
          ),
        ].sort();
        finalData.records.expiryDates = uniqueExpiryDates;
        console.log(
          "Extracted expiry dates from strike data:",
          uniqueExpiryDates
        );
      }

      // Also ensure we have timestamp if missing
      if (!finalData.records.timestamp && data.records?.timestamp) {
        finalData.records.timestamp = data.records.timestamp;
      }
    }

    // Ensure expiryDates is always an array
    if (finalData.records && !Array.isArray(finalData.records.expiryDates)) {
      finalData.records.expiryDates = [];
    }

    // Check if we got expiry dates but empty data - this means the expiry date was invalid
    // Retry with the first available expiry date (works for any invalid expiry, including wrong symbol)
    if (
      finalData.records &&
      finalData.records.expiryDates &&
      finalData.records.expiryDates.length > 0 &&
      (!finalData.records.data || finalData.records.data.length === 0)
    ) {
      const firstAvailableExpiry = finalData.records.expiryDates[0];
      console.log(
        `Expiry date ${finalExpiry} returned empty data for ${symbol}. Retrying with first available expiry: ${firstAvailableExpiry}`
      );

      // Retry with the first available expiry date
      const retryUrl = `https://www.nseindia.com/api/option-chain-v3?type=Indices&symbol=${symbol.toUpperCase()}&expiry=${encodeURIComponent(
        firstAvailableExpiry
      )}`;
      console.log("Retrying with URL:", retryUrl);

      const retryHeaders = {
        ...apiHeaders,
      };
      if (cookieString) {
        retryHeaders["Cookie"] = cookieString;
      }

      const retryResponse = await fetch(retryUrl, {
        method: "GET",
        headers: retryHeaders,
      });

      console.log("Retry response status:", retryResponse.status);

      if (retryResponse.ok) {
        const retryContentType = retryResponse.headers.get("content-type");
        if (retryContentType && retryContentType.includes("application/json")) {
          const retryResponseText = await retryResponse.text();
          console.log(
            "Retry response length:",
            retryResponseText.length,
            "First 500 chars:",
            retryResponseText.substring(0, 500)
          );
          try {
            const retryData = JSON.parse(retryResponseText);

            // Transform if needed
            let retryFinalData = retryData;
            if (!retryData.records && (retryData.filtered || retryData.data)) {
              retryFinalData = {
                records: {
                  data: retryData.filtered?.data || retryData.data || [],
                  expiryDates:
                    retryData.filtered?.CE?.expiryDates ||
                    retryData.records?.expiryDates ||
                    [],
                  underlyingValue:
                    retryData.filtered?.CE?.underlyingValue ||
                    retryData.records?.underlyingValue ||
                    retryData.underlyingValue,
                },
              };
            }

            // Extract expiry dates if needed
            if (retryFinalData.records) {
              const retryStrikes = retryFinalData.records.data || [];
              if (
                !retryFinalData.records.expiryDates ||
                !Array.isArray(retryFinalData.records.expiryDates) ||
                retryFinalData.records.expiryDates.length === 0
              ) {
                const uniqueExpiryDates = [
                  ...new Set(
                    retryStrikes
                      .map((strike) => strike.expiryDates)
                      .filter(Boolean)
                  ),
                ].sort();
                retryFinalData.records.expiryDates = uniqueExpiryDates;
              }
            }

            // Update finalExpiry to the one we used
            finalExpiry = firstAvailableExpiry;
            finalData = retryFinalData;

            console.log(
              "Retry successful! Fetched",
              finalData?.records?.data?.length || 0,
              "strikes with expiry:",
              finalExpiry
            );
          } catch (parseError) {
            console.error(
              "Failed to parse retry response:",
              parseError.message
            );
          }
        } else {
          console.error(
            "Retry response is not JSON. Content-Type:",
            retryContentType
          );
        }
      } else {
        const errorText = await retryResponse
          .text()
          .catch(() => "No error details");
        console.error(
          `Retry failed with status ${retryResponse.status}:`,
          errorText.substring(0, 200)
        );
      }
    }

    // Validate data structure
    if (
      !finalData.records ||
      !finalData.records.data ||
      finalData.records.data.length === 0
    ) {
      throw new Error(
        "NSE API returned empty data. This might happen if the expiry date is invalid or the market is closed."
      );
    }

    console.log(
      "Successfully fetched NSE data, strikes:",
      finalData?.records?.data?.length || 0,
      "expiry dates:",
      finalData?.records?.expiryDates?.length || 0
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
        data: finalData,
        expiry: finalExpiry,
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
