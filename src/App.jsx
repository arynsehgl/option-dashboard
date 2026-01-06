import React, { useState, useEffect, useMemo } from 'react'
import { fetchOptionChainData } from './utils/api-proxy'
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
  
  // Notification and refresh states
  const [notifications, setNotifications] = useState([])
  const [previousMetrics, setPreviousMetrics] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch data
  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const result = await fetchOptionChainData(symbol)
      setData(result)
      
      // Set first expiry date as default if not set
      if (result?.data?.records?.expiryDates?.length > 0 && !expiryDate) {
        setExpiryDate(result.data.records.expiryDates[0])
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data')
      console.error('Error:', err)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
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

  // Filter strikes based on range and high OI
  const filteredStrikes = useMemo(() => {
    if (!data?.data?.records?.data) return [];
    
    const strikes = data.data.records.data;
    const spotPrice = parseFloat(data.data.records.underlyingValue || 0);
    
    // Filter by strike range
    let filtered = strikes.filter((strike) => {
      const diff = Math.abs(strike.strikePrice - spotPrice);
      const maxDiff = strikeRange * 50; // Each strike is typically 50 apart
      return diff <= maxDiff;
    });
    
    // Filter by high OI if enabled
    if (showHighOI) {
      // Calculate average OI
      const avgCEOI = filtered.reduce((sum, s) => sum + (s.CE?.openInterest || 0), 0) / filtered.length;
      const avgPEOI = filtered.reduce((sum, s) => sum + (s.PE?.openInterest || 0), 0) / filtered.length;
      
      filtered = filtered.filter((strike) => {
        const ceOI = strike.CE?.openInterest || 0;
        const peOI = strike.PE?.openInterest || 0;
        return ceOI > avgCEOI * 1.5 || peOI > avgPEOI * 1.5;
      });
    }
    
    return filtered;
  }, [data, strikeRange, showHighOI]);

  // Get spot price
  const spotPrice = data?.data?.records?.underlyingValue || 0;
  const lastUpdated = data?.timestamp;

  // Get expiry dates
  const expiryDates = data?.data?.records?.expiryDates || [];

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
      <div className="container mx-auto px-4 py-6">
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
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
            <p className="text-red-300 mb-4">{error}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md text-white font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Dashboard Content */}
        {data && !loading && (
          <div className="grid grid-cols-12 gap-4">
            {/* Left Column - Filters */}
            <div className="col-span-12 lg:col-span-2">
              <Filters
                strikeRange={strikeRange}
                onStrikeRangeChange={setStrikeRange}
                expiryDate={expiryDate}
                onExpiryDateChange={setExpiryDate}
                expiryDates={expiryDates}
                showHighOI={showHighOI}
                onShowHighOIChange={setShowHighOI}
              />
            </div>

            {/* Center Column - Options Chain Table */}
            <div className="col-span-12 lg:col-span-7">
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
              />
            </div>

            {/* Right Column - Key Metrics */}
            <div className="col-span-12 lg:col-span-3">
              <KeyMetrics data={data} metrics={data.metrics} />
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
