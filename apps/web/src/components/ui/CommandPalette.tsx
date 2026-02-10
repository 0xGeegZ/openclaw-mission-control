"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Plus, Box, FileText, Settings, Command } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAccount } from '@/lib/hooks/useAccount';
import styles from './CommandPalette.module.css';
import { useCommandPaletteSearch } from '@/lib/hooks/useCommandPaletteSearch';

interface CommandItem {
  id: string;
  title: string;
  category: 'action' | 'task' | 'doc' | 'agent' | 'setting';
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  onTaskCreate?: () => void;
  onNavigate?: (path: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  onTaskCreate,
  onNavigate,
}) => {
  const router = useRouter();
  const { account } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Fetch search results from Convex
  const searchResults = useCommandPaletteSearch(query);

  // Build command items with static actions + dynamic search results
  const commandItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'new-task',
        title: 'New Task',
        category: 'action',
        description: 'Create a new task',
        icon: <Plus size={16} />,
        action: () => {
          onTaskCreate?.();
          setIsOpen(false);
        },
        keywords: ['create', 'task', 'new'],
      },
      {
        id: 'settings',
        title: 'Settings',
        category: 'setting',
        description: 'Open settings',
        icon: <Settings size={16} />,
        action: () => {
          const url = account?.slug ? `/${account.slug}/settings` : '/settings';
          onNavigate?.(url);
          if (!onNavigate) router.push(url);
          setIsOpen(false);
        },
        keywords: ['preferences', 'config'],
      },
      // Add search results (only if we have account slug)
      ...(account?.slug ? searchResults.tasks.map(task => ({
        id: `task-${task.id}`,
        title: task.title,
        category: 'task' as const,
        description: `Status: ${task.status}`,
        icon: <Box size={16} />,
        action: () => {
          const url = `/${account.slug}/tasks/${task.id}`;
          onNavigate?.(url);
          if (!onNavigate) router.push(url);
          setIsOpen(false);
        },
        keywords: [task.title.toLowerCase()],
      })) : []),
      ...(account?.slug ? searchResults.documents.map(doc => ({
        id: `doc-${doc.id}`,
        title: doc.title,
        category: 'doc' as const,
        description: 'Go to document',
        icon: <FileText size={16} />,
        action: () => {
          const url = `/${account.slug}/docs/${doc.id}`;
          onNavigate?.(url);
          if (!onNavigate) router.push(url);
          setIsOpen(false);
        },
        keywords: [doc.title.toLowerCase()],
      })) : []),
      ...(account?.slug ? searchResults.agents.map(agent => ({
        id: `agent-${agent.id}`,
        title: agent.title,
        category: 'agent' as const,
        description: agent.role ? `Role: ${agent.role}` : 'Agent',
        icon: <Command size={16} />,
        action: () => {
          // Navigate to agent detail page
          const url = `/${account.slug}/agents/${agent.id}`;
          onNavigate?.(url);
          if (!onNavigate) router.push(url);
          setIsOpen(false);
        },
        keywords: [agent.title.toLowerCase()],
      })) : []),
    ];
    return items;
  }, [searchResults, onTaskCreate, onNavigate, router, account?.slug]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query) return commandItems;

    const lowerQuery = query.toLowerCase();
    return commandItems.filter(item =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery) ||
      item.keywords?.some(k => k.includes(lowerQuery))
    );
  }, [query, commandItems]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(!isOpen);
        setQuery('');
        setSelectedIndex(0);
      }

      // Only handle these if palette is open
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i =>
            i < filteredItems.length - 1 ? i + 1 : i
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => (i > 0 ? i - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            filteredItems[selectedIndex].action();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selected index when filtered items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <>
      {/* Trigger Button (optional - can be placed in navbar) */}
      <button
        onClick={() => setIsOpen(true)}
        className={styles.trigger}
        title="Command Palette (Cmd+K)"
      >
        <Search size={16} />
        <span>Command Palette</span>
        <kbd>⌘K</kbd>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modal */}
      <dialog
        open={isOpen}
        className={styles.modal}
      >
        <div className={styles.container}>
          {/* Header with Search */}
          <div className={styles.header}>
            <Search size={18} className={styles.searchIcon} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search tasks, docs, agents, or actions..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className={styles.input}
              autoComplete="off"
            />
            <span className={styles.shortcut}>⎋ esc</span>
          </div>

          {/* Results List */}
          <div className={styles.results}>
            {filteredItems.length > 0 ? (
              <ul className={styles.list}>
                {filteredItems.map((item, index) => (
                  <li
                    key={item.id}
                    className={`${styles.item} ${
                      index === selectedIndex ? styles.selected : ''
                    }`}
                    onClick={() => {
                      item.action();
                    }}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    <span className={styles.content}>
                      <span className={styles.title}>{item.title}</span>
                      {item.description && (
                        <span className={styles.description}>
                          {item.description}
                        </span>
                      )}
                    </span>
                    <span className={styles.category}>{item.category}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <p>No results found for "{query}"</p>
                <span>Try searching for tasks, docs, or agents</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <span className={styles.footerItem}>
              <kbd>↑↓</kbd> to navigate
            </span>
            <span className={styles.footerItem}>
              <kbd>⏎</kbd> to select
            </span>
            <span className={styles.footerItem}>
              <kbd>⎋</kbd> to close
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default CommandPalette;
