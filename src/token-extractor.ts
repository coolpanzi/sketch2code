/**
 * Design token extractor
 * Converts raw sketch layer data into structured design tokens
 */

import { SketchLayer } from './sketch-parser.js';

export interface DesignTokens {
  colors: ColorToken[];
  spacing: SpacingToken[];
  typography: TypographyToken[];
  shadows: ShadowToken[];
  breakpoints: BreakpointToken[];
  layout: LayoutToken;
}

export interface ColorToken {
  name: string;
  hex: string;
  usage: string[];
}

export interface SpacingToken {
  value: number;
  usage: string[];
}

export interface TypographyToken {
  fontFamily: string;
  size: number;
  weight: string;
  lineHeight: number;
  letterSpacing: number;
  usage: string[];
}

export interface ShadowToken {
  name: string;
  blurRadius: number;
  offsetX: number;
  offsetY: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface BreakpointToken {
  name: string;
  value: number;
}

export interface LayoutToken {
  gridColumns: number;
  gridGap: number;
  containerPadding: number;
  maxContainerWidth: number;
}

/**
 * Analyze parsed sketch layers and extract design tokens
 */
export function extractDesignTokens(layers: SketchLayer[]): DesignTokens {
  const colorMap = new Map<string, string[]>();
  const spacingMap = new Map<number, string[]>();
  const fontMap = new Map<string, TypographyToken>();
  const shadowSet = new Map<string, ShadowToken>();

  // Flatten all layers recursively
  const allLayers: SketchLayer[] = [];
  function flatten(ls: SketchLayer[]): void {
    for (const l of ls) {
      allLayers.push(l);
      if (l.layers?.length) flatten(l.layers);
    }
  }
  flatten(layers);

  for (const layer of allLayers) {
    // Collect colors from fills and strokes
    for (const fill of layer.fills) {
      if (fill.isEnabled && fill.color) {
        const existing = colorMap.get(fill.color) || [];
        existing.push(layer.name);
        colorMap.set(fill.color, existing);
      }
    }
    for (const stroke of layer.strokes) {
      if (stroke.isEnabled && stroke.color) {
        const existing = colorMap.get(stroke.color) || [];
        existing.push(layer.name + ' (stroke)');
        colorMap.set(stroke.color, existing);
      }
    }

    // Collect spacing from child gaps
    if (layer.layers.length > 0) {
      const gap = inferGap(layer);
      if (gap > 0) {
        const existing = spacingMap.get(gap) || [];
        existing.push(layer.name);
        spacingMap.set(gap, existing);
      }
    }

    // Collect typography from text layers
    if (layer.font) {
      const key = layer.font.name + '-' + layer.font.size + '-' + layer.font.weight;
      const existing = fontMap.get(key);
      if (existing) {
        existing.usage.push(layer.name);
      } else {
        fontMap.set(key, {
          fontFamily: layer.font.name,
          size: layer.font.size,
          weight: layer.font.weight,
          lineHeight: 1.4,
          letterSpacing: 0,
          usage: [layer.name],
        });
      }
    }

    // Collect shadows
    for (const shadow of layer.shadows) {
      const key = shadow.blurRadius + '-' + shadow.offsetX + '-' + shadow.offsetY + '-' + shadow.color;
      if (!shadowSet.has(key)) {
        shadowSet.set(key, {
          name: 'shadow-' + shadowSet.size,
          blurRadius: shadow.blurRadius,
          offsetX: shadow.offsetX,
          offsetY: shadow.offsetY,
          spread: shadow.spread,
          color: shadow.color,
          opacity: layer.opacity,
        });
      }
    }
  }

  return {
    colors: normalizeColors(colorMap),
    spacing: normalizeSpacing(spacingMap),
    typography: Array.from(fontMap.values()),
    shadows: Array.from(shadowSet.values()),
    breakpoints: [
      { name: 'sm', value: 640 },
      { name: 'md', value: 768 },
      { name: 'lg', value: 1024 },
      { name: 'xl', value: 1280 },
    ],
    layout: analyzeLayout(layers),
  };
}

function inferGap(layer: SketchLayer): number {
  if (layer.layers.length <= 1) return 0;
  const sorted = layer.layers.slice().sort((a, b) => a.x - b.x);
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    totalGap += curr.x - (prev.x + prev.width);
  }
  return Math.round(totalGap / (sorted.length - 1));
}

function normalizeColors(colorMap: Map<string, string[]>): ColorToken[] {
  const tokens: ColorToken[] = [];
  const sorted = Array.from(colorMap.entries()).sort((a, b) => b[1].length - a[1].length);

  for (const [hex, usages] of sorted) {
    const name = inferColorName(hex, usages);
    tokens.push({ name, hex: hex.toUpperCase(), usage: usages.slice(0, 3) });
  }

  return tokens;
}

function inferColorName(hex: string, usages: string[]): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const usageText = usages.join(' ').toLowerCase();

  if (usageText.includes('background') || usageText.includes('bg')) {
    if (brightness > 200) return 'bg-white';
    if (brightness > 150) return 'bg-gray-50';
    return 'bg-gray-900';
  }
  if (usageText.includes('border')) return 'border-gray-200';
  if (usageText.includes('text')) {
    if (brightness > 200) return 'text-white';
    if (brightness > 150) return 'text-gray-600';
    if (brightness > 80) return 'text-gray-800';
    return 'text-gray-900';
  }
  if (brightness > 240) return 'neutral-50';
  if (brightness > 200) return 'neutral-100';
  if (brightness > 180) return 'neutral-200';
  if (brightness > 150) return 'neutral-300';
  if (brightness > 100) return 'neutral-500';
  if (brightness > 50) return 'neutral-700';
  return 'neutral-900';
}

function normalizeSpacing(spacingMap: Map<number, string[]>): SpacingToken[] {
  const tokens: SpacingToken[] = [];
  const sorted = Array.from(spacingMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [value, usages] of sorted) {
    tokens.push({ value: Math.round(value), usage: usages.slice(0, 3) });
  }
  return tokens;
}

function analyzeLayout(layers: SketchLayer[]): LayoutToken {
  const rootFrames = layers.filter(l => l.height > 500 && l.width > 300);
  let maxContainerWidth = 0;
  let gridColumns = 12;
  let gridGap = 16;
  let containerPadding = 16;

  if (rootFrames.length > 0) {
    const widest = rootFrames.reduce((max, f) => Math.max(max, f.width), 0);
    maxContainerWidth = widest;
    if (widest >= 1280) gridColumns = 12;
    else if (widest >= 768) gridColumns = 8;
    else gridColumns = 4;
  }

  return { gridColumns, gridGap, containerPadding, maxContainerWidth: maxContainerWidth || 1440 };
}
