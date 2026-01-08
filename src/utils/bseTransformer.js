/**
 * BSE to NSE Data Transformer
 * 
 * Converts BSE API response format to NSE format so the frontend
 * can use the same structure for both exchanges.
 */

/**
 * Safely parse BSE numeric values
 * Handles empty strings, null, undefined, and string numbers
 * @param {string|number|null|undefined} value - Value from BSE response
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Parsed number or default value
 */
function safeParseFloat(value, defaultValue = 0) {
  // Handle null, undefined
  if (value == null || value === undefined) {
    return defaultValue;
  }
  
  // Handle empty string
  if (typeof value === 'string' && value.trim() === '') {
    return defaultValue;
  }
  
  // Remove commas from string numbers (e.g., "1,234.56")
  const cleanedValue = typeof value === 'string' ? value.replace(/,/g, '') : value;
  
  // Parse to float
  const parsed = parseFloat(cleanedValue);
  
  // Return parsed value if valid, otherwise default
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Transform BSE response to NSE-compatible format
 * @param {Object} bseResponse - BSE API response
 * @returns {Object} NSE-compatible response
 */
export function transformBSEToNSE(bseResponse) {
  if (!bseResponse?.success || !bseResponse?.data?.Table) {
    throw new Error("Invalid BSE response structure");
  }

  const bseData = bseResponse.data;
  const table = bseData.Table || [];

  // Transform each strike from BSE format to NSE format
  const transformedStrikes = table.map((bseRow) => {
    // Extract strike price (can be Strike_Price or Strike_Price1)
    const strikePrice =
      safeParseFloat(bseRow.Strike_Price?.replace(/,/g, ""), null) ||
      safeParseFloat(bseRow.Strike_Price1?.replace(/,/g, ""), null) ||
      null;

    if (!strikePrice) {
      return null; // Skip invalid strikes
    }

    // Transform Call (CE) data - BSE uses C_ prefix
    // Log first strike for debugging Change OI
    const ceChangeOI = safeParseFloat(bseRow.C_Absolute_Change_OI);
    const peChangeOI = safeParseFloat(bseRow.Absolute_Change_OI);
    
    if (table.indexOf(bseRow) === 0) {
      console.log("BSE First Strike Change OI Debug:", {
        C_Absolute_Change_OI: bseRow.C_Absolute_Change_OI,
        Absolute_Change_OI: bseRow.Absolute_Change_OI,
        parsedCEChangeOI: ceChangeOI,
        parsedPEChangeOI: peChangeOI,
        strikePrice: strikePrice
      });
    }
    
    const ce = {
      strikePrice: strikePrice,
      expiryDate: bseRow.End_TimeStamp || null,
      openInterest: safeParseFloat(bseRow.C_Open_Interest),
      changeinOpenInterest: ceChangeOI,
      totalTradedVolume: safeParseFloat(bseRow.C_Vol_Traded),
      lastPrice: safeParseFloat(bseRow.C_Last_Trd_Price),
      change: safeParseFloat(bseRow.C_NetChange),
      bidQty: safeParseFloat(bseRow.C_BIdQty),
      bidprice: safeParseFloat(bseRow.C_BidPrice),
      askPrice: safeParseFloat(bseRow.C_OfferPrice),
      askQty: safeParseFloat(bseRow.C_OfferQty),
      underlying: safeParseFloat(bseData.UlaValue),
      impliedVolatility: safeParseFloat(bseRow.C_IV, null) || null,
    };

    // Transform Put (PE) data - BSE uses regular fields (no prefix)
    const pe = {
      strikePrice: strikePrice,
      expiryDate: bseRow.End_TimeStamp || null,
      openInterest: safeParseFloat(bseRow.Open_Interest),
      changeinOpenInterest: peChangeOI,
      totalTradedVolume: safeParseFloat(bseRow.Vol_Traded),
      lastPrice: safeParseFloat(bseRow.Last_Trd_Price),
      change: safeParseFloat(bseRow.NetChange),
      bidQty: safeParseFloat(bseRow.BIdQty),
      bidprice: safeParseFloat(bseRow.BidPrice),
      askPrice: safeParseFloat(bseRow.OfferPrice),
      askQty: safeParseFloat(bseRow.OfferQty),
      underlying: safeParseFloat(bseData.UlaValue),
      impliedVolatility: safeParseFloat(bseRow.IV, null) || null,
    };

    // Return NSE-compatible strike structure
    return {
      strikePrice: strikePrice,
      expiryDate: bseRow.End_TimeStamp || null,
      CE: ce,
      PE: pe,
    };
  }).filter(Boolean); // Remove null entries

  // Extract expiry dates
  const expiryDates =
    bseData.expiryDates ||
    [
      ...new Set(
        table.map((row) => row.End_TimeStamp).filter(Boolean)
      ),
    ].sort();

  // Extract spot price
  const underlyingValue =
    parseFloat(bseData.UlaValue) ||
    (table.length > 0
      ? parseFloat(table[0].UlaValue)
      : null);

  // Format timestamp
  let timestamp = new Date().toISOString();
  if (bseData.ASON?.DT_TM) {
    try {
      // Parse BSE timestamp format: "07 Jan 2026 | 19:11 "
      const timestampStr = bseData.ASON.DT_TM.replace(/\|/g, "").trim();
      const parsed = new Date(timestampStr);
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    } catch (e) {
      console.warn("Failed to parse BSE timestamp:", e);
    }
  }

  // Return NSE-compatible structure
  return {
    success: true,
    symbol: bseResponse.symbol,
    timestamp: timestamp,
    expiry: bseResponse.expiry,
    source: "BSE",
    data: {
      records: {
        data: transformedStrikes,
        expiryDates: expiryDates,
        underlyingValue: underlyingValue,
        timestamp: timestamp,
      },
    },
  };
}

