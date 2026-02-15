'use client';

import React, { useState } from 'react';

interface MetricsDisplayProps {
  title?: string;
  containerName?: string;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  title = 'Metrics',
  containerName,
}) => {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');

  const metrics = {
    cpu: 45,
    memory: 62,
    network: 28,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <div className="flex gap-2">
          {(['1h', '6h', '24h', '7d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {/* CPU Metric */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">CPU Usage</label>
            <span className="text-2xl font-bold text-gray-900">{metrics.cpu}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${
                metrics.cpu > 80 ? 'bg-red-500' : metrics.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${metrics.cpu}%` }}
            />
          </div>
        </div>

        {/* Memory Metric */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Memory Usage</label>
            <span className="text-2xl font-bold text-gray-900">{metrics.memory}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${
                metrics.memory > 80 ? 'bg-red-500' : metrics.memory > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${metrics.memory}%` }}
            />
          </div>
        </div>

        {/* Network Metric */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Network I/O</label>
            <span className="text-2xl font-bold text-gray-900">{metrics.network}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${metrics.network}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
