import React from 'react'
import { formatLargeNumber, formatCurrency, formatPercentageChange } from '../utils/formatNumber'
import { getLotSize } from '../utils/lotSizes'

/**
 * Options Chain Table Component
 * Displays Call and Put options data side by side with Strike in the center
 */
export default function OptionsChainTable({ data, spotPrice, symbol, showLotMultiplier }) {
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

  // Get lot size for multiplier
  const lotSize = getLotSize(symbol || 'NIFTY');

  // Calculate totals for summary
  const totals = React.useMemo(() => {
    let totalCEOI = 0;
    let totalCEChangeOI = 0;
    let totalPEOI = 0;
    let totalPEChangeOI = 0;

    strikes.forEach((row) => {
      const ce = row.CE;
      const pe = row.PE;
      
      const ceOI = (ce?.openInterest || 0);
      const ceChangeOI = (ce?.changeinOpenInterest || 0);
      const peOI = (pe?.openInterest || 0);
      const peChangeOI = (pe?.changeinOpenInterest || 0);

      if (showLotMultiplier) {
        totalCEOI += ceOI * lotSize;
        totalCEChangeOI += ceChangeOI * lotSize;
        totalPEOI += peOI * lotSize;
        totalPEChangeOI += peChangeOI * lotSize;
      } else {
        totalCEOI += ceOI;
        totalCEChangeOI += ceChangeOI;
        totalPEOI += peOI;
        totalPEChangeOI += peChangeOI;
      }
    });

    return {
      totalCEOI,
      totalCEChangeOI,
      totalPEOI,
      totalPEChangeOI,
    };
  }, [strikes, showLotMultiplier, lotSize]);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
      <div className="min-w-full">
        {/* Table Header */}
        <div className="grid grid-cols-11 gap-0.5 bg-slate-700 p-1.5 text-[10px] sm:text-xs font-semibold text-slate-300 sticky top-0">
          {/* CALLS Header */}
          <div className="col-span-5 text-center">
            <div className="text-green-400 mb-0.5 text-[10px] sm:text-xs">CALLS (CE)</div>
            <div className="grid grid-cols-5 gap-0.5 text-[9px] sm:text-[10px]">
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
            <div className="text-red-400 mb-0.5 text-[10px] sm:text-xs">PUTS (PE)</div>
            <div className="grid grid-cols-5 gap-0.5 text-[9px] sm:text-[10px]">
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

            // Apply lot multiplier if enabled
            // Ensure Change OI is properly parsed (handle NaN, null, undefined)
            const ceChangeOIRaw = parseFloat(ce?.changeinOpenInterest) || 0;
            const peChangeOIRaw = parseFloat(pe?.changeinOpenInterest) || 0;
            
            const ceOIValue = showLotMultiplier 
              ? (ce?.openInterest || 0) * lotSize 
              : (ce?.openInterest || 0);
            const ceChangeOIValue = showLotMultiplier 
              ? ceChangeOIRaw * lotSize 
              : ceChangeOIRaw;
            const ceVolumeValue = showLotMultiplier 
              ? (ce?.totalTradedVolume || 0) * lotSize 
              : (ce?.totalTradedVolume || 0);

            const peOIValue = showLotMultiplier 
              ? (pe?.openInterest || 0) * lotSize 
              : (pe?.openInterest || 0);
            const peChangeOIValue = showLotMultiplier 
              ? peChangeOIRaw * lotSize 
              : peChangeOIRaw;
            const peVolumeValue = showLotMultiplier 
              ? (pe?.totalTradedVolume || 0) * lotSize 
              : (pe?.totalTradedVolume || 0);

            // Format Call data
            const ceOI = formatLargeNumber(ceOIValue);
            const ceChangeOI = ceChangeOIValue;
            const ceVolume = formatLargeNumber(ceVolumeValue);
            const ceLTP = formatCurrency(ce?.lastPrice || 0);
            const ceChange = formatPercentageChange(ce?.change || 0);

            // Format Put data
            const peOI = formatLargeNumber(peOIValue);
            const peChangeOI = peChangeOIValue;
            const peVolume = formatLargeNumber(peVolumeValue);
            const peLTP = formatCurrency(pe?.lastPrice || 0);
            const peChange = formatPercentageChange(pe?.change || 0);

            // Format Change in OI - use large number format with sign and color
            // Ensure values are numbers (handle NaN/undefined)
            const ceChangeOINum = isNaN(ceChangeOI) ? 0 : ceChangeOI;
            const peChangeOINum = isNaN(peChangeOI) ? 0 : peChangeOI;
            
            // Don't show + sign for zero values, always display the value
            const ceChangeOIFormatted = {
              formatted: ceChangeOINum === 0 
                ? '0' 
                : (ceChangeOINum > 0 ? '+' : '') + formatLargeNumber(ceChangeOINum),
              color: ceChangeOINum > 0 ? 'text-green-400' : ceChangeOINum < 0 ? 'text-red-400' : 'text-slate-400'
            };
            const peChangeOIFormatted = {
              formatted: peChangeOINum === 0 
                ? '0' 
                : (peChangeOINum > 0 ? '+' : '') + formatLargeNumber(peChangeOINum),
              color: peChangeOINum > 0 ? 'text-green-400' : peChangeOINum < 0 ? 'text-red-400' : 'text-slate-400'
            };
            
            // Debug logging for first strike (only in development)
            if (index === 0 && symbol === 'SENSEX') {
              console.log('Change OI Debug - First Strike:', {
                ceRaw: ce?.changeinOpenInterest,
                peRaw: pe?.changeinOpenInterest,
                ceParsed: ceChangeOINum,
                peParsed: peChangeOINum,
                ceFormatted: ceChangeOIFormatted.formatted,
                peFormatted: peChangeOIFormatted.formatted
              });
            }

            return (
              <div
                key={strike}
                className={`grid grid-cols-11 gap-1 p-1.5 sm:p-2 hover:bg-slate-700/50 transition-colors ${
                  isATM ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
                }`}
              >
                {/* CALLS Data */}
                <div className="col-span-5 grid grid-cols-5 gap-0.5 text-right">
                  <div className="text-green-400 px-1 text-[11px] sm:text-xs" title={ceOI}>{ceOI}</div>
                  <div className={`${ceChangeOIFormatted.color} px-1 text-[11px] sm:text-xs`} title={ceChangeOIFormatted.formatted}>
                    {ceChangeOIFormatted.formatted}
                  </div>
                  <div className="text-slate-300 px-1 text-[11px] sm:text-xs" title={ceVolume}>{ceVolume}</div>
                  <div className="text-slate-200 font-medium px-1 text-[11px] sm:text-xs" title={ceLTP}>{ceLTP}</div>
                  <div className={`${ceChange.color} px-1 text-[11px] sm:text-xs`} title={ceChange.formatted}>{ceChange.formatted}</div>
                </div>

                {/* STRIKE */}
                <div
                  className={`col-span-1 text-center font-bold px-1 ${
                    isATM ? 'text-blue-400' : 'text-white'
                  }`}
                >
                  {isATM && (
                    <div className="text-[8px] text-blue-400 mb-0.5">ATM</div>
                  )}
                  <div className="text-xs sm:text-sm">{strike}</div>
                </div>

                {/* PUTS Data */}
                <div className="col-span-5 grid grid-cols-5 gap-0.5 text-left">
                  <div className={`${peChange.color} px-1 text-[11px] sm:text-xs`} title={peChange.formatted}>{peChange.formatted}</div>
                  <div className="text-slate-200 font-medium px-1 text-[11px] sm:text-xs" title={peLTP}>{peLTP}</div>
                  <div className="text-slate-300 px-1 text-[11px] sm:text-xs" title={peVolume}>{peVolume}</div>
                  <div className={`${peChangeOIFormatted.color} px-1 text-[11px] sm:text-xs`} title={peChangeOIFormatted.formatted}>
                    {peChangeOIFormatted.formatted}
                  </div>
                  <div className="text-red-400 px-1 text-[11px] sm:text-xs" title={peOI}>{peOI}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Summary Bar */}
        <div className="sticky bottom-0 bg-slate-900 border-t-2 border-slate-600 p-1.5 mt-1">
          <div className="grid grid-cols-11 gap-0.5 text-[10px] sm:text-xs font-semibold">
            {/* CALLS Totals */}
            <div className="col-span-5 grid grid-cols-5 gap-1 text-right">
              <div className="text-green-400 px-1 text-[11px] sm:text-xs" title={formatLargeNumber(totals.totalCEOI)}>
                {formatLargeNumber(totals.totalCEOI)}
              </div>
              <div className={`${totals.totalCEChangeOI >= 0 ? 'text-green-400' : 'text-red-400'} px-1 text-[11px] sm:text-xs`} title={formatLargeNumber(Math.abs(totals.totalCEChangeOI))}>
                {formatLargeNumber(Math.abs(totals.totalCEChangeOI))}
                {totals.totalCEChangeOI >= 0 ? ' ↑' : ' ↓'}
              </div>
              <div className="text-slate-300">-</div>
              <div className="text-slate-300">-</div>
              <div className="text-slate-300">-</div>
            </div>

            {/* Label */}
            <div className="col-span-1 text-center text-slate-400 font-bold text-[10px] sm:text-xs">
              TOTALS
            </div>

            {/* PUTS Totals */}
            <div className="col-span-5 grid grid-cols-5 gap-1 text-left">
              <div className="text-slate-300">-</div>
              <div className="text-slate-300">-</div>
              <div className="text-slate-300">-</div>
              <div className={`${totals.totalPEChangeOI >= 0 ? 'text-green-400' : 'text-red-400'} px-1 text-[11px] sm:text-xs`} title={formatLargeNumber(Math.abs(totals.totalPEChangeOI))}>
                {totals.totalPEChangeOI >= 0 ? '↑ ' : '↓ '}
                {formatLargeNumber(Math.abs(totals.totalPEChangeOI))}
              </div>
              <div className="text-red-400 px-1 text-[11px] sm:text-xs" title={formatLargeNumber(totals.totalPEOI)}>
                {formatLargeNumber(totals.totalPEOI)}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 text-center mt-1">
            {showLotMultiplier ? `Values multiplied by lot size (${lotSize})` : 'Raw values'}
          </div>
        </div>
      </div>
    </div>
  )
}

