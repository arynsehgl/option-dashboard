import React, { useState, useEffect, useMemo } from 'react'
import { fetchOptionChainData, fetchMockData } from './utils/api-proxy'
import { getLotSize, getStrikeInterval } from './utils/lotSizes'
import Header from './components/Header'
import Filters from './components/Filters'
import OptionsChainTable from './components/OptionsChainTable'
import KeyMetrics from './components/KeyMetrics'
import Charts from './components/Charts'
import Notifications from './components/Notifications'

function App() {
  // State management
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [symbol, setSymbol] = useState('NIFTY')
  
  // Filter states
  const [strikeRange, setStrikeRange] = useState(10)
  const [expiryDate, setExpiryDate] = useState('')
  const [showHighOI, setShowHighOI] = useState(false)
  const [showLotMultiplier, setShowLotMultiplier] = useState(true) // Enabled by default
  
  // Notification and refresh states
  const [notifications, setNotifications] = useState([])
  const [previousMetrics, setPreviousMetrics] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showUseTestDataOption, setShowUseTestDataOption] = useState(false)

  // Fetch data - REAL DATA ONLY
  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setIsRefreshing(true)
    }
    setError(null)
    setShowUseTestDataOption(false)

    try {
      const result = await fetchOptionChainData(symbol, expiryDate)
      
      // Log result for debugging
      console.log('Real data loaded:', {
        hasResult: !!result,
        hasData: !!result?.data,
        hasRecords: !!result?.data?.records,
        hasRecordsData: !!result?.data?.records?.data,
        recordsDataLength: result?.data?.records?.data?.length || 0,
        symbol: result?.symbol
      });
      
      // Validate result structure
      if (!result || !result.data) {
        console.error('Invalid result structure:', result);
        throw new Error('Invalid data structure received')
      }
      
      // Check if we have strike data
      const strikes = result?.data?.records?.data || [];
      if (strikes.length === 0) {
        throw new Error('No strike data available in response')
      }
      
      setData(result)
      setShowUseTestDataOption(false) // Hide test data option on success
      
      // Set first expiry date as default if not set
      if (result?.data?.records?.expiryDates?.length > 0 && !expiryDate) {
        setExpiryDate(result.data.records.expiryDates[0])
      }
    } catch (err) {
      console.error('Error loading real data:', err)
      setError(err.message || 'Failed to fetch real data from NSE')
      setShowUseTestDataOption(true) // Show option to use test data
      setData(null) // Clear any previous data
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  // Load test/mock data - explicitly called by user
  const loadTestData = async () => {
    setLoading(true)
    setError(null)
    setShowUseTestDataOption(false)

    try {
      const result = await fetchMockData(symbol)
      setData(result)
      
      // Set first expiry date as default if not set
      if (result?.data?.records?.expiryDates?.length > 0 && !expiryDate) {
        setExpiryDate(result.data.records.expiryDates[0])
      }
    } catch (err) {
      setError(err.message || 'Failed to load test data')
    } finally {
      setLoading(false)
    }
  }

  // Manual refresh handler
  const handleManualRefresh = () => {
    loadData(false) // Not silent, show loading
  }

  // Fetch data when component mounts or symbol changes
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  // Reload data when expiry date changes (but only if expiry date is set)
  useEffect(() => {
    if (expiryDate) {
      loadData(true) // Silent reload when expiry changes
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryDate])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!data) return; // Don't set interval if no data yet

    const interval = setInterval(() => {
      // Silent refresh - don't show loading spinner
      loadData(true)
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, symbol]) // Re-run when data or symbol changes

  // Filter strikes based on range and high OI - ATM centered
  const filteredStrikes = useMemo(() => {
    if (!data?.data?.records?.data) return [];
    
    // First filter out any invalid strikes
    const strikes = (data.data.records.data || []).filter(
      (strike) => strike && strike.strikePrice != null
    );
    
    if (strikes.length === 0) return [];
    
    const spotPrice = parseFloat(data.data.records.underlyingValue || 0);
    
    // Sort strikes by price to ensure proper ordering
    const sortedStrikes = [...strikes].sort((a, b) => 
      (a.strikePrice || 0) - (b.strikePrice || 0)
    );
    
    // Find ATM strike (closest to spot price)
    let atmIndex = 0;
    let minDiff = Math.abs((sortedStrikes[0]?.strikePrice || 0) - spotPrice);
    
    sortedStrikes.forEach((strike, index) => {
      if (!strike || strike.strikePrice == null) return;
      const diff = Math.abs(strike.strikePrice - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmIndex = index;
      }
    });
    
    // Calculate how many strikes to show above and below ATM
    // For N strikes total: floor((N-1)/2) above, ATM, ceil((N-1)/2) below
    const totalStrikes = strikeRange;
    const strikesAbove = Math.floor((totalStrikes - 1) / 2);
    const strikesBelow = Math.ceil((totalStrikes - 1) / 2);
    
    // Select strikes symmetrically around ATM
    // Try to get strikesAbove above and strikesBelow below ATM
    let startIndex = Math.max(0, atmIndex - strikesAbove);
    let endIndex = Math.min(sortedStrikes.length - 1, atmIndex + strikesBelow);
    
    // If we don't have enough strikes on one side, compensate from the other side
    // while keeping ATM centered as much as possible
    const currentCount = endIndex - startIndex + 1;
    if (currentCount < totalStrikes) {
      const needed = totalStrikes - currentCount;
      if (startIndex === 0 && endIndex < sortedStrikes.length - 1) {
        // Can't go higher, get more from below
        endIndex = Math.min(sortedStrikes.length - 1, endIndex + needed);
      } else if (endIndex === sortedStrikes.length - 1 && startIndex > 0) {
        // Can't go lower, get more from above
        startIndex = Math.max(0, startIndex - needed);
      } else {
        // Try to balance: get half from each side if possible
        const fromBelow = Math.min(Math.floor(needed / 2), sortedStrikes.length - 1 - endIndex);
        const fromAbove = Math.min(needed - fromBelow, startIndex);
        startIndex = Math.max(0, startIndex - fromAbove);
        endIndex = Math.min(sortedStrikes.length - 1, endIndex + fromBelow);
      }
    }
    
    // Ensure we have exactly the requested number of strikes (or as many as available)
    let filtered = sortedStrikes.slice(startIndex, endIndex + 1);
    
    if (filtered.length > totalStrikes) {
      // Re-center around ATM to get exactly totalStrikes
      const atmInFilteredIndex = filtered.findIndex(s => 
        s.strikePrice === sortedStrikes[atmIndex].strikePrice
      );
      
      if (atmInFilteredIndex !== -1) {
        const halfBefore = Math.floor((totalStrikes - 1) / 2);
        const halfAfter = Math.ceil((totalStrikes - 1) / 2);
        const newStart = Math.max(0, atmInFilteredIndex - halfBefore);
        const newEnd = Math.min(filtered.length - 1, atmInFilteredIndex + halfAfter);
        filtered = filtered.slice(newStart, newEnd + 1);
      } else {
        // Fallback: just take first totalStrikes
        filtered = filtered.slice(0, totalStrikes);
      }
    }
    
    // Filter by high OI if enabled
    if (showHighOI && filtered.length > 0) {
      // Calculate average OI
      const avgCEOI = filtered.reduce((sum, s) => sum + (s?.CE?.openInterest || 0), 0) / filtered.length;
      const avgPEOI = filtered.reduce((sum, s) => sum + (s?.PE?.openInterest || 0), 0) / filtered.length;
      
      const highOIFiltered = filtered.filter((strike) => {
        if (!strike) return false;
        const ceOI = strike.CE?.openInterest || 0;
        const peOI = strike.PE?.openInterest || 0;
        return ceOI > avgCEOI * 1.5 || peOI > avgPEOI * 1.5;
      });
      
      // If high OI filter removes too many strikes, we still need to maintain ATM-centered selection
      // So we'll apply high OI filter but ensure ATM is included
      if (highOIFiltered.length > 0) {
        const atmStrike = sortedStrikes[atmIndex];
        const hasATM = highOIFiltered.some(s => s.strikePrice === atmStrike.strikePrice);
        if (!hasATM) {
          highOIFiltered.push(atmStrike);
          // Re-sort to maintain order
          highOIFiltered.sort((a, b) => (a.strikePrice || 0) - (b.strikePrice || 0));
        }
        filtered = highOIFiltered;
      }
    }
    
    return filtered;
  }, [data, strikeRange, showHighOI, symbol]);

  // Get spot price
  const spotPrice = data?.data?.records?.underlyingValue || 0;
  const lastUpdated = data?.timestamp;

  // Get expiry dates
  const expiryDates = data?.data?.records?.expiryDates || [];

  // Calculate key metrics from filtered strikes (respects strike range, high OI filter, and lot multiplier)
  const calculatedMetrics = useMemo(() => {
    if (!filteredStrikes || filteredStrikes.length === 0) return null;

    const lotSize = getLotSize(symbol);
    
    let totalCEOI = 0;
    let totalPEOI = 0;
    let totalCEChangeOI = 0;
    let totalPEChangeOI = 0;

    filteredStrikes.forEach((strike) => {
      const ceOI = strike?.CE?.openInterest || 0;
      const peOI = strike?.PE?.openInterest || 0;
      const ceChangeOI = strike?.CE?.changeinOpenInterest || 0;
      const peChangeOI = strike?.PE?.changeinOpenInterest || 0;
      
      // Apply lot multiplier if enabled
      if (showLotMultiplier) {
        totalCEOI += ceOI * lotSize;
        totalPEOI += peOI * lotSize;
        totalCEChangeOI += ceChangeOI * lotSize;
        totalPEChangeOI += peChangeOI * lotSize;
      } else {
        totalCEOI += ceOI;
        totalPEOI += peOI;
        totalCEChangeOI += ceChangeOI;
        totalPEChangeOI += peChangeOI;
      }
    });

    const pcr = totalCEOI > 0 ? totalPEOI / totalCEOI : 0;
    const totalOI = totalCEOI + totalPEOI;
    const ceDominance = totalOI > 0 ? (totalCEOI / totalOI) * 100 : 50;
    const peDominance = totalOI > 0 ? (totalPEOI / totalOI) * 100 : 50;

    // Calculate Max Pain (simplified - based on filtered strikes)
    const spot = parseFloat(spotPrice || 0);
    let minPain = spot;
    let minPainValue = Infinity;

    filteredStrikes.forEach((strike) => {
      if (!strike?.strikePrice) return;
      const ceOI = (strike.CE?.openInterest || 0) * (showLotMultiplier ? lotSize : 1);
      const peOI = (strike.PE?.openInterest || 0) * (showLotMultiplier ? lotSize : 1);
      // Simplified max pain calculation
      const pain = Math.abs(strike.strikePrice - spot) * (ceOI + peOI);
      if (pain < minPainValue) {
        minPainValue = pain;
        minPain = strike.strikePrice;
      }
    });

    return {
      pcr,
      maxPain: minPain,
      totalCEOI,
      totalPEOI,
      totalCEChangeOI,
      totalPEChangeOI,
      ceDominance: ceDominance.toFixed(1),
      peDominance: peDominance.toFixed(1),
    };
  }, [filteredStrikes, showLotMultiplier, symbol, spotPrice]);

  // Check for key metric changes and trigger notifications
  useEffect(() => {
    if (!data?.metrics || !previousMetrics) {
      // First load - just store metrics
      setPreviousMetrics(data?.metrics)
      return
    }

    const current = data.metrics
    const previous = previousMetrics
    const newNotifications = []

    // Check PCR changes
    const pcrDiff = Math.abs((current.pcr || 0) - (previous.pcr || 0))
    if (pcrDiff > 0.1) {
      const pcrDirection = (current.pcr || 0) > (previous.pcr || 0) ? 'increased' : 'decreased'
      const pcrType = current.pcr > 1.2 ? 'warning' : current.pcr < 0.8 ? 'warning' : 'info'
      
      newNotifications.push({
        id: Date.now() + Math.random(),
        type: pcrType,
        title: 'PCR Alert',
        message: `Put-Call Ratio ${pcrDirection} significantly`,
        value: `PCR: ${previous.pcr?.toFixed(3)} → ${current.pcr?.toFixed(3)}`,
      })
    }

    // Check Max Pain changes (significant shift)
    const maxPainDiff = Math.abs((current.maxPain || 0) - (previous.maxPain || 0))
    if (maxPainDiff > 100) {
      newNotifications.push({
        id: Date.now() + Math.random() + 1,
        type: 'warning',
        title: 'Max Pain Shift',
        message: 'Significant shift in Max Pain level',
        value: `Max Pain: ₹${previous.maxPain?.toFixed(2)} → ₹${current.maxPain?.toFixed(2)}`,
      })
    }

    // Check OI dominance changes
    const ceDomChange = Math.abs((parseFloat(current.ceDominance || 0)) - (parseFloat(previous.ceDominance || 0)))
    if (ceDomChange > 5) {
      const domDirection = parseFloat(current.ceDominance || 0) > parseFloat(previous.ceDominance || 0) ? 'Calls' : 'Puts'
      newNotifications.push({
        id: Date.now() + Math.random() + 2,
        type: 'info',
        title: 'Dominance Change',
        message: `${domDirection} gaining dominance`,
        value: `CE: ${previous.ceDominance}% → ${current.ceDominance}%`,
      })
    }

    // Check extreme PCR values
    if ((current.pcr || 0) > 1.5 || (current.pcr || 0) < 0.6) {
      const pcrStatus = (current.pcr || 0) > 1.5 ? 'Very Bullish' : 'Very Bearish'
      newNotifications.push({
        id: Date.now() + Math.random() + 3,
        type: 'warning',
        title: 'Extreme PCR',
        message: `PCR indicates ${pcrStatus} sentiment`,
        value: `PCR: ${current.pcr?.toFixed(3)}`,
      })
    }

    // Add new notifications
    if (newNotifications.length > 0) {
      setNotifications((prev) => [...prev, ...newNotifications])
    }

    // Update previous metrics
    setPreviousMetrics(current)
  }, [data, previousMetrics])

  // Dismiss notification handler
  const handleDismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  // Handle strike range change with minimum validation
  const handleStrikeRangeChange = (value) => {
    const newValue = Math.max(3, parseInt(value) || 3)
    setStrikeRange(newValue)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <Header
        symbol={symbol}
        onSymbolChange={setSymbol}
        spotPrice={spotPrice}
        lastUpdated={lastUpdated}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Notifications */}
      <Notifications
        notifications={notifications}
        onDismiss={handleDismissNotification}
      />

      {/* Main Content */}
      <div className="max-w-[98vw] mx-auto px-1 sm:px-2 lg:px-3 py-4">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-slate-400">Loading option chain data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Failed to Fetch Real Data</h2>
            <p className="text-red-300 mb-4">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={loadData}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white font-medium"
              >
                Retry Real Data
              </button>
              {showUseTestDataOption && (
                <button
                  onClick={loadTestData}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-medium"
                >
                  Use Test Data Instead
                </button>
              )}
            </div>
            {showUseTestDataOption && (
              <p className="text-sm text-slate-400 mt-3">
                💡 Test data shows how the dashboard works with sample NSE option chain data
              </p>
            )}
          </div>
        )}

        {/* Dashboard Content */}
        {data && !loading && (
          <div className="grid grid-cols-12 gap-1 sm:gap-2 lg:gap-3">
            {/* Left Column - Filters */}
            <div className="col-span-12 lg:col-span-2">
              <Filters
                strikeRange={strikeRange}
                onStrikeRangeChange={handleStrikeRangeChange}
                expiryDate={expiryDate}
                onExpiryDateChange={setExpiryDate}
                expiryDates={expiryDates}
                showHighOI={showHighOI}
                onShowHighOIChange={setShowHighOI}
                showLotMultiplier={showLotMultiplier}
                onShowLotMultiplierChange={setShowLotMultiplier}
              />
            </div>

            {/* Center Column - Options Chain Table */}
            <div className="col-span-12 lg:col-span-8">
              <OptionsChainTable
                data={{
                  ...data,
                  data: {
                    ...data.data,
                    records: {
                      ...data.data.records,
                      data: filteredStrikes,
                    },
                  },
                }}
                spotPrice={spotPrice}
                symbol={symbol}
                showLotMultiplier={showLotMultiplier}
              />
            </div>

            {/* Right Column - Key Metrics */}
            <div className="col-span-12 lg:col-span-2">
              <KeyMetrics data={data} metrics={data.metrics || calculatedMetrics} />
            </div>
          </div>
        )}

        {/* Charts Section */}
        {data && !loading && (
          <Charts data={data} />
        )}
      </div>
    </div>
  )
}

export default App
