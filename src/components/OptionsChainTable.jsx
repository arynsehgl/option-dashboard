import React from 'react'
import { formatLargeNumber, formatCurrency, formatPercentageChange } from '../utils/formatNumber'

/**
 * Options Chain Table Component
 * Displays Call and Put options data side by side with Strike in the center
 */
export default function OptionsChainTable({ data, spotPrice }) {
  if (!data?.data?.records?.data) return null;

  // Filter out any undefined or invalid strikes
  const strikes = (data.data.records.data || []).filter(
    (strike) => strike && strike.strikePrice != null
  );

  if (strikes.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 text-center">
        <p className="text-slate-400">No strike data available</p>
      </div>
    );
  }

  const atmStrike = parseFloat(spotPrice || data.data.records.underlyingValue || 0);

  // Find closest strike to ATM
  const findATMStrikeIndex = () => {
    if (strikes.length === 0) return 0;
    
    let closestIndex = 0;
    let minDiff = Math.abs((strikes[0]?.strikePrice || 0) - atmStrike);
    
    strikes.forEach((strike, index) => {
      if (!strike || strike.strikePrice == null) return;
      const diff = Math.abs(strike.strikePrice - atmStrike);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    return closestIndex;
  };

  const atmIndex = findATMStrikeIndex();

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
      <div className="min-w-full">
        {/* Table Header */}
        <div className="grid grid-cols-11 gap-1 bg-slate-700 p-2 text-xs font-semibold text-slate-300 sticky top-0">
          {/* CALLS Header */}
          <div className="col-span-5 text-center">
            <div className="text-green-400 mb-1">CALLS (CE)</div>
            <div className="grid grid-cols-5 gap-1 text-xs">
              <div>OI</div>
              <div>CHNG OI</div>
              <div>VOLUME</div>
              <div>LTP</div>
              <div>CHNG</div>
            </div>
          </div>
          
          {/* STRIKE Header */}
          <div className="col-span-1 text-center">STRIKE</div>
          
          {/* PUTS Header */}
          <div className="col-span-5 text-center">
            <div className="text-red-400 mb-1">PUTS (PE)</div>
            <div className="grid grid-cols-5 gap-1 text-xs">
              <div>CHNG</div>
              <div>LTP</div>
              <div>VOLUME</div>
              <div>CHNG OI</div>
              <div>OI</div>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-slate-700">
          {strikes.map((row, index) => {
            const isATM = index === atmIndex;
            const strike = row.strikePrice;
            const ce = row.CE;
            const pe = row.PE;

            // Format Call data
            const ceOI = formatLargeNumber(ce?.openInterest || 0);
            const ceChangeOI = ce?.changeinOpenInterest || 0;
            const ceVolume = formatLargeNumber(ce?.totalTradedVolume || 0);
            const ceLTP = formatCurrency(ce?.lastPrice || 0);
            const ceChange = formatPercentageChange(ce?.change || 0);

            // Format Put data
            const peOI = formatLargeNumber(pe?.openInterest || 0);
            const peChangeOI = pe?.changeinOpenInterest || 0;
            const peVolume = formatLargeNumber(pe?.totalTradedVolume || 0);
            const peLTP = formatCurrency(pe?.lastPrice || 0);
            const peChange = formatPercentageChange(pe?.change || 0);

            // Format Change in OI
            const ceChangeOIFormatted = formatPercentageChange(ceChangeOI);
            const peChangeOIFormatted = formatPercentageChange(peChangeOI);

            return (
              <div
                key={strike}
                className={`grid grid-cols-11 gap-1 p-2 text-xs hover:bg-slate-700/50 transition-colors ${
                  isATM ? 'bg-blue-900/30 border-l-4 border-blue-500' : ''
                }`}
              >
                {/* CALLS Data */}
                <div className="col-span-5 grid grid-cols-5 gap-1 text-right">
                  <div className="text-green-400">{ceOI}</div>
                  <div className={ceChangeOIFormatted.color}>
                    {ceChangeOIFormatted.formatted}
                  </div>
                  <div className="text-slate-300">{ceVolume}</div>
                  <div className="text-slate-200 font-medium">{ceLTP}</div>
                  <div className={ceChange.color}>{ceChange.formatted}</div>
                </div>

                {/* STRIKE */}
                <div
                  className={`col-span-1 text-center font-bold ${
                    isATM ? 'text-blue-400' : 'text-white'
                  }`}
                >
                  {isATM && (
                    <div className="text-[10px] text-blue-400 mb-0.5">ATM</div>
                  )}
                  <div>{strike}</div>
                </div>

                {/* PUTS Data */}
                <div className="col-span-5 grid grid-cols-5 gap-1 text-left">
                  <div className={peChange.color}>{peChange.formatted}</div>
                  <div className="text-slate-200 font-medium">{peLTP}</div>
                  <div className="text-slate-300">{peVolume}</div>
                  <div className={peChangeOIFormatted.color}>
                    {peChangeOIFormatted.formatted}
                  </div>
                  <div className="text-red-400">{peOI}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )
}

