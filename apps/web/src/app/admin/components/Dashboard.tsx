'use client';

import React from 'react';

interface DashboardProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const Dashboard: React.FC<DashboardProps> = ({
  title = 'Admin Dashboard',
  subtitle,
  children,
}) => {
  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      {(title || subtitle) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-lg font-semibold text-gray-700">{subtitle}</p>}
        </div>
      )}
      {/* Content */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </div>
  );
};
