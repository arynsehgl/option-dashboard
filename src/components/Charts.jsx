import React from 'react'
import { Bar } from 'react-chartjs-2'

/**
 * Charts Component
 * Displays three charts: Open Interest vs Strike, Change in OI, and Volume Analysis
 */
export default function Charts({ data }) {
  if (!data?.data?.records?.data) return null;

  // Filter out any undefined or invalid strikes
  const strikes = (data.data.records.data || []).filter(
    (strike) => strike && strike.strikePrice != null
  );

  if (strikes.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="text-2xl font-bold mb-4 text-white">CHARTS & ANALYTICS</h2>
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 text-center">
          <p className="text-slate-400">No chart data available</p>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const strikePrices = strikes.map(s => s?.strikePrice || 0).filter(Boolean);
  const callOI = strikes.map(s => ((s?.CE?.openInterest || 0) / 100000)); // Convert to Lakhs
  const putOI = strikes.map(s => ((s?.PE?.openInterest || 0) / 100000));
  const callChangeOI = strikes.map(s => ((s?.CE?.changeinOpenInterest || 0) / 100000));
  const putChangeOI = strikes.map(s => ((s?.PE?.changeinOpenInterest || 0) / 100000));
  const callVolume = strikes.map(s => ((s?.CE?.totalTradedVolume || 0) / 100000));
  const putVolume = strikes.map(s => ((s?.PE?.totalTradedVolume || 0) / 100000));

  // Chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e2e8f0',
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#475569',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#94a3b8',
          font: {
            size: 10,
          },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
      },
      y: {
        ticks: {
          color: '#94a3b8',
          font: {
            size: 10,
          },
          callback: function(value) {
            return value + 'L';
          },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
      },
    },
  };

  // Chart 1: Open Interest vs Strike
  const oiChartData = {
    labels: strikePrices,
    datasets: [
      {
        label: 'Call OI',
        data: callOI,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
      },
      {
        label: 'Put OI',
        data: putOI,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
      },
    ],
  };

  const oiChartOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Open Interest vs Strike',
        color: '#f1f5f9',
        font: {
          size: 16,
          weight: 'bold',
        },
      },
    },
  };

  // Chart 2: Change in Open Interest
  const changeOIChartData = {
    labels: strikePrices,
    datasets: [
      {
        label: 'Call Change',
        data: callChangeOI,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
      },
      {
        label: 'Put Change',
        data: putChangeOI,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
      },
    ],
  };

  const changeOIChartOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Change in Open Interest',
        color: '#f1f5f9',
        font: {
          size: 16,
          weight: 'bold',
        },
      },
    },
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        ticks: {
          ...commonOptions.scales.y.ticks,
          callback: function(value) {
            return (value >= 0 ? '+' : '') + value.toFixed(1) + 'L';
          },
        },
      },
    },
  };

  // Chart 3: Volume Analysis
  const volumeChartData = {
    labels: strikePrices,
    datasets: [
      {
        label: 'Call Volume',
        data: callVolume,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
      },
      {
        label: 'Put Volume',
        data: putVolume,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
      },
    ],
  };

  const volumeChartOptions = {
    ...commonOptions,
    plugins: {
      ...commonOptions.plugins,
      title: {
        display: true,
        text: 'Volume Analysis',
        color: '#f1f5f9',
        font: {
          size: 16,
          weight: 'bold',
        },
      },
    },
  };

  return (
    <div className="mt-6">
      <h2 className="text-2xl font-bold mb-4 text-white">CHARTS & ANALYTICS</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Open Interest vs Strike */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="h-80">
            <Bar data={oiChartData} options={oiChartOptions} />
          </div>
        </div>

        {/* Chart 2: Change in Open Interest */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="h-80">
            <Bar data={changeOIChartData} options={changeOIChartOptions} />
          </div>
        </div>

        {/* Chart 3: Volume Analysis */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 lg:col-span-2">
          <div className="h-80">
            <Bar data={volumeChartData} options={volumeChartOptions} />
          </div>
        </div>
      </div>
    </div>
  )
}

