/**
 * Mock NSE Option Chain Data
 * This allows us to build the UI while working on real data fetching
 */

/**
 * Generate mock option chain data
 * @param {string} symbol - 'NIFTY' or 'BANKNIFTY'
 * @returns {Object} Mock data matching NSE API structure
 */
export function generateMockData(symbol = 'NIFTY') {
  const baseStrike = symbol === 'NIFTY' ? 23750 : 47500;
  const strikes = [];
  
  // Generate strikes around base price
  for (let i = -15; i <= 15; i++) {
    const strike = baseStrike + (i * 50);
    const isATM = i === 0;
    
    // Mock Call data
    const callOI = Math.floor(Math.random() * 500000) + 100000;
    const callChangeOI = Math.floor(Math.random() * 100000) - 50000;
    const callVolume = Math.floor(Math.random() * 200000) + 50000;
    const callLTP = isATM ? 100 + Math.random() * 50 : Math.max(1, 200 - Math.abs(i) * 10 + Math.random() * 20);
    const callChange = (Math.random() - 0.5) * 10;
    
    // Mock Put data
    const putOI = Math.floor(Math.random() * 500000) + 100000;
    const putChangeOI = Math.floor(Math.random() * 100000) - 50000;
    const putVolume = Math.floor(Math.random() * 200000) + 50000;
    const putLTP = isATM ? 250 + Math.random() * 50 : Math.max(1, 300 - Math.abs(i) * 10 + Math.random() * 20);
    const putChange = (Math.random() - 0.5) * 10;
    
    strikes.push({
      strikePrice: strike,
      expiryDate: '09-Jan-2026',
      CE: {
        strikePrice: strike,
        expiryDate: '09-Jan-2026',
        underlying: symbol,
        identifier: `${symbol}${new Date().getFullYear()}09JAN${strike}CE`,
        openInterest: callOI,
        changeinOpenInterest: callChangeOI,
        pchangeinOpenInterest: ((callChangeOI / callOI) * 100).toFixed(2),
        totalTradedVolume: callVolume,
        impliedVolatility: (15 + Math.random() * 5).toFixed(2),
        lastPrice: callLTP.toFixed(2),
        change: callChange.toFixed(2),
        pChange: ((callChange / callLTP) * 100).toFixed(2),
        bidQty: Math.floor(Math.random() * 1000),
        bidprice: (callLTP * 0.99).toFixed(2),
        askQty: Math.floor(Math.random() * 1000),
        askPrice: (callLTP * 1.01).toFixed(2),
      },
      PE: {
        strikePrice: strike,
        expiryDate: '09-Jan-2026',
        underlying: symbol,
        identifier: `${symbol}${new Date().getFullYear()}09JAN${strike}PE`,
        openInterest: putOI,
        changeinOpenInterest: putChangeOI,
        pchangeinOpenInterest: ((putChangeOI / putOI) * 100).toFixed(2),
        totalTradedVolume: putVolume,
        impliedVolatility: (15 + Math.random() * 5).toFixed(2),
        lastPrice: putLTP.toFixed(2),
        change: putChange.toFixed(2),
        pChange: ((putChange / putLTP) * 100).toFixed(2),
        bidQty: Math.floor(Math.random() * 1000),
        bidprice: (putLTP * 0.99).toFixed(2),
        askQty: Math.floor(Math.random() * 1000),
        askPrice: (putLTP * 1.01).toFixed(2),
      },
    });
  }
  
  // Calculate totals
  const totalCEOI = strikes.reduce((sum, s) => sum + s.CE.openInterest, 0);
  const totalPEOI = strikes.reduce((sum, s) => sum + s.PE.openInterest, 0);
  const pcr = (totalPEOI / totalCEOI).toFixed(3);
  
  return {
    success: true,
    symbol: symbol.toUpperCase(),
    timestamp: new Date().toISOString(),
    data: {
      records: {
        expiryDates: ['09-Jan-2026', '16-Jan-2026', '23-Jan-2026', '30-Jan-2026'],
        data: strikes,
        underlyingValue: baseStrike + (Math.random() - 0.5) * 100,
        strikePrices: strikes.map(s => s.strikePrice),
      },
      filtered: {
        data: strikes,
      },
    },
    // Add calculated metrics
    metrics: {
      pcr: parseFloat(pcr),
      maxPain: baseStrike,
      totalCEOI: totalCEOI,
      totalPEOI: totalPEOI,
      ceDominance: ((totalCEOI / (totalCEOI + totalPEOI)) * 100).toFixed(1),
      peDominance: ((totalPEOI / (totalCEOI + totalPEOI)) * 100).toFixed(1),
    },
  };
}

