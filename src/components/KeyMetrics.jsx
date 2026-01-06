import React from 'react'

/**
 * Key Metrics Panel
 * Displays PCR, Max Pain, Total OI, and CE/PE Dominance
 */
export default function KeyMetrics({ data, metrics }) {
  if (!data || !metrics) return null;

  const pcr = metrics.pcr || (data.metrics?.pcr || 0);
  const maxPain = metrics.maxPain || data.metrics?.maxPain || data.data?.records?.underlyingValue || 0;
  const totalCEOI = metrics.totalCEOI || data.metrics?.totalCEOI || 0;
  const totalPEOI = metrics.totalPEOI || data.metrics?.totalPEOI || 0;
  
  // Calculate dominance percentages
  const totalOI = totalCEOI + totalPEOI;
  const ceDominance = totalOI > 0 ? ((totalCEOI / totalOI) * 100).toFixed(1) : '0.0';
  const peDominance = totalOI > 0 ? ((totalPEOI / totalOI) * 100).toFixed(1) : '0.0';

  // Format large numbers
  const formatNumber = (num) => {
    if (num >= 10000000) {
      return (num / 10000000).toFixed(2) + 'Cr';
    } else if (num >= 100000) {
      return (num / 100000).toFixed(2) + 'L';
    }
    return num.toLocaleString();
  };

  // PCR sentiment
  const pcrSentiment = pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral';
  const pcrColor = pcr > 1.2 ? 'text-green-400' : pcr < 0.8 ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h2 className="text-lg font-semibold mb-4 text-white">KEY METRICS</h2>
      
      <div className="space-y-4">
        {/* PCR */}
        <div>
          <div className="text-sm text-slate-400 mb-1">PCR (Put-Call Ratio)</div>
          <div className="text-2xl font-bold text-white">{pcr.toFixed(3)}</div>
          <div className={`text-sm ${pcrColor}`}>{pcrSentiment} sentiment</div>
        </div>

        {/* Max Pain */}
        <div>
          <div className="text-sm text-slate-400 mb-1">MAX PAIN</div>
          <div className="text-2xl font-bold text-white">₹{parseFloat(maxPain).toFixed(2)}</div>
        </div>

        {/* Total CE OI */}
        <div>
          <div className="text-sm text-slate-400 mb-1">TOTAL CE OI</div>
          <div className="text-2xl font-bold text-green-400">{formatNumber(totalCEOI)}</div>
        </div>

        {/* Total PE OI */}
        <div>
          <div className="text-sm text-slate-400 mb-1">TOTAL PE OI</div>
          <div className="text-2xl font-bold text-red-400">{formatNumber(totalPEOI)}</div>
        </div>

        {/* CE VS PE DOMINANCE */}
        <div>
          <div className="text-sm text-slate-400 mb-2">CE VS PE DOMINANCE</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-400">CE: {ceDominance}%</span>
              <span className="text-red-400">PE: {peDominance}%</span>
            </div>
            <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${ceDominance}%` }}
              />
              <div
                className="bg-red-500 h-full transition-all"
                style={{ width: `${peDominance}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

