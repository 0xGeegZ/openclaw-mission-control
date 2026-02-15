'use client';

import React, { useState } from 'react';

interface BulkAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  disabled?: boolean;
}

interface BulkActionsToolbarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClearSelection?: () => void;
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedCount,
  actions,
  onClearSelection,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const variantClasses = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">
          {selectedCount} selected
        </span>
        {onClearSelection && (
          <button
            onClick={onClearSelection}
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {actions.slice(0, 2).map(action => (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled || selectedCount === 0}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              variantClasses[action.variant || 'primary']
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {action.label}
          </button>
        ))}

        {actions.length > 2 && (
          <div className="relative">
            <button
              onClick={() => setIsOpen(!isOpen)}
              disabled={selectedCount === 0}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                variantClasses.secondary
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              More ▼
            </button>
            {isOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg">
                {actions.slice(2).map(action => (
                  <button
                    key={action.id}
                    onClick={() => {
                      action.onClick();
                      setIsOpen(false);
                    }}
                    disabled={action.disabled || selectedCount === 0}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
