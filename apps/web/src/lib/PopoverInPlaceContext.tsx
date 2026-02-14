"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * When true, popovers should render in-place (disablePortal) so they stay
 * inside the Sheet/Dialog DOM tree and remain scrollable under RemoveScroll.
 */
const PopoverInPlaceContext = createContext(false);

/** Returns whether the current subtree is inside a sheet/dialog (use disablePortal on popovers so they scroll). */
export function usePopoverInPlace(): boolean {
  return useContext(PopoverInPlaceContext);
}

/**
 * Marks the subtree as "inside a sheet/dialog" so child popovers can
 * disable portalling and scroll correctly.
 */
export function PopoverInPlaceProvider({ children }: { children: ReactNode }) {
  return (
    <PopoverInPlaceContext.Provider value={true}>
      {children}
    </PopoverInPlaceContext.Provider>
  );
}
