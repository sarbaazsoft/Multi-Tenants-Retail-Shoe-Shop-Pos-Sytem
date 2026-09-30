import React, { useEffect, useRef, useState, useMemo } from 'react';

export interface UseCountUpOptions {
  value: number | string | null | undefined;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  startFromZero?: boolean;
  animateOnChange?: boolean;
  loading?: boolean;
  refreshKey?: any;
}

export interface UseCountUpResult {
  displayValue: string;
  numericValue: number;
  isAnimating: boolean;
  ref: React.RefObject<any>;
}

/**
 * Parses numeric part from mixed input (e.g., "$1,250", "850", 120000).
 * All monetary and metric figures are cleanly rounded to whole integers (no .00 decimals).
 * Returns NaN if input has no valid digits.
 */
export function extractNumericValue(val: number | string | null | undefined): {
  numeric: number;
  detectedDecimals: number;
  isValid: boolean;
} {
  if (val === null || val === undefined || val === '') {
    return { numeric: NaN, detectedDecimals: 0, isValid: false };
  }
  if (typeof val === 'number') {
    if (isNaN(val)) return { numeric: NaN, detectedDecimals: 0, isValid: false };
    return { numeric: Math.round(val), detectedDecimals: 0, isValid: true };
  }

  // Remove commas, currency symbols, and extra spaces
  const cleanStr = String(val).replace(/,/g, '').trim();
  const match = cleanStr.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (!match) {
    return { numeric: NaN, detectedDecimals: 0, isValid: false };
  }
  const parsed = parseFloat(match[0]);
  if (isNaN(parsed)) {
    return { numeric: NaN, detectedDecimals: 0, isValid: false };
  }
  return { numeric: Math.round(parsed), detectedDecimals: 0, isValid: true };
}

/**
 * Formats a number with thousands separators and zero decimals (removing .00 completely).
 */
export function formatFormattedNumber(num: number, _decimals: number = 0): string {
  if (isNaN(num) || !isFinite(num)) return '0';
  const rounded = Math.round(num);
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Custom hook to animate numbers smoothly with synchronized timing,
 * viewport intersection triggering, value delta transitions, and reduced motion safety.
 */

// Shared global clock synchronization across active counters
let sharedSyncStartTime: number | null = null;
let sharedSyncRequestTimestamp: number = 0;

function getSynchronizedStartTime(): number {
  const now = performance.now();
  // Within a 50ms window (e.g. all cards re-rendering on data fetch completion), synchronize to exact same start timestamp
  if (sharedSyncStartTime !== null && now - sharedSyncRequestTimestamp < 50) {
    return sharedSyncStartTime;
  }
  sharedSyncStartTime = now;
  sharedSyncRequestTimestamp = now;
  return now;
}

export function useCountUp(options: UseCountUpOptions | number | string): UseCountUpResult {
  const normalizedOptions: UseCountUpOptions = useMemo(() => {
    if (typeof options === 'number' || typeof options === 'string' || options === null || options === undefined) {
      return { value: options };
    }
    return options;
  }, [
    typeof options === 'object' && options !== null
      ? JSON.stringify({
          value: options.value,
          duration: options.duration,
          decimals: options.decimals,
          prefix: options.prefix,
          suffix: options.suffix,
          startFromZero: options.startFromZero,
          animateOnChange: options.animateOnChange,
          loading: options.loading,
          refreshKey: options.refreshKey,
        })
      : options,
  ]);

  const {
    value,
    duration = 1200,
    decimals,
    prefix = '',
    suffix = '',
    startFromZero = true,
    animateOnChange = true,
    loading = false,
    refreshKey,
  } = normalizedOptions;

  const [currentNum, setCurrentNum] = useState<number>(0);
  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (loading || value === null || value === undefined) return '...';
    const { numeric, isValid } = extractNumericValue(value);
    if (!isValid || isNaN(numeric)) return '...';
    return `${prefix}0${suffix}`;
  });
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [hasEnteredView, setHasEnteredView] = useState<boolean>(false);
  const [recountCounter, setRecountCounter] = useState<number>(0);

  const elementRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInViewRef = useRef<boolean>(false);
  const currentNumRef = useRef<number>(0);
  const prevTargetRef = useRef<number | null>(null);
  const prevLoadingRef = useRef<boolean>(loading);

  const { numeric: targetValue, detectedDecimals, isValid } = extractNumericValue(value);
  const finalDecimals = 0;

  // Global recount listener
  useEffect(() => {
    const handleGlobalRecount = () => {
      setRecountCounter((prev) => prev + 1);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('app:refresh-stats', handleGlobalRecount);
      return () => {
        window.removeEventListener('app:refresh-stats', handleGlobalRecount);
      };
    }
  }, []);

  // Detect loading finish
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      setRecountCounter((prev) => prev + 1);
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  // Viewport intersection observer (starts counting only when visible)
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      isInViewRef.current = true;
      setHasEnteredView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          isInViewRef.current = true;
          setHasEnteredView(true);
        } else {
          isInViewRef.current = false;
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -10px 0px' }
    );

    const el = elementRef.current;
    if (el) {
      observer.observe(el);
    } else {
      // If no ref is attached to DOM, assume visible immediately
      isInViewRef.current = true;
      setHasEnteredView(true);
    }

    return () => {
      if (el) observer.unobserve(el);
    };
  }, []);

  // Main animation engine
  useEffect(() => {
    if (loading) {
      setDisplayValue('...');
      setIsAnimating(false);
      return;
    }

    if (!isValid || isNaN(targetValue)) {
      setDisplayValue(value !== null && value !== undefined ? `${prefix}${value}${suffix}` : '...');
      setIsAnimating(false);
      return;
    }

    // Accessibility: Reduced Motion Check
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      currentNumRef.current = targetValue;
      setCurrentNum(targetValue);
      setDisplayValue(`${prefix}${formatFormattedNumber(targetValue, finalDecimals)}${suffix}`);
      setIsAnimating(false);
      return;
    }

    // Wait until element enters view
    if (!hasEnteredView && !isInViewRef.current) {
      currentNumRef.current = 0;
      setCurrentNum(0);
      setDisplayValue(`${prefix}${formatFormattedNumber(0, finalDecimals)}${suffix}`);
      return;
    }

    // Cancel active animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Determine starting value for this animation cycle
    let startVal = 0;
    const isFirstRun = prevTargetRef.current === null;

    if (isFirstRun) {
      startVal = startFromZero ? 0 : targetValue;
    } else if (animateOnChange && !recountCounter) {
      // Smooth continuous transition from wherever the counter is currently positioned
      startVal = currentNumRef.current;
    } else {
      startVal = 0;
    }

    prevTargetRef.current = targetValue;

    // If start equals target, set immediately
    if (startVal === targetValue) {
      currentNumRef.current = targetValue;
      setCurrentNum(targetValue);
      setDisplayValue(`${prefix}${formatFormattedNumber(targetValue, finalDecimals)}${suffix}`);
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    const startTime = getSynchronizedStartTime();

    // Smooth cubic ease-out that maintains visible movement right until t = 1.0
    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const updateFrame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / Math.max(duration, 100), 1);
      const easedProgress = easeOutCubic(progress);

      let val: number;
      if (progress >= 1) {
        val = targetValue;
      } else {
        const delta = targetValue - startVal;
        if (delta === 0) {
          val = targetValue;
        } else if (finalDecimals === 0) {
          // Integer counter: NEVER reach targetValue while progress < 1.
          // This guarantees that cards with smaller numbers (e.g. 18 or 120)
          // do NOT settle ahead of time while cards with larger numbers (e.g. 1,222,018)
          // are still running. Both reach targetValue on the exact same frame!
          if (delta > 0) {
            const raw = startVal + delta * easedProgress;
            const currentInt = Math.floor(raw);
            val = Math.min(currentInt, targetValue - 1);
          } else {
            const raw = startVal + delta * easedProgress;
            const currentInt = Math.ceil(raw);
            val = Math.max(currentInt, targetValue + 1);
          }
        } else {
          // Decimal counter: clamp so it never rounds to targetValue ahead of time
          const stepFactor = Math.pow(10, finalDecimals);
          const raw = startVal + delta * easedProgress;
          if (delta > 0) {
            const stepped = Math.floor(raw * stepFactor) / stepFactor;
            val = Math.min(stepped, targetValue - 1 / stepFactor);
          } else {
            const stepped = Math.ceil(raw * stepFactor) / stepFactor;
            val = Math.max(stepped, targetValue + 1 / stepFactor);
          }
        }
      }

      currentNumRef.current = val;
      setCurrentNum(val);
      setDisplayValue(`${prefix}${formatFormattedNumber(val, finalDecimals)}${suffix}`);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(updateFrame);
      } else {
        currentNumRef.current = targetValue;
        setCurrentNum(targetValue);
        setDisplayValue(`${prefix}${formatFormattedNumber(targetValue, finalDecimals)}${suffix}`);
        setIsAnimating(false);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    hasEnteredView,
    recountCounter,
    refreshKey,
    targetValue,
    duration,
    finalDecimals,
    isValid,
    loading,
    prefix,
    suffix,
    startFromZero,
    animateOnChange,
  ]);

  return {
    displayValue,
    numericValue: currentNum,
    isAnimating,
    ref: elementRef,
  };
}
