'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/**
 * Base card component providing consistent styling and layout.
 * 
 * Consolidates card styling patterns used across:
 * - AgentCard (agent listing)
 * - TaskCard (task board)
 * - Document cards
 * - Feed items
 * 
 * Use with composition utilities: CardHeader, CardContent, CardFooter, CardAvatar, CardBadge
 * 
 * @example
 * ```tsx
 * <BaseCard className="hover:shadow-lg">
 *   <CardHeader>
 *     <CardAvatar src={agent.avatar} alt={agent.name} />
 *     <h3 className="font-semibold">{agent.name}</h3>
 *   </CardHeader>
 *   <CardContent>
 *     <p className="text-sm text-muted-foreground">{agent.description}</p>
 *   </CardContent>
 *   <CardFooter>
 *     <CardBadge>{agent.role}</CardBadge>
 *   </CardFooter>
 * </BaseCard>
 * ```
 */
export interface BaseCardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  isDragging?: boolean;
}

export function BaseCard({
  children,
  className,
  interactive = false,
  isDragging = false,
}: BaseCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4 shadow-sm',
        'transition-all duration-200',
        interactive && 'cursor-pointer hover:shadow-md',
        isDragging && 'opacity-50 ring-2 ring-primary',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 mb-3', className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2 mb-3', className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 pt-2 border-t border-border', className)}>
      {children}
    </div>
  );
}

/**
 * Avatar component for card headers.
 * Handles image loading and fallback to initials.
 */
export interface CardAvatarProps {
  src?: string;
  alt: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardAvatar({ src, alt, initials, size = 'md', className }: CardAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  const fallbackInitials = initials || alt.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold',
        'bg-gradient-to-br from-primary/20 to-primary/10 text-primary',
        sizeClasses[size],
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            // Fallback to initials on image load error
            const element = e.target as HTMLImageElement;
            element.style.display = 'none';
            element.parentElement?.classList.add('bg-gradient-to-br', 'from-primary/20', 'to-primary/10');
          }}
        />
      ) : (
        fallbackInitials
      )}
    </div>
  );
}

/**
 * Badge component for card content (role, status, category, etc.).
 */
export interface CardBadgeProps {
  children: ReactNode;
  variant?: 'default' | 'secondary' | 'success' | 'destructive' | 'warning';
  className?: string;
}

export function CardBadge({ children, variant = 'default', className }: CardBadgeProps) {
  const variantClasses = {
    default: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/10 text-secondary-foreground',
    success: 'bg-green-500/10 text-green-700 dark:text-green-400',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  };

  return (
    <span
      className={cn(
        'px-2 py-1 rounded-md text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Metadata row for displaying structured information (date, count, state, etc.)
 */
export interface CardMetadataProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardMetadata({ label, value, icon, className }: CardMetadataProps) {
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
