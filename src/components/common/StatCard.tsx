import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from 'lucide-react';
import {
  useCountUp,
  extractNumericValue,
  formatFormattedNumber,
  type UseCountUpOptions,
  type UseCountUpResult,
} from '../../hooks/useCountUp.ts';

export { useCountUp, extractNumericValue, formatFormattedNumber };
export type { UseCountUpOptions, UseCountUpResult };

export interface TrendIndicator {
  value: number | string;
  direction?: 'up' | 'down' | 'neutral';
  label?: string;
}

export interface AnimatedCounterProps {
  value: number | string | null | undefined;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  loading?: boolean;
  refreshKey?: any;
}

/**
 * Global event dispatcher to trigger a synchronized recount and re-animation
 * of all KPI stat cards across the application.
 */
export function triggerStatRecount() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app:refresh-stats'));
  }
}

/**
 * Standalone Animated Counter Component.
 * Animates counting up smoothly when scrolled into view, and smoothly transitions
 * across value updates.
 */
export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  prefix = '',
  suffix = '',
  decimals,
  duration = 1200,
  className = '',
  loading = false,
  refreshKey,
}) => {
  const safeValue = typeof value === 'number' && isNaN(value) ? 0 : value;
  const isEffectivelyLoading = loading || safeValue === null || safeValue === undefined;

  const { displayValue, ref } = useCountUp({
    value: safeValue,
    duration,
    decimals,
    prefix,
    suffix,
    loading: isEffectivelyLoading,
    refreshKey,
  });

  if (isEffectivelyLoading || displayValue === '...') {
    return (
      <span ref={ref} className={`inline-block animate-pulse text-slate-400 ${className}`}>
        {prefix}...{suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {displayValue}
    </span>
  );
};

export type StatCardColor =
  | 'blue'
  | 'purple'
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'indigo'
  | 'slate';

export interface StatCardProps {
  id?: string;
  title: string;
  value: number | string | null | undefined;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  icon?: LucideIcon | React.ComponentType<{ className?: string }> | React.ReactNode;
  iconColor?: StatCardColor;
  subtext?: React.ReactNode;
  trendIndicator?: TrendIndicator;
  sparkline?: 'blue' | 'purple' | 'cyan' | 'rose' | 'sky' | React.ReactNode;
  layout?: 'vertical' | 'horizontal';
  className?: string;
  valueClassName?: string;
  delay?: number;
  loading?: boolean;
  refreshKey?: any;
  onClick?: () => void;
}

const colorStyles: Record<
  StatCardColor,
  {
    bgLight: string;
    bgDark: string;
    borderLight: string;
    borderDark: string;
    textLight: string;
    textDark: string;
    hoverBorder: string;
    accentGlow?: string;
  }
> = {
  blue: {
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-950/60',
    borderLight: 'border-blue-100',
    borderDark: 'dark:border-blue-900/50',
    textLight: 'text-blue-600',
    textDark: 'dark:text-cyan-400',
    hoverBorder: 'hover:border-blue-500/50',
  },
  purple: {
    bgLight: 'bg-purple-50',
    bgDark: 'dark:bg-purple-950/60',
    borderLight: 'border-purple-100',
    borderDark: 'dark:border-purple-900/50',
    textLight: 'text-purple-600',
    textDark: 'dark:text-purple-300',
    hoverBorder: 'hover:border-purple-500/50',
  },
  cyan: {
    bgLight: 'bg-cyan-50',
    bgDark: 'dark:bg-cyan-950/60',
    borderLight: 'border-cyan-100',
    borderDark: 'dark:border-cyan-900/50',
    textLight: 'text-cyan-600',
    textDark: 'dark:text-cyan-400',
    hoverBorder: 'hover:border-cyan-500/50',
  },
  emerald: {
    bgLight: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-950/60',
    borderLight: 'border-emerald-100',
    borderDark: 'dark:border-emerald-900/50',
    textLight: 'text-emerald-600',
    textDark: 'dark:text-emerald-400',
    hoverBorder: 'hover:border-emerald-500/50',
  },
  amber: {
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-950/60',
    borderLight: 'border-amber-100',
    borderDark: 'dark:border-amber-900/50',
    textLight: 'text-amber-600',
    textDark: 'dark:text-amber-400',
    hoverBorder: 'hover:border-amber-500/60',
  },
  rose: {
    bgLight: 'bg-rose-50',
    bgDark: 'dark:bg-rose-950/60',
    borderLight: 'border-rose-100',
    borderDark: 'dark:border-rose-900/50',
    textLight: 'text-rose-600',
    textDark: 'dark:text-rose-400',
    hoverBorder: 'hover:border-rose-500/60',
    accentGlow: 'dark:shadow-[0_0_15px_rgba(244,63,94,0.12)]',
  },
  sky: {
    bgLight: 'bg-sky-50',
    bgDark: 'dark:bg-sky-950/60',
    borderLight: 'border-sky-100',
    borderDark: 'dark:border-sky-900/50',
    textLight: 'text-sky-600',
    textDark: 'dark:text-sky-400',
    hoverBorder: 'hover:border-sky-500/50',
  },
  indigo: {
    bgLight: 'bg-indigo-50',
    bgDark: 'dark:bg-indigo-950/60',
    borderLight: 'border-indigo-100',
    borderDark: 'dark:border-indigo-900/50',
    textLight: 'text-indigo-600',
    textDark: 'dark:text-indigo-400',
    hoverBorder: 'hover:border-indigo-500/50',
  },
  slate: {
    bgLight: 'bg-slate-50',
    bgDark: 'dark:bg-slate-900/80',
    borderLight: 'border-slate-200',
    borderDark: 'dark:border-slate-800',
    textLight: 'text-slate-600',
    textDark: 'dark:text-slate-400',
    hoverBorder: 'hover:border-slate-500/50',
  },
};

const sparklinePaths: Record<string, { d: string; stroke: string }> = {
  blue: { d: 'M 2 24 C 15 22, 25 10, 38 14 C 50 18, 55 4, 62 3', stroke: '#3B82F6' },
  purple: { d: 'M 2 20 C 14 18, 26 24, 38 12 C 48 4, 56 10, 62 4', stroke: '#8B5CF6' },
  cyan: { d: 'M 2 22 C 16 20, 24 8, 38 14 C 48 18, 54 8, 62 5', stroke: '#06B6D4' },
  rose: { d: 'M 2 6 C 14 8, 26 12, 38 18 C 48 24, 56 22, 62 26', stroke: '#F43F5E' },
  sky: { d: 'M 2 26 C 15 20, 25 14, 38 16 C 50 18, 55 8, 62 5', stroke: '#0EA5E9' },
};

/**
 * Reusable KPI StatCard with smooth animated counter, recount trigger on refresh,
 * and consistent theme styling.
 */
export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  prefix = '',
  suffix = '',
  decimals,
  duration = 1200,
  icon,
  iconColor = 'blue',
  subtext,
  trendIndicator,
  sparkline,
  layout = 'vertical',
  className = '',
  valueClassName = '',
  delay = 0,
  loading = false,
  refreshKey,
  onClick,
}) => {
  const isCardLoading = loading || value === null || value === undefined;
  const color = colorStyles[iconColor] || colorStyles.blue;
  const [cardRefreshKey, setCardRefreshKey] = useState<number>(0);

  // Listen to global recount event to trigger card entrance/pulse animation
  useEffect(() => {
    const handleGlobalRecount = () => {
      setCardRefreshKey((prev) => prev + 1);
    };
    window.addEventListener('app:refresh-stats', handleGlobalRecount);
    return () => {
      window.removeEventListener('app:refresh-stats', handleGlobalRecount);
    };
  }, []);

  // Update card refresh key if external refreshKey prop changes
  useEffect(() => {
    if (refreshKey !== undefined) {
      setCardRefreshKey((prev) => prev + 1);
    }
  }, [refreshKey]);

  // Render icon safely whether LucideIcon, component, or node
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    const IconComponent = icon as React.ComponentType<{ className?: string }>;
    return <IconComponent className="w-5 h-5 stroke-[2.2]" />;
  };

  // Horizontal Banner Layout (Used in SupplierManagement, CustomerManagement, etc.)
  if (layout === 'horizontal') {
    return (
      <motion.div
        key={id || title}
        id={id}
        initial={{ opacity: 0.5, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, delay: delay * 0.4 }}
        onClick={onClick}
        className={`group relative app-stat-card p-4.5 rounded-2xl border border-slate-200/90 dark:bg-gradient-to-br dark:from-[#0E1628] dark:to-purple-950/30 dark:border-purple-800/60 shadow-xs flex items-center space-x-3.5 ${color.hoverBorder} transition-all duration-200 ${
          onClick ? 'cursor-pointer' : ''
        } ${className}`}
      >
        {icon && (
          <div
            className={`w-11 h-11 rounded-xl ${color.bgLight} ${color.bgDark} border ${color.borderLight} ${color.borderDark} flex items-center justify-center ${color.textLight} ${color.textDark} shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
          >
            {renderIcon()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-slate-500 dark:text-purple-200/80 uppercase tracking-wider truncate">
            {title}
          </div>
          <div
            className={`text-xl font-black text-slate-900 dark:text-white mt-0.5 tracking-tight font-mono truncate ${valueClassName}`}
          >
            <AnimatedCounter
              value={value}
              prefix={prefix}
              suffix={suffix}
              decimals={decimals}
              duration={duration}
              loading={isCardLoading}
              refreshKey={cardRefreshKey}
            />
          </div>
          {subtext && <div className="mt-0.5 text-[11px]">{subtext}</div>}
        </div>
      </motion.div>
    );
  }

  // Vertical Bento Layout (Default: DashboardOverview, ProductManagement, Purchases, Reports)
  return (
    <motion.div
      key={id || title}
      id={id}
      initial={{ opacity: 0.5, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: delay * 0.4 }}
      onClick={onClick}
      className={`group relative app-stat-card p-4.5 flex flex-col justify-between ${color.hoverBorder} ${
        color.accentGlow || ''
      } transition-all duration-200 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Top Row: Icon & Optional Sparkline */}
      <div className="flex items-center justify-between">
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl ${color.bgLight} ${color.bgDark} border ${color.borderLight} ${color.borderDark} flex items-center justify-center ${color.textLight} ${color.textDark} shadow-2xs group-hover:scale-105 transition-transform`}
          >
            {renderIcon()}
          </div>
        )}

        {/* Sparkline curve */}
        {sparkline && typeof sparkline === 'string' && sparklinePaths[sparkline] ? (
          <svg className="w-16 h-8 overflow-visible" viewBox="0 0 64 32" aria-hidden="true">
            <path
              d={sparklinePaths[sparkline].d}
              fill="none"
              stroke={sparklinePaths[sparkline].stroke}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          React.isValidElement(sparkline) && sparkline
        )}
      </div>

      {/* Main Metric Section */}
      <div className="mt-3">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
          {title}
        </div>
        <div
          className={`text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight ${valueClassName}`}
        >
          <AnimatedCounter
            value={value}
            prefix={prefix}
            suffix={suffix}
            decimals={decimals}
            duration={duration}
            loading={isCardLoading}
            refreshKey={cardRefreshKey}
          />
        </div>

        {/* Subtext or Trend Indicator */}
        {(trendIndicator || subtext) && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
            {trendIndicator && (
              <span
                className={`font-semibold flex items-center gap-0.5 ${
                  trendIndicator.direction === 'up'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : trendIndicator.direction === 'down'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {trendIndicator.direction === 'up' && <ArrowUpRight className="w-3 h-3 inline" />}
                {trendIndicator.direction === 'down' && (
                  <ArrowDownRight className="w-3 h-3 inline" />
                )}
                {trendIndicator.direction === 'neutral' && <Minus className="w-3 h-3 inline" />}
                {trendIndicator.value}
              </span>
            )}
            {trendIndicator?.label && <span>{trendIndicator.label}</span>}
            {subtext && !trendIndicator && subtext}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default StatCard;
