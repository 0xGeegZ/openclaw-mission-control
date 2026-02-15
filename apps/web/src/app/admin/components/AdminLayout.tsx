'use client';

import React, { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {(title || subtitle) && (
        <header className="border-b border-gray-200 bg-white px-8 py-6">
          {title && <h1 className="text-3xl font-bold text-gray-900">{title}</h1>}
          {subtitle && <p className="mt-2 text-lg font-semibold text-gray-700">{subtitle}</p>}
        </header>
      )}
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
};
