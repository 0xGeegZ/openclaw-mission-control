import type { Appearance } from "@clerk/types";

/**
 * Soft Pop design system theme for Clerk components.
 * Uses purple/indigo primary, teal secondary, orange accent.
 * Typography: Geist
 */
export const softPopClerkTheme: Appearance = {
  variables: {
    // Colors matching Soft Pop palette - purple primary
    colorPrimary: "hsl(262, 83%, 58%)", // Purple/indigo primary
    colorTextOnPrimaryBackground: "hsl(0, 0%, 100%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInputBackground: "hsl(0, 0%, 100%)",
    colorInputText: "hsl(0, 0%, 0%)",
    colorText: "hsl(0, 0%, 0%)",
    colorTextSecondary: "hsl(0, 0%, 32%)",
    colorDanger: "hsl(15, 75%, 50%)",
    colorSuccess: "hsl(150, 60%, 45%)",
    colorWarning: "hsl(38, 90%, 58%)",
    
    // Borders - black per design system
    colorNeutral: "hsl(0, 0%, 0%)",
    
    // Spacing and radius
    borderRadius: "0.625rem",
    spacingUnit: "1rem",
    
    // Typography - Geist
    fontFamily: "var(--font-sans), 'Geist', ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-sans), 'Geist', ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.9375rem",
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  elements: {
    // Root container
    rootBox: "mx-auto w-full",
    card: "shadow-lg border border-border rounded-xl bg-card",
    
    // Header
    headerTitle: "text-2xl font-bold tracking-tight text-foreground",
    headerSubtitle: "text-muted-foreground",
    
    // Social buttons
    socialButtonsBlockButton: 
      "border border-border/60 rounded-xl hover:bg-muted/50 transition-all duration-200 shadow-sm hover:shadow",
    socialButtonsBlockButtonText: "font-medium text-foreground",
    socialButtonsProviderIcon: "w-5 h-5",
    
    // Divider
    dividerLine: "bg-border/60",
    dividerText: "text-muted-foreground text-sm",
    
    // Form fields
    formFieldLabel: "text-sm font-medium text-foreground mb-1.5",
    formFieldInput: 
      "rounded-xl border-border/60 bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 h-11",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    
    // Primary button
    formButtonPrimary: 
      "bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 font-semibold shadow-md hover:shadow-lg transition-all duration-200",
    
    // Links
    footerActionLink: "text-primary hover:text-primary/80 font-medium transition-colors",
    
    // Alternative methods
    alternativeMethodsBlockButton: 
      "border border-border/60 rounded-xl hover:bg-muted/50 transition-all duration-200",
    
    // Alerts
    alert: "rounded-xl border",
    alertText: "text-sm",
    
    // Identity preview
    identityPreviewEditButton: "text-primary hover:text-primary/80",
    
    // Form field action
    formFieldAction: "text-primary hover:text-primary/80 text-sm font-medium",
    
    // OTP input
    otpCodeFieldInput: "rounded-lg border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20",
    
    // User button
    userButtonBox: "rounded-xl",
    userButtonTrigger: "rounded-xl focus:ring-2 focus:ring-primary/20",
    userButtonPopoverCard: "rounded-2xl shadow-lg border border-border/50",
    userButtonPopoverActionButton: "rounded-lg hover:bg-muted/50",
    userButtonPopoverActionButtonText: "font-medium",
    userButtonPopoverFooter: "border-t border-border/50",
    
    // User profile
    profileSectionTitle: "text-lg font-semibold text-foreground",
    profileSectionContent: "text-muted-foreground",
    profileSectionPrimaryButton: 
      "bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium shadow-sm",
    
    // Navigation
    navbarButton: "rounded-lg hover:bg-muted/50 transition-colors",
    navbarButtonIcon: "text-muted-foreground",
    
    // Badges
    badge: "rounded-full text-xs font-medium px-2.5 py-0.5",
    
    // Modal
    modalBackdrop: "bg-foreground/50 backdrop-blur-sm",
    modalContent: "rounded-2xl shadow-2xl border border-border/50",
    
    // Select
    selectButton: "rounded-xl border-border/60 hover:border-border transition-colors",
    selectOptionsContainer: "rounded-xl border border-border/50 shadow-lg",
    selectOption: "rounded-lg hover:bg-muted/50",
    
    // Spinner
    spinner: "text-primary",
    
    // Avatar
    avatarBox: "rounded-xl",
    avatarImage: "rounded-xl",
    
    // Phone input
    phoneInputBox: "rounded-xl border-border/60",
    
    // Scrollbox
    scrollBox: "rounded-xl",
    
    // Tag input
    tagInputContainer: "rounded-xl border-border/60",
    tagPillContainer: "rounded-lg bg-muted/50",
  },
  layout: {
    socialButtonsPlacement: "top",
    socialButtonsVariant: "blockButton",
    termsPageUrl: "/terms",
    privacyPageUrl: "/privacy",
    helpPageUrl: "/help",
    logoPlacement: "inside",
    shimmer: true,
    animations: true,
  },
};

/**
 * Dark mode variant of the Soft Pop Clerk theme.
 */
export const softPopClerkThemeDark: Appearance = {
  ...softPopClerkTheme,
  variables: {
    ...softPopClerkTheme.variables,
    colorPrimary: "hsl(262, 75%, 65%)", // Lighter purple in dark mode
    colorBackground: "hsl(240, 10%, 10%)",
    colorInputBackground: "hsl(240, 10%, 12%)",
    colorInputText: "hsl(0, 0%, 100%)",
    colorText: "hsl(0, 0%, 100%)",
    colorTextSecondary: "hsl(0, 0%, 65%)",
    colorNeutral: "hsl(240, 8%, 25%)",
  },
};
