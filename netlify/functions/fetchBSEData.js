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

// Official BSE index identifiers used by the derivatives option-chain API.
const BSE_SCRIPT_CODES = {
  SENSEX: 1,
  BANKEX: 12,
};

/** Official SENSEX derivatives page used to prime BSE access after an Akamai denial. */
const BSE_SENSEX_DERIVATIVES_PAGE_URL =
  "https://www.bseindia.com/stock-share-price/future-options/derivatives/1";

/** Consistent browser identity used for SENSEX page and API requests. */
const BSE_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/154.0.0.0 Safari/537.36";

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
  const isSensexRequest = symbol.toUpperCase() === "SENSEX";
  let sensexWarmUpPromise = null;

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

  /**
   * Read a BSE response once and preserve the details needed to diagnose upstream failures.
   *
   * @param {Response} response Fetch response returned by a BSE endpoint.
   * @returns {Promise<object>} Parsed payload plus HTTP and content diagnostics.
   */
  const inspectBseResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "unknown";
    const responseText = await response.text();
    const bodySnippet = responseText.replace(/\s+/g, " ").trim().substring(0, 300);
    let data = null;
    let parseError = null;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      parseError = error.message;
    }

    // Akamai denial pages can occasionally arrive with an imprecise content type.
    const isHtml =
      contentType.toLowerCase().includes("text/html") ||
      /^\s*(?:<!doctype\s+html|<html)/i.test(responseText);

    return {
      status: response.status,
      ok: response.ok,
      contentType,
      bodySnippet,
      data,
      isJson: parseError === null,
      isHtml,
      parseError,
    };
  };

  /**
   * Build the shared headers used by SENSEX API requests.
   *
   * @returns {object} Browser-like headers with the official derivatives page as Referer.
   */
  const buildSensexApiHeaders = () => ({
    "User-Agent": BSE_BROWSER_USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en-IN;q=0.9,en;q=0.8",
    Referer: BSE_SENSEX_DERIVATIVES_PAGE_URL,
    Origin: "https://www.bseindia.com",
  });

  /**
   * Warm the official SENSEX derivatives page at most once during one function invocation.
   *
   * The response body is consumed so the request completes before the denied API call is retried.
   * Warm-up diagnostics are retained only in function logs and never exposed to the browser.
   *
   * @returns {Promise<object>} HTTP or network diagnostics for the bounded warm-up attempt.
   */
  const warmSensexDerivativesPage = async () => {
    if (!sensexWarmUpPromise) {
      sensexWarmUpPromise = (async () => {
        try {
          const response = await fetch(BSE_SENSEX_DERIVATIVES_PAGE_URL, {
            method: "GET",
            headers: {
              "User-Agent": BSE_BROWSER_USER_AGENT,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en-IN;q=0.9,en;q=0.8",
            },
          });
          const contentType = response.headers.get("content-type") || "unknown";

          await response.arrayBuffer();

          const diagnostic = {
            status: response.status,
            ok: response.ok,
            contentType,
          };
          console.log("BSE SENSEX warm-up response:", diagnostic);
          return diagnostic;
        } catch (error) {
          const diagnostic = {
            status: null,
            ok: false,
            contentType: "unknown",
            networkError: error.message,
          };
          console.warn("BSE SENSEX warm-up failed:", diagnostic);
          return diagnostic;
        }
      })();
    }

    return sensexWarmUpPromise;
  };

  /**
   * Fetch and inspect one BSE API response, with one SENSEX-only warm-up retry on denial.
   *
   * BANKEX keeps its existing request headers and direct-call behavior. SENSEX retries only an
   * HTTP 403 or HTML response, while JSON errors and all other statuses remain single attempts.
   *
   * @param {string} url Exact BSE API URL to request.
   * @param {object} existingHeaders Existing headers retained for non-SENSEX requests.
   * @param {string} operation Short operation name used in server logs.
   * @returns {Promise<object>} Parsed response diagnostics from the direct call or one retry.
   */
  const fetchBseApiWithSensexWarmUp = async (
    url,
    existingHeaders,
    operation
  ) => {
    const requestHeaders = isSensexRequest
      ? buildSensexApiHeaders()
      : existingHeaders;
    const requestApi = async () => {
      const response = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
      });
      return inspectBseResponse(response);
    };

    const initialDiagnostic = await requestApi();
    const shouldRetry =
      isSensexRequest &&
      (initialDiagnostic.status === 403 || initialDiagnostic.isHtml);

    if (!shouldRetry) {
      return initialDiagnostic;
    }

    console.warn(
      `BSE denied ${operation}; warming the official SENSEX page before one retry.`,
      {
        status: initialDiagnostic.status,
        contentType: initialDiagnostic.contentType,
      }
    );
    const warmUpDiagnostic = await warmSensexDerivativesPage();
    const retryDiagnostic = await requestApi();

    return {
      ...retryDiagnostic,
      retry: {
        attempted: true,
        initialStatus: initialDiagnostic.status,
        warmUpStatus: warmUpDiagnostic.status,
      },
    };
  };

  /**
   * Build an actionable error while keeping the upstream response body in server logs only.
   *
   * @param {string} operation Human-readable BSE operation that failed.
   * @param {object} diagnostic Captured upstream response details.
   * @returns {Error} Error marked as a Bad Gateway response.
   */
  const createBseUpstreamError = (operation, diagnostic) => {
    console.error(`BSE upstream failure while ${operation}:`, diagnostic);

    const statusLabel = diagnostic.status || "network error";
    const contentTypeLabel = diagnostic.contentType || "unknown";
    const error = new Error(
      `BSE upstream access failed while ${operation} ` +
        `(HTTP ${statusLabel}, content-type: ${contentTypeLabel}). ` +
        "The BSE API denied access or returned a non-JSON response to the serverless function. " +
        "Please retry shortly; if this persists, an approved BSE data feed is required."
    );
    error.code = "BSE_UPSTREAM_ACCESS_FAILED";
    error.statusCode = 502;
    error.upstreamDiagnostic = diagnostic;
    return error;
  };

  /**
   * Fetch the complete ordered expiry catalogue published by BSE.
   *
   * A valid JSON response with no expiries is returned as an empty catalogue so the
   * existing calculated-date fallback remains available. Access-denied, HTML, and
   * other non-JSON responses are surfaced instead of being mistaken for an empty list.
   *
   * @returns {Promise<{expiries: string[]|null, diagnostic: object}>} Expiries and response diagnostics.
   */
  const fetchAvailableExpiryDates = async () => {
    try {
      const expiryUrl = `${bseBaseUrl}/BseIndiaAPI/api/ddlExpiry_New/w?scrip_cd=${scripCd}`;
      console.log(`Fetching available expiry dates from: ${expiryUrl}`);
      
      const diagnostic = await fetchBseApiWithSensexWarmUp(
        expiryUrl,
        {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json, text/json, text/plain, */*",
          Referer: "https://www.bseindia.com/",
        },
        "expiry catalogue request"
      );
      if (!diagnostic.ok || diagnostic.isHtml || !diagnostic.isJson) {
        throw createBseUpstreamError("fetching the expiry catalogue", diagnostic);
      }

      const data = diagnostic.data;
      console.log("Available expiry dates response:", data);

      let expiryValues = [];

      if (Array.isArray(data)) {
        expiryValues = data.map((entry) =>
          typeof entry === "string" ? entry : entry?.ExpiryDate
        );
      } else if (Array.isArray(data?.Table1)) {
        expiryValues = data.Table1.map((entry) => entry?.ExpiryDate);
      } else if (data && typeof data === "object") {
        expiryValues = Object.values(data).flat().map((entry) =>
          typeof entry === "string" ? entry : entry?.ExpiryDate
        );
      }

      const normalizedExpiries = [
        ...new Set(
          expiryValues
            .filter((date) => typeof date === "string")
            .map((date) => date.trim())
            .filter(Boolean)
        ),
      ];

      return {
        expiries: normalizedExpiries.length > 0 ? normalizedExpiries : null,
        diagnostic,
      };
    } catch (error) {
      if (error.code === "BSE_UPSTREAM_ACCESS_FAILED") {
        throw error;
      }

      console.warn("Failed to fetch expiry dates from BSE API:", error.message);
      throw createBseUpstreamError("fetching the expiry catalogue", {
        status: null,
        contentType: "unknown",
        bodySnippet: "",
        networkError: error.message,
      });
    }
  };

  // Helper function to generate potential expiry dates
  // Includes the *current* Thursday (same-day expiry) and next few Thursdays
  const generateExpiryDates = () => {
    const today = new Date();
    const dates = [];

    for (let week = 0; week < 4; week++) {
      // Start from "today + week*7" and find the Thursday in that week
      const baseDate = new Date(today);
      baseDate.setDate(today.getDate() + week * 7);

      // 4 = Thursday (0 = Sunday ... 6 = Saturday)
      const dayOfWeek = baseDate.getDay();
      const daysUntilThursday = (4 - dayOfWeek + 7) % 7; // 0 means "today is Thursday"

      const thursday = new Date(baseDate);
      thursday.setDate(baseDate.getDate() + daysUntilThursday);
      dates.push(formatDate(thursday));
    }

    // De-duplicate just in case and return
    return [...new Set(dates)];
  };

  /**
   * Fetch one BSE option chain while retaining enough detail to classify a failure.
   *
   * @param {string} expiryDate Expiry date formatted as "DD MMM YYYY".
   * @returns {Promise<{result: object|null, diagnostic: object|null}>} Chain result or failure diagnostic.
   */
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

    try {
      const diagnostic = await fetchBseApiWithSensexWarmUp(
        bseUrl,
        apiHeaders,
        `option-chain request for ${expiryDate}`
      );

      if (!diagnostic.ok || diagnostic.isHtml || !diagnostic.isJson) {
        console.error(`BSE option-chain failure for ${expiryDate}:`, diagnostic);
        return {
          result: null,
          diagnostic: { ...diagnostic, kind: "upstream_access", expiryDate },
        };
      }

      const data = diagnostic.data;

      // A parsed JSON response with an empty Table is a genuine no-contract result.
      if (data?.Table && Array.isArray(data.Table) && data.Table.length > 0) {
        return {
          result: { data, expiry: expiryDate },
          diagnostic: null,
        };
      }

      return {
        result: null,
        diagnostic: { ...diagnostic, kind: "empty_data", expiryDate },
      };
    } catch (error) {
      const diagnostic = {
        kind: "upstream_access",
        expiryDate,
        status: null,
        contentType: "unknown",
        bodySnippet: "",
        networkError: error.message,
      };
      console.error(`BSE option-chain network failure for ${expiryDate}:`, diagnostic);
      return { result: null, diagnostic };
    }
  };

  try {
    // Try to fetch available expiry dates from BSE API first
    const expiryCatalogue = await fetchAvailableExpiryDates();
    let availableExpiries = expiryCatalogue.expiries;
    
    // Determine which expiry dates to try
    let expiryDatesToTry = [];
    if (availableExpiries && availableExpiries.length > 0) {
      // Use expiry dates from BSE API if available
      console.log(`Found ${availableExpiries.length} expiry dates from BSE API:`, availableExpiries);
      const requestedExpiry = typeof expiry === "string" ? expiry.trim() : null;
      if (requestedExpiry && availableExpiries.includes(requestedExpiry)) {
        // If the requested expiry is still active, try it first without duplicating it.
        expiryDatesToTry = [
          requestedExpiry,
          ...availableExpiries.filter((date) => date !== requestedExpiry),
        ];
      } else {
        // Expired or invalid selections fall back to the first active BSE expiry.
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
    const optionChainDiagnostics = [];

    // Try each expiry date until we get data
    for (const expiryDate of expiryDatesToTry) {
      const attempt = await fetchBSEWithExpiry(expiryDate);
      if (attempt.result) {
        finalData = attempt.result.data;
        finalExpiry = attempt.result.expiry;
        console.log(`Successfully fetched data with expiry: ${finalExpiry}`);
        break;
      }

      optionChainDiagnostics.push(attempt.diagnostic);
      if (attempt.diagnostic?.kind === "upstream_access") {
        // Repeating dates cannot fix a serverless-IP denial or non-JSON response.
        break;
      }
      // Small delay between retries
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // If all expiry dates failed, provide detailed error
    if (!finalData || !finalData.Table || finalData.Table.length === 0) {
      const upstreamFailure = optionChainDiagnostics.find(
        (diagnostic) => diagnostic?.kind === "upstream_access"
      );
      if (upstreamFailure) {
        throw createBseUpstreamError(
          `fetching the option chain for ${upstreamFailure.expiryDate}`,
          upstreamFailure
        );
      }

      throw new Error(
        `BSE API returned valid JSON but no option contracts for ${symbol} (scrip_cd: ${scripCd}). ` +
        `Tried ${expiryDatesToTry.length} expiry dates: ${expiryDatesToTry.join(", ")}. ` +
        `No option-chain rows were published for those dates.`
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
    const tableExpiryDates = [
      ...new Set(data.Table.map((row) => row.End_TimeStamp).filter(Boolean)),
    ].sort();

    // Prefer expiry dates returned from BSE expiry API (if available),
    // otherwise fall back to the single expiry present in the option chain Table.
    const expiryDatesForResponse =
      availableExpiries && availableExpiries.length > 0
        ? availableExpiries
        : tableExpiryDates;

    console.log(
      "Successfully fetched BSE data:",
      data.Table.length,
      "strikes, expiry dates returned to UI:",
      expiryDatesForResponse.length
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
          // This is what the transformer & UI use to build the expiry filter
          expiryDates: expiryDatesForResponse,
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
      statusCode: error.statusCode || 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch data from BSE API",
        errorCode: error.code || "BSE_DATA_UNAVAILABLE",
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
