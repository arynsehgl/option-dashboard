/**
 * Netlify Serverless Function to fetch BSE Option Chain Data
 *
 * This function acts as a proxy to bypass CORS restrictions.
 * BSE API endpoint: https://api.bseindia.com/BseIndiaAPI/api/DerivOptionChain_IV/w
 *
 * Endpoint: /.netlify/functions/fetchBSEData?symbol=SENSEX
 * Query Params:
 *   - symbol: SENSEX (default: SENSEX)
 *   - expiry: Optional expiry date (format: "DD MMM YYYY", e.g., "29 Jan 2026")
 */

// Symbol to BSE script code mapping
// TODO: Update SENSEX code once you provide it. Using 1 as placeholder.
const BSE_SCRIPT_CODES = {
  SENSEX: 1, // TODO: Update with actual SENSEX scrip_cd
  BANKEX: 12,
};

// Using CommonJS export for better Netlify Functions compatibility
exports.handler = async (event, context) => {
  // Log for debugging
  console.log("BSE Function called:", {
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
  const symbol = event.queryStringParameters?.symbol || "SENSEX";
  const expiry = event.queryStringParameters?.expiry || null;

  // Validate symbol
  const validSymbols = ["SENSEX", "BANKEX"];
  if (!validSymbols.includes(symbol.toUpperCase())) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Invalid symbol. Use SENSEX or BANKEX",
      }),
    };
  }

  // Get script code for symbol
  const scripCd = BSE_SCRIPT_CODES[symbol.toUpperCase()];
  if (!scripCd) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: `Script code not found for symbol: ${symbol}. Please update BSE_SCRIPT_CODES mapping.`,
      }),
    };
  }

  // BSE API base URL
  const bseBaseUrl = "https://api.bseindia.com";

  // Helper function to format date as "DD MMM YYYY"
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
    return `${day} ${month} ${year}`;
  };

  // Helper function to fetch available expiry dates from BSE API
  const fetchAvailableExpiryDates = async () => {
    try {
      const expiryUrl = `${bseBaseUrl}/BseIndiaAPI/api/ddlExpiry_New/w?scrip_cd=${scripCd}`;
      console.log(`Fetching available expiry dates from: ${expiryUrl}`);
      
      const response = await fetch(expiryUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json, text/json, text/plain, */*",
          Referer: "https://www.bseindia.com/",
        },
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && (contentType.includes("application/json") || contentType.includes("text/json"))) {
          const data = await response.json();
          console.log("Available expiry dates response:", data);
          
          // BSE might return expiry dates in different formats
          // Common formats: array of strings, object with dates, etc.
          if (Array.isArray(data)) {
            return data.filter(Boolean).map(date => date.trim());
          } else if (data && typeof data === 'object') {
            // Try to extract dates from object structure
            const dates = Object.values(data).flat().filter(d => d && typeof d === 'string');
            return dates.map(date => date.trim());
          }
        }
      }
    } catch (error) {
      console.warn("Failed to fetch expiry dates from BSE API:", error.message);
    }
    return null;
  };

  // Helper function to generate potential expiry dates
  const generateExpiryDates = () => {
    const today = new Date();
    const dates = [];
    
    // Calculate this Thursday and next few Thursdays
    for (let week = 0; week < 4; week++) {
      const daysUntilThursday = (4 - today.getDay() + 7) % 7 || 7;
      const thursday = new Date(today);
      thursday.setDate(today.getDate() + daysUntilThursday + (week * 7));
      dates.push(formatDate(thursday));
    }
    
    return dates;
  };

  // Helper function to fetch BSE data with a specific expiry
  const fetchBSEWithExpiry = async (expiryDate) => {
    const bseUrl = `${bseBaseUrl}/BseIndiaAPI/api/DerivOptionChain_IV/w?Expiry=${encodeURIComponent(
      expiryDate
    )}&scrip_cd=${scripCd}&strprice=0`;

    console.log(`Trying BSE API with expiry: ${expiryDate}, URL: ${bseUrl}`);

    const apiHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://www.bseindia.com/",
      Origin: "https://www.bseindia.com",
      Connection: "keep-alive",
    };

    const response = await fetch(bseUrl, {
      method: "GET",
      headers: apiHeaders,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`BSE API Error for ${expiryDate}:`, text.substring(0, 200));
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (
      contentType &&
      !contentType.includes("application/json") &&
      !contentType.includes("text/json")
    ) {
      console.error(`BSE returned non-JSON for ${expiryDate}`);
      return null;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`Failed to parse BSE response for ${expiryDate}:`, parseError);
      return null;
    }

    // Check if we got valid data
    if (data.Table && Array.isArray(data.Table) && data.Table.length > 0) {
      return { data, expiry: expiryDate };
    }

    return null;
  };

  try {
    // Try to fetch available expiry dates from BSE API first
    let availableExpiries = await fetchAvailableExpiryDates();
    
    // Determine which expiry dates to try
    let expiryDatesToTry = [];
    if (availableExpiries && availableExpiries.length > 0) {
      // Use expiry dates from BSE API if available
      console.log(`Found ${availableExpiries.length} expiry dates from BSE API:`, availableExpiries);
      if (expiry) {
        // If expiry provided, try it first, then use available dates
        expiryDatesToTry = [expiry, ...availableExpiries];
      } else {
        expiryDatesToTry = availableExpiries;
      }
    } else {
      // Fall back to calculated dates if API doesn't return them
      if (expiry) {
        expiryDatesToTry = [expiry, ...generateExpiryDates()];
      } else {
        expiryDatesToTry = generateExpiryDates();
      }
      console.log(`Using calculated expiry dates (${expiryDatesToTry.length}):`, expiryDatesToTry);
    }

    console.log(`Will try ${expiryDatesToTry.length} expiry dates:`, expiryDatesToTry);

    let finalData = null;
    let finalExpiry = null;

    // Try each expiry date until we get data
    for (const expiryDate of expiryDatesToTry) {
      const result = await fetchBSEWithExpiry(expiryDate);
      if (result) {
        finalData = result.data;
        finalExpiry = result.expiry;
        console.log(`Successfully fetched data with expiry: ${finalExpiry}`);
        break;
      }
      // Small delay between retries
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // If all expiry dates failed, provide detailed error
    if (!finalData || !finalData.Table || finalData.Table.length === 0) {
      throw new Error(
        `BSE API returned empty data for ${symbol} (scrip_cd: ${scripCd}). ` +
        `Tried ${expiryDatesToTry.length} expiry dates: ${expiryDatesToTry.join(", ")}. ` +
        `Possible causes: 1) Wrong scrip_cd (currently ${scripCd}), 2) Market is closed, 3) No option contracts available for ${symbol}. ` +
        `Please verify the correct scrip_cd for ${symbol} from BSE website.`
      );
    }

    // Use the successfully fetched data
    const data = finalData;

    // Log response structure for debugging
    const firstRow = data.Table?.[0] || null;
    console.log("BSE API Response Structure:", {
      hasTable: !!data.Table,
      tableLength: data.Table?.length || 0,
      hasASON: !!data.ASON,
      hasUlaValue: !!firstRow?.UlaValue,
      firstStrike: firstRow || null,
      symbolName: firstRow?.comapny_name || firstRow?.SCRIP_ID || "Unknown",
      spotPrice: firstRow?.UlaValue || "Unknown",
      scripCdUsed: scripCd,
      // Log Change OI fields from first strike for debugging
      firstStrikeChangeOI: {
        C_Absolute_Change_OI: firstRow?.C_Absolute_Change_OI,
        Absolute_Change_OI: firstRow?.Absolute_Change_OI,
      },
      totals: {
        tot_C_Open_Interest: data.tot_C_Open_Interest,
        tot_Open_Interest: data.tot_Open_Interest,
      },
    });
    
    // Warning if symbol name doesn't match
    const symbolName = (firstRow?.comapny_name || firstRow?.SCRIP_ID || "").trim().toUpperCase();
    const expectedSymbol = symbol.toUpperCase();
    if (symbolName && !symbolName.includes(expectedSymbol) && !symbolName.includes("SENSEX") && expectedSymbol === "SENSEX") {
      console.warn(`⚠️ WARNING: Data might be wrong! Expected ${expectedSymbol} but got symbol name: "${symbolName}". Current scrip_cd: ${scripCd} might be incorrect.`);
    }

    // Extract spot price from first strike (UlaValue)
    // If not available or for SENSEX, try fetching from Sensex API for better accuracy
    let spotPrice =
      data.Table[0]?.UlaValue ||
      parseFloat(data.Table[0]?.UlaValue?.replace(/,/g, "")) ||
      null;

    // For SENSEX, try fetching from alternative API if UlaValue is missing or seems incorrect
    if (symbol.toUpperCase() === "SENSEX") {
      try {
        console.log("Attempting to fetch SENSEX spot price from alternative API...");
        const sensexUrl = `${bseBaseUrl}/RealTimeBseIndiaAPI/api/GetSensexData/w`;
        const sensexResponse = await fetch(sensexUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json, text/json, text/plain, */*",
            Referer: "https://www.bseindia.com/",
          },
        });

        if (sensexResponse.ok) {
          const sensexData = await sensexResponse.json();
          if (Array.isArray(sensexData) && sensexData.length > 0) {
            const sensexValue = sensexData[0]?.ltp;
            if (sensexValue) {
              // Remove commas and parse (e.g., "84,655.00" -> 84655)
              const parsedPrice = parseFloat(sensexValue.replace(/,/g, ""));
              if (!isNaN(parsedPrice)) {
                spotPrice = parsedPrice;
                console.log(`Fetched SENSEX spot price from alternative API: ${spotPrice}`);
              }
            }
          }
        }
      } catch (sensexError) {
        console.warn("Failed to fetch SENSEX spot price from alternative API:", sensexError.message);
      }
    }

    // Extract timestamp
    const timestamp = data.ASON?.DT_TM || new Date().toISOString();

    // Extract expiry dates from Table (each row has End_TimeStamp)
    const expiryDates = [
      ...new Set(data.Table.map((row) => row.End_TimeStamp).filter(Boolean)),
    ].sort();

    console.log(
      "Successfully fetched BSE data:",
      data.Table.length,
      "strikes, expiry dates:",
      expiryDates.length
    );

    // Return successful response with BSE data structure
    // The frontend will transform this to NSE format
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=30",
      },
      body: JSON.stringify({
        success: true,
        symbol: symbol.toUpperCase(),
        timestamp: timestamp,
        expiry: finalExpiry,
        source: "BSE", // Mark as BSE data
        data: {
          Table: data.Table,
          ASON: data.ASON,
          UlaValue: spotPrice,
          expiryDates: expiryDates,
          totals: {
            tot_C_Open_Interest: data.tot_C_Open_Interest,
            tot_Open_Interest: data.tot_Open_Interest,
            tot_Vol_Traded: data.tot_Vol_Traded,
            tot_C_Vol_Traded: data.tot_C_Vol_Traded,
          },
        },
      }),
    };
  } catch (error) {
    // Log error for debugging
    console.error("Error fetching BSE data:", error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch data from BSE API",
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

