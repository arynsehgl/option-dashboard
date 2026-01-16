import React from 'react'
import { Pie } from 'react-chartjs-2'
import { formatLargeNumber } from '../utils/formatNumber'

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
  const totalCEChangeOI = metrics.totalCEChangeOI || data.metrics?.totalCEChangeOI || 0;
  const totalPEChangeOI = metrics.totalPEChangeOI || data.metrics?.totalPEChangeOI || 0;
  
  // Calculate dominance percentages
  const totalOI = totalCEOI + totalPEOI;
  const ceDominance = totalOI > 0 ? ((totalCEOI / totalOI) * 100).toFixed(1) : '0.0';
  const peDominance = totalOI > 0 ? ((totalPEOI / totalOI) * 100).toFixed(1) : '0.0';
  
  // Calculate Change in OI dominance (using absolute values for pie chart)
  const absCEChangeOI = Math.abs(totalCEChangeOI);
  const absPEChangeOI = Math.abs(totalPEChangeOI);
  const totalAbsChangeOI = absCEChangeOI + absPEChangeOI;
  const ceChangeOIDominance = totalAbsChangeOI > 0 ? ((absCEChangeOI / totalAbsChangeOI) * 100).toFixed(1) : '0.0';
  const peChangeOIDominance = totalAbsChangeOI > 0 ? ((absPEChangeOI / totalAbsChangeOI) * 100).toFixed(1) : '0.0';

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
          <div className="text-2xl font-bold text-green-400">{formatLargeNumber(totalCEOI)}</div>
        </div>

        {/* Total PE OI */}
        <div>
          <div className="text-sm text-slate-400 mb-1">TOTAL PE OI</div>
          <div className="text-2xl font-bold text-red-400">{formatLargeNumber(totalPEOI)}</div>
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

        {/* CHANGE IN OI */}
        <div>
          <div className="text-sm text-slate-400 mb-2">CHANGE IN OI</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className={totalCEChangeOI >= 0 ? 'text-green-400' : 'text-red-400'}>
                CE: {totalCEChangeOI >= 0 ? '+' : ''}{formatLargeNumber(totalCEChangeOI)}
              </span>
              <span className={totalPEChangeOI >= 0 ? 'text-green-400' : 'text-red-400'}>
                PE: {totalPEChangeOI >= 0 ? '+' : ''}{formatLargeNumber(totalPEChangeOI)}
              </span>
            </div>
            
            {/* Pie Chart for Change in OI Distribution */}
            {totalAbsChangeOI > 0 && (
              <div className="flex items-center justify-center">
                <div className="w-32 h-32">
                  <Pie
                    key={`change-oi-${totalCEChangeOI}-${totalPEChangeOI}`}
                    data={{
                      labels: ['CE Change OI', 'PE Change OI'],
                      datasets: [
                        {
                          data: [absCEChangeOI, absPEChangeOI],
                          backgroundColor: [
                            'rgba(16, 185, 129, 0.8)', // Green for CE (Calls)
                            'rgba(239, 68, 68, 0.8)',  // Red for PE (Puts)
                          ],
                          borderColor: [
                            'rgba(16, 185, 129, 1)', // Green for CE (Calls)
                            'rgba(239, 68, 68, 1)',  // Red for PE (Puts)
                          ],
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      animation: {
                        duration: 0,
                      },
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          backgroundColor: 'rgba(15, 23, 42, 0.9)',
                          titleColor: '#e2e8f0',
                          bodyColor: '#e2e8f0',
                          borderColor: '#475569',
                          borderWidth: 1,
                          callbacks: {
                            label: function(context) {
                              const absValue = context.parsed;
                              const actualValue = context.label === 'CE Change OI' ? totalCEChangeOI : totalPEChangeOI;
                              const percentage = totalAbsChangeOI > 0 
                                ? ((absValue / totalAbsChangeOI) * 100).toFixed(1) 
                                : '0.0';
                              const sign = actualValue >= 0 ? '+' : '';
                              return `${context.label}: ${sign}${formatLargeNumber(actualValue)} (${percentage}%)`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
            
            {/* Fallback when no change in OI */}
            {totalAbsChangeOI === 0 && (
              <div className="text-center text-slate-500 text-xs py-4">
                No Change in OI data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

