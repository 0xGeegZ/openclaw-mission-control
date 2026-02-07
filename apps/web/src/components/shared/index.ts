/**
 * Shared Component Library
 * 
 * Consolidated, reusable components eliminating duplication across the web app.
 * All components are type-safe and follow the shadcn/ui design patterns.
 */

// Dialog components
export { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
export type { ConfirmDeleteDialogProps } from './ConfirmDeleteDialog';

// Card components
export {
  BaseCard,
  CardHeader,
  CardContent,
  CardFooter,
  CardAvatar,
  CardBadge,
  CardMetadata,
} from './BaseCard';
export type {
  BaseCardProps,
  CardAvatarProps,
  CardBadgeProps,
  CardMetadataProps,
} from './BaseCard';
