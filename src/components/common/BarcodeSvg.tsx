import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { useTheme } from '../../context/ThemeContext.tsx';

interface BarcodeSvgProps {
  value: string;
  format?: 'CODE128' | 'EAN13' | 'UPC';
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
  lineColor?: string;
  forcePrintBlack?: boolean;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  format = 'CODE128',
  width = 1.6,
  height = 40,
  displayValue = true,
  fontSize = 12,
  className = '',
  lineColor,
  forcePrintBlack = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  let currentTheme = 'dark';
  try {
    const themeContext = useTheme();
    if (themeContext) currentTheme = themeContext.theme;
  } catch {
    // Fallback if rendered outside ThemeProvider
    if (typeof document !== 'undefined') {
      currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
  }

  useEffect(() => {
    if (svgRef.current && value) {
      const cleanVal = String(value).trim();
      const isDark = currentTheme === 'dark';
      // If printing or explicitly set, force black, otherwise dark mode is pure high-contrast white #FFFFFF
      const resolvedLineColor = lineColor || (forcePrintBlack ? '#000000' : (isDark ? '#FFFFFF' : '#000000'));
      
      const tryFormat = (fmt: string) => {
        JsBarcode(svgRef.current, cleanVal, {
          format: fmt as any,
          width,
          height,
          displayValue,
          fontSize,
          margin: 4,
          font: 'monospace',
          background: 'transparent',
          lineColor: resolvedLineColor,
        });
      };

      try {
        if (cleanVal.length === 13 && /^\d{13}$/.test(cleanVal)) {
          tryFormat('EAN13');
        } else {
          tryFormat(format);
        }
      } catch {
        try {
          tryFormat('CODE128');
        } catch (e2) {
          console.warn('JsBarcode render error for:', value, e2);
        }
      }
    }
  }, [value, format, width, height, displayValue, fontSize, lineColor, currentTheme, forcePrintBlack]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
};

