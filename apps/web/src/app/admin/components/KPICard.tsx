'use client';

import React from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: number;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  icon?: React.ReactNode;
}

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  trend,
  status = 'neutral',
  icon,
}) => {
  const statusColors = {
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
    neutral: 'bg-white border-gray-200',
  };

  const trendColors = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-gray-600',
  };

  const trendType = trend === undefined ? 'neutral' : trend > 0 ? 'positive' : 'negative';

  return (
    <div className={`rounded-lg border p-6 ${statusColors[status]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-gray-600">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {trend !== undefined && (
            <p className={`mt-2 text-sm font-medium ${trendColors[trendType]}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </p>
          )}
        </div>
        {icon && <div className="text-3xl text-gray-400">{icon}</div>}
      </div>
    </div>
  );
};
