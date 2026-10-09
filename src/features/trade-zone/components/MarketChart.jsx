/** Draws selectable-interval market candles and feed-health context. */
import React, { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, HistogramSeries } from 'lightweight-charts'
import { Maximize2 } from 'lucide-react'
import { useTheme } from '../../../contexts/ThemeContext'

const intervals = ['1m', '5m', '15m', '1h', '1D']

/**
 * Renders a responsive candlestick and volume chart for the selected instrument.
 */
export default function MarketChart({ instrument, candles, interval, onIntervalChange, preview, feedHealth }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const fittedInstrumentRef = useRef(null)
  const { isDarkMode } = useTheme()

  useEffect(() => {
    if (!containerRef.current) return undefined
    const chart = createChart(containerRef.current, {
      height: 390,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#91a1ba' : '#5f6f86',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDarkMode ? 'rgba(145,161,186,.08)' : 'rgba(95,111,134,.10)' },
        horzLines: { color: isDarkMode ? 'rgba(145,161,186,.08)' : 'rgba(95,111,134,.10)' },
      },
      rightPriceScale: { borderColor: 'rgba(125,145,180,.16)' },
      timeScale: { borderColor: 'rgba(125,145,180,.16)', timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(129,140,248,.55)', labelBackgroundColor: '#5558d9' },
        horzLine: { color: 'rgba(129,140,248,.55)', labelBackgroundColor: '#5558d9' },
      },
    })
    chartRef.current = chart
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#19b98a',
      downColor: '#ef6175',
      borderVisible: false,
      wickUpColor: '#19b98a',
      wickDownColor: '#ef6175',
      priceScaleId: 'right',
    })
    candleSeriesRef.current = candleSeries
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeriesRef.current = volumeSeries
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) chart.applyOptions({ width })
    })
    resizeObserver.observe(containerRef.current)
    return () => {
      resizeObserver.disconnect()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      fittedInstrumentRef.current = null
      chart.remove()
    }
  }, [isDarkMode])

  useEffect(() => {
    if (!candles?.length || !candleSeriesRef.current || !volumeSeriesRef.current) return
    candleSeriesRef.current.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volumeSeriesRef.current.setData(candles.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? 'rgba(25,185,138,.28)' : 'rgba(239,97,117,.25)',
    })))
    if (fittedInstrumentRef.current !== instrument.instrumentKey) {
      chartRef.current?.timeScale().fitContent()
      fittedInstrumentRef.current = instrument.instrumentKey
    }
  }, [candles, instrument.instrumentKey, isDarkMode])

  return (
    <section className="glass-panel-strong min-w-0 overflow-hidden rounded-3xl" aria-label={`${instrument.symbol} market chart`}>
      <div className="flex flex-col gap-3 border-b border-[var(--glass-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-ink">{instrument.symbol}</h2><span className="rounded-md bg-indigo-500/10 px-2 py-1 text-[10px] font-black text-indigo-500">{instrument.exchange}</span>{preview ? <span className="rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-500">DEMO DATA</span> : feedHealth && <span className={`rounded-md px-2 py-1 text-[10px] font-black ${feedHealth.state === 'live' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{feedHealth.label.toUpperCase()}</span>}</div>
          <div className="mt-1 flex items-baseline gap-2"><span className={`text-xl font-black ${instrument.direction === 'up' ? 'text-emerald-500' : instrument.direction === 'down' ? 'text-rose-500' : 'text-ink'}`}>₹{instrument.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span><span className={`text-xs font-bold ${instrument.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{instrument.change >= 0 ? '+' : ''}{instrument.change}%</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {intervals.map((value) => <button key={value} type="button" onClick={() => onIntervalChange(value)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${interval === value ? 'bg-indigo-600 text-white' : 'text-muted hover:bg-indigo-500/10 hover:text-ink'}`}>{value}</button>)}
          <span className="mx-1 h-5 w-px bg-[var(--glass-border)]" />
          <button type="button" onClick={() => chartRef.current?.timeScale().fitContent()} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-indigo-500/10 hover:text-ink" title="Fit chart"><Maximize2 size={16} /></button>
        </div>
      </div>
      <div ref={containerRef} className="h-[390px] w-full" />
    </section>
  )
}
