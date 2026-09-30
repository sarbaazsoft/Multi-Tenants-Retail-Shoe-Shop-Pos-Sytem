import { useEffect, useRef, useCallback } from 'react';

export interface UseScrollActiveTabOptions {
  /**
   * Distance in pixels from the left/right edge of the container to keep as padding.
   * Default: 20
   */
  padding?: number;
  /**
   * Distance in pixels for the physical scrollable end space after the final tab.
   * Ensures the last tab is 100% revealable and never stuck against the right edge.
   * Default: 36
   */
  endPadding?: number;
  /**
   * Scroll behavior: 'smooth' for animated scrolling, 'auto' for instant.
   * Default: 'smooth'
   */
  behavior?: ScrollBehavior;
  /**
   * Optional custom CSS selector to find the active tab element inside the container.
   */
  activeSelector?: string;
  /**
   * Optional callback fired when tab scrolling finishes and visibility is verified.
   */
  onScrollComplete?: (activeKey: string | number | undefined, isLast: boolean) => void;
}

/**
 * Helper to query all genuine interactive tab elements inside the container,
 * filtering out any decorative spacers, badges, or hidden elements.
 */
function getTabElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([aria-hidden="true"]), a:not([aria-hidden="true"]), [role="tab"]:not([aria-hidden="true"]), .tab-underline-link:not([aria-hidden="true"]), [data-tab]:not([aria-hidden="true"])'
    )
  );

  // Return unique elements with measurable width and valid visibility
  return Array.from(new Set(elements)).filter((el) => {
    if (el.hasAttribute('aria-hidden') || el.classList.contains('tab-end-spacer')) {
      return false;
    }
    return el.offsetWidth > 0 || el.getClientRects().length > 0;
  });
}

/**
 * Custom React hook ensuring that the currently selected/active tab inside a
 * horizontally scrollable container is ALWAYS 100% visible and completely readable,
 * handling every possible tab position:
 * - First tab: fully visible at the start without clipping on the left.
 * - Middle tabs: scroll only as much as necessary, preserving neighboring tabs without jumping unnecessarily.
 * - Second-last tab: keeps the last tab previewed/visible whenever space permits.
 * - LAST tab: scrolls all the way necessary so the final tab is completely revealed with comfortable end spacing.
 *
 * Guarantees:
 * - Only the tab navigation container scrolls; the entire page/window is NEVER scrolled.
 * - Smoothly synchronizes with Framer Motion active underline animations.
 * - Automatically provides/guarantees end spacer behavior so the last tab is never clipped even by 1%.
 * - Handles desktop, mobile, and responsive resizing.
 */
export function useScrollActiveTab<T extends HTMLElement = HTMLDivElement>(
  activeTabKey: string | number | undefined,
  options: UseScrollActiveTabOptions = {}
) {
  const containerRef = useRef<T>(null);
  const prevActiveTabKeyRef = useRef<string | number | undefined>(undefined);

  const {
    padding = 20,
    endPadding = 36,
    behavior = 'smooth',
    activeSelector,
    onScrollComplete,
  } = options;

  /**
   * Ensures the container has adequate end spacing so that the last tab can be
   * scrolled into full view with comfortable right-side clearance.
   */
  const ensureContainerEndSpacer = useCallback(
    (container: HTMLElement) => {
      // Set container scroll padding CSS so native scroll interactions also respect edge margins
      container.style.scrollPaddingLeft = `${padding}px`;
      container.style.scrollPaddingRight = `${endPadding}px`;
      container.style.overscrollBehaviorX = 'contain';

      // Check if a physical end spacer element already exists
      let endSpacer = container.querySelector<HTMLElement>('.tab-end-spacer');
      if (!endSpacer) {
        endSpacer = document.createElement('div');
        endSpacer.className = 'tab-end-spacer shrink-0 pointer-events-none self-stretch';
        endSpacer.style.width = `${endPadding}px`;
        endSpacer.style.minWidth = `${endPadding}px`;
        endSpacer.style.height = '1px';
        endSpacer.style.flexShrink = '0';
        endSpacer.setAttribute('aria-hidden', 'true');
        endSpacer.setAttribute('role', 'presentation');
        container.appendChild(endSpacer);
      } else {
        // Ensure spacer has at least the required endPadding
        endSpacer.style.minWidth = `${endPadding}px`;
      }
    },
    [padding, endPadding]
  );

  const scrollToActiveTab = useCallback(
    (customBehavior: ScrollBehavior = behavior) => {
      const container = containerRef.current;
      if (!container) return;

      ensureContainerEndSpacer(container);

      // If container has no horizontal scrollable overflow, no scrolling needed
      if (container.scrollWidth <= container.clientWidth) {
        return;
      }

      const allTabs = getTabElements(container);

      // Priority 1: User-specified custom active selector
      let activeElement: HTMLElement | null = activeSelector
        ? container.querySelector(activeSelector)
        : null;

      // Priority 2: Standard HTML5 data-active="true" attribute
      if (!activeElement) {
        activeElement = container.querySelector('[data-active="true"]:not([aria-hidden="true"])');
      }

      // Priority 3: WAI-ARIA aria-selected="true" attribute
      if (!activeElement) {
        activeElement = container.querySelector('[aria-selected="true"]:not([aria-hidden="true"])');
      }

      // Priority 4: Tab button matching activeTabKey by data-tab, id, or name
      if (!activeElement && activeTabKey !== undefined && activeTabKey !== '') {
        const keyStr = String(activeTabKey).toLowerCase();
        activeElement =
          allTabs.find((el) => {
            const dataTab = el.getAttribute('data-tab')?.toLowerCase();
            const id = el.id.toLowerCase();
            const name = el.getAttribute('name')?.toLowerCase();
            return dataTab === keyStr || id.includes(keyStr) || name === keyStr;
          }) || null;
      }

      // Priority 5: CSS class .tab-underline-link.active or .active
      if (!activeElement) {
        activeElement = container.querySelector(
          '.tab-underline-link.active:not([aria-hidden="true"]), .active:not([aria-hidden="true"])'
        ) as HTMLElement | null;
      }

      if (!activeElement) return;

      const containerWidth = container.clientWidth;
      const scrollWidth = container.scrollWidth;
      const maxScroll = Math.max(0, scrollWidth - containerWidth);

      if (maxScroll <= 0) return;

      const activeIndex = allTabs.indexOf(activeElement);
      const totalTabs = allTabs.length;
      const isFirstTab = activeIndex === 0;
      const isLastTab = activeIndex === totalTabs - 1 && totalTabs > 1;
      const hasTabAfter = activeIndex >= 0 && activeIndex < totalTabs - 1;

      const containerRect = container.getBoundingClientRect();
      const tabRect = activeElement.getBoundingClientRect();

      const tabLeftInViewport = tabRect.left - containerRect.left;
      const tabRightInViewport = containerRect.right - tabRect.right;

      const tabOffsetLeft = activeElement.offsetLeft;
      const tabWidth = activeElement.offsetWidth;
      const tabOffsetRight = tabOffsetLeft + tabWidth;

      let targetScrollLeft: number;

      if (isFirstTab) {
        // =========================================================================
        // 1. FIRST TAB:
        // Always scroll all the way to 0. Guarantees 100% visibility at the start
        // with start padding intact and zero clipping on the left.
        // =========================================================================
        targetScrollLeft = 0;
      } else if (isLastTab) {
        // =========================================================================
        // 2. LAST TAB (Most critical edge case):
        // Automatically scroll all the way to maxScroll so the final tab is
        // 100% revealed with comfortable right-side spacing after it.
        // Never allow the last tab to be stuck against the right edge.
        // =========================================================================
        targetScrollLeft = maxScroll;
      } else {
        // =========================================================================
        // 3. MIDDLE / SECOND-LAST TABS (When another tab exists after selected tab):
        // - The active tab must remain 100% visible and completely readable.
        // - Do NOT automatically move it unnecessarily to the far edge.
        // - Keep neighboring tabs (previous and next) visible whenever space permits.
        // - Do not jump unnecessarily if already comfortably visible.
        // =========================================================================
        const isComfortablyVisible =
          tabLeftInViewport >= padding && tabRightInViewport >= padding;

        const nextTab = hasTabAfter ? allTabs[activeIndex + 1] : null;
        let nextTabHasPeek = true;
        if (nextTab) {
          const nextTabRect = nextTab.getBoundingClientRect();
          // At least 28px of the next tab is visible inside the container viewport
          nextTabHasPeek = containerRect.right - nextTabRect.left >= 28;
        }

        // If tab is already comfortably visible and next tab is also previewed, do not jump unnecessarily
        if (isComfortablyVisible && nextTabHasPeek) {
          onScrollComplete?.(activeTabKey, isLastTab);
          return;
        }

        // Calculate balanced scroll position centering the active tab
        // so surrounding tabs (left and right) are preserved in the viewport
        const idealCenterScroll = tabOffsetLeft - (containerWidth - tabWidth) / 2;

        // Ensure active tab itself is strictly within [padding, containerWidth - padding]
        let desiredScroll = idealCenterScroll;

        // If tab is wider than viewport or close to it, prioritize active tab readability
        if (tabWidth + 2 * padding >= containerWidth) {
          desiredScroll = tabOffsetLeft - padding;
        } else {
          // Clamp so active tab is never within `padding` of either viewport edge
          const minScrollToClearLeft = tabOffsetLeft - padding;
          const maxScrollToClearRight = tabOffsetRight + padding - containerWidth;

          if (desiredScroll > minScrollToClearLeft) {
            desiredScroll = minScrollToClearLeft;
          }
          if (desiredScroll < maxScrollToClearRight) {
            desiredScroll = maxScrollToClearRight;
          }
        }

        targetScrollLeft = Math.max(0, Math.min(maxScroll, Math.round(desiredScroll)));
      }

      // Avoid redundant scroll calls if already at the target
      if (Math.abs(container.scrollLeft - targetScrollLeft) > 1) {
        // Only scroll the tab container horizontally; NEVER scroll the entire page/window
        container.scrollTo({
          left: targetScrollLeft,
          behavior: customBehavior,
        });
      }

      onScrollComplete?.(activeTabKey, isLastTab);
    },
    [activeTabKey, padding, endPadding, behavior, activeSelector, ensureContainerEndSpacer, onScrollComplete]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureContainerEndSpacer(container);

    const prevKey = prevActiveTabKeyRef.current;
    const isInitialMount = prevKey === undefined;
    prevActiveTabKeyRef.current = activeTabKey;

    // Use instant scroll on initial mount to avoid layout flash, smooth when switching tabs
    const scrollMode: ScrollBehavior = isInitialMount ? 'auto' : behavior;

    // 1. Immediate requestAnimationFrame right after React DOM commit & paint
    const rafId = requestAnimationFrame(() => {
      scrollToActiveTab(scrollMode);
    });

    // 2. Synchronize with Framer Motion active underline spring animation (~50ms)
    const timer1 = setTimeout(() => {
      scrollToActiveTab(scrollMode);
    }, 50);

    // 3. Middle transition check (~160ms) as spring reaches destination
    const timer2 = setTimeout(() => {
      scrollToActiveTab(scrollMode);
    }, 160);

    // 4. Post-animation settlement check (~320ms) to verify 100% visibility
    const timer3 = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const allTabs = getTabElements(el);
      const activeEl =
        el.querySelector<HTMLElement>('[data-active="true"]:not([aria-hidden="true"])') ||
        el.querySelector<HTMLElement>('.tab-underline-link.active:not([aria-hidden="true"])');

      if (activeEl) {
        const cRect = el.getBoundingClientRect();
        const tRect = activeEl.getBoundingClientRect();
        const isLast = allTabs.indexOf(activeEl) === allTabs.length - 1;

        // If active tab is clipped by even 1 pixel, micro-correct immediately
        if (tRect.left < cRect.left + 2 || tRect.right > cRect.right - 2) {
          if (isLast) {
            el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: 'auto' });
          } else if (allTabs.indexOf(activeEl) === 0) {
            el.scrollTo({ left: 0, behavior: 'auto' });
          } else {
            scrollToActiveTab('auto');
          }
        }
      }
    }, 320);

    // 5. Responsive ResizeObserver for viewport adjustments or orientation changes
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scrollToActiveTab('auto');
      });
      resizeObserver.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [activeTabKey, scrollToActiveTab, behavior, ensureContainerEndSpacer]);

  return { containerRef, scrollToActiveTab };
}
