/**
 * Layout engine — deterministic layout inference from geometric data.
 * Converts ComponentSpec layers into a structured blueprint (tag + Tailwind classes)
 * so the LLM only needs to assemble code, not analyze layout.
 */

import { SketchLayer } from './sketch-parser.js';
import { ComponentSpec } from './component-analyzer.js';
import { DesignTokens } from './token-extractor.js';

// ─── Blueprint types ────────────────────────────────────────────────

export interface LayoutBlueprint {
  componentName: string;
  root: BlueprintNode;
  hints: string[];
}

export interface BlueprintNode {
  id: string;
  tag: string;
  classes: string[];
  layout?: LayoutInfo;
  children: BlueprintNode[];
  text?: string;
}

export interface LayoutInfo {
  type: 'flex-row' | 'flex-col' | 'grid' | 'absolute' | 'flow';
  gap?: string;
  padding?: string;
  justify?: string;
  items?: string;
  gridCols?: number;
}

// ─── Main entry ─────────────────────────────────────────────────────

/** Prune non-meaningful nodes from a blueprint tree before sending to LLM */
export function pruneBlueprint(blueprint: LayoutBlueprint): LayoutBlueprint {
  const visibleStyle = (n: BlueprintNode): boolean => {
    const all = [...n.classes];
    if (n.layout) all.push(...layoutClasses(n.layout));
    return all.some(c => /^(bg-|border|shadow|rounded)/.test(c));
  };
  
  function hasContent(n: BlueprintNode): boolean {
    if (n.text && n.text.trim()) return true;
    return n.children.some(c => hasContent(c));
  }
  
  /** Only keep a node if it contributes something visible */
  function worthKeeping(n: BlueprintNode): boolean {
    if (n.text?.trim()) return true;           // has text content
    if (n.children.length > 0) return true;     // has children (may be worth keeping)
    if (visibleStyle(n)) return true;           // has visible styling
    return false;  // otherwise: empty, invisible, drop it
  }

  function prune(n: BlueprintNode): BlueprintNode {
    const filtered = n.children
      .map(c => prune(c))
      .filter(c => worthKeeping(c));
    return { ...n, children: filtered };
  }

  return { ...blueprint, root: prune(blueprint.root) };
}

export function generateBlueprint(
  component: ComponentSpec,
  tokens: DesignTokens,
): LayoutBlueprint {
  const layers = component.layers;

  let root: BlueprintNode;
  if (layers.length === 0) {
    root = { id: 'empty', tag: 'div', classes: [], children: [] };
  } else if (component.type === 'page' && layers.length > 1) {
    // Multiple top-level layers → wrap in a page container
    const children = layers
      .filter(l => l.visible)
      .map(l => buildNode(l, tokens));
    root = {
      id: 'page-root',
      tag: 'div',
      classes: ['min-h-screen'],
      layout: { type: 'flex-col', gap: 'gap-6' },
      children,
    };
  } else {
    root = buildNode(layers[0], tokens);
  }

  const hints: string[] = [];
  if (component.responsive) hints.push('responsive');
  if (component.type === 'page') hints.push('full-page');

  return { componentName: component.name, root, hints };
}

// ─── Node building ──────────────────────────────────────────────────

/** Patterns that indicate semantic component types from Sketch layer names */
const SEMANTIC_PATTERNS: { re: RegExp; tag: string; extra?: string[] }[] = [
  // Navigation / tabs
  { re: /(?:导航|nav|navbar|navigation|页签|tab|menu)/i, tag: 'nav', extra: ['flex', 'flex-row', 'items-center'] },
  // Sidebar
  { re: /(?:侧边|sidebar|aside)/i, tag: 'aside', extra: ['flex', 'flex-col'] },
  // Main content
  { re: /(?:内容|main|content|区域|编组\s*(?:28|2[6-9]|30))/i, tag: 'main' },
  // Table
  { re: /(?:表格|table|cell|单元格|表头|行|列|row|col)/i, tag: 'table' },
  // Table row
  { re: /(?:行|row|tr\b)/i, tag: 'tr' },
  // Table cell / data cell
  { re: /(?:单元格|cell|td\b)/i, tag: 'td' },
  // Card
  { re: /(?:指标卡|card|卡片|tile|panel|指标)/i, tag: 'div', extra: ['rounded-lg', 'shadow-sm'] },
  // Chart / visualization
  { re: /(?:可视化|图表|chart|柱状|bar|图|折线)/i, tag: 'div', extra: ['relative'] },
  // Button
  { re: /(?:按钮|button|btn|主按钮)/i, tag: 'button' },
  // Input / search
  { re: /(?:输入|input|搜索|search|select|下拉)/i, tag: 'div', extra: ['relative'] },
  // Icon
  { re: /(?:icon|图标)/i, tag: 'span', extra: ['inline-flex', 'items-center', 'justify-center'] },
  // Image
  { re: /(?:image|img|图片|bitmap)/i, tag: 'img' },
  // Header / footer
  { re: /(?:header|页头|head|顶部)/i, tag: 'header' },
  { re: /(?:footer|页脚|底部)/i, tag: 'footer' },
  // Section / group
  { re: /(?:section|区域|block)/i, tag: 'section' },
  // Breadcrumb
  { re: /(?:面包屑|breadcrumb)/i, tag: 'nav', extra: ['text-sm'] },
  // Pagination
  { re: /(?:分页|pagination|page)/i, tag: 'nav', extra: ['flex', 'items-center', 'gap-2'] },
  // Dropdown
  { re: /(?:dropdown|下拉)/i, tag: 'div', extra: ['relative'] },
  // Modal / dialog
  { re: /(?:modal|dialog|弹窗|overlay)/i, tag: 'div', extra: ['fixed', 'inset-0', 'z-50'] },
  // Badge / tag /徽标
  { re: /(?:徽标|badge|tag|标签)/i, tag: 'span', extra: ['inline-flex', 'items-center', 'px-2', 'py-0.5', 'rounded-full', 'text-xs'] },
  // Alert / warning
  { re: /(?:警告|alert|warning|提醒)/i, tag: 'div', extra: ['rounded', 'px-4', 'py-2'] },
  // Avatar / user
  { re: /(?:avatar|头像|user|用户)/i, tag: 'div', extra: ['flex', 'items-center', 'gap-2'] },
  // Container wrapper
  { re: /(?:容器|container|wrapper)/i, tag: 'div', extra: ['relative'] },
];

function buildNode(layer: SketchLayer, tokens: DesignTokens, depth = 0): BlueprintNode {
  const tag = inferTag(layer);
  const classes: string[] = [];

  mapStyles(layer, classes, tokens);
  // Intentionally skip mapSize — no fixed w-*/h-* classes
  // Sizing is handled by flex/grid layout + content

  const children: BlueprintNode[] = (layer.layers || [])
    .filter(l => l.visible)
    .map(child => buildNode(child, tokens, depth + 1));

  let layout: BlueprintNode['layout'];
  if (children.length > 0) {
    layout = detectLayout(layer, layer.layers.filter(l => l.visible));
  }

  return {
    id: layer.id,
    tag,
    classes,
    layout,
    children,
    text: layer.type === 'text' ? (layer.textContent || '') : undefined,
  };
}

// ─── Layout detection ───────────────────────────────────────────────

function detectLayout(parent: SketchLayer, children: SketchLayer[]): LayoutInfo {
  if (children.length === 0) return { type: 'flow' };

  if (children.length === 1) {
    return singleChildLayout(parent, children[0]);
  }

  if (hasSignificantOverlap(children)) {
    return { type: 'absolute' };
  }

  const bounds = children.map(toBounds);
  const hScore = horizontalScore(bounds);
  const vScore = verticalScore(bounds);

  const grid = detectGrid(bounds);
  if (grid) return grid;

  if (hScore > vScore && hScore > 0.3) {
    return flexRowLayout(bounds, parent);
  }

  return flexColLayout(bounds, parent);
}

function singleChildLayout(parent: SketchLayer, child: SketchLayer): LayoutInfo {
  const cx = child.x + child.width / 2;
  const cy = child.y + child.height / 2;
  const px = parent.width / 2;
  const py = parent.height / 2;

  const hCenter = Math.abs(cx - px) < parent.width * 0.08;
  const vCenter = Math.abs(cy - py) < parent.height * 0.08;

  if (!hCenter && !vCenter) return { type: 'flow' };

  const layout: LayoutInfo = { type: 'flex-row' };
  if (hCenter) layout.justify = 'justify-center';
  if (vCenter) layout.items = 'items-center';
  return layout;
}

// ─── Scoring helpers ────────────────────────────────────────────────

interface Bounds {
  x: number; y: number; w: number; h: number;
}

function toBounds(l: SketchLayer): Bounds {
  return { x: l.x, y: l.y, w: l.width, h: l.height };
}

/** How strongly elements are arranged in a row (high y-overlap, low x-overlap). */
function horizontalScore(bs: Bounds[]): number {
  if (bs.length < 2) return 0;
  const yOverlap = avgOverlap(bs.map(b => [b.y, b.y + b.h]));
  const xOverlap = avgOverlap(bs.map(b => [b.x, b.x + b.w]));
  return yOverlap - xOverlap;
}

/** How strongly elements are arranged in a column. */
function verticalScore(bs: Bounds[]): number {
  if (bs.length < 2) return 0;
  const xOverlap = avgOverlap(bs.map(b => [b.x, b.x + b.w]));
  const yOverlap = avgOverlap(bs.map(b => [b.y, b.y + b.h]));
  return xOverlap - yOverlap;
}

/** Average proportional overlap of 1D ranges. 1 = fully overlapping, 0 = disjoint. */
function avgOverlap(ranges: number[][]): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const [a0, a1] = ranges[i];
      const [b0, b1] = ranges[j];
      const span = Math.min(a1 - a0, b1 - b0);
      if (span <= 0) continue;
      const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
      total += overlap / span;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

function hasSignificantOverlap(children: SketchLayer[]): boolean {
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      if (intersectionRatio(children[i], children[j]) > 0.3) return true;
    }
  }
  return false;
}

function intersectionRatio(a: SketchLayer, b: SketchLayer): number {
  const xOv = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOv = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const area = xOv * yOv;
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 ? area / minArea : 0;
}

// ─── Flex-row ───────────────────────────────────────────────────────

function flexRowLayout(bs: Bounds[], parent: SketchLayer): LayoutInfo {
  const layout: LayoutInfo = { type: 'flex-row' };

  const sorted = bs.slice().sort((a, b) => a.x - b.x);
  const gaps = pairwiseGaps(sorted, 'x');
  layout.gap = toGapClass(avg(gaps));

  // Vertical alignment
  const yCenters = bs.map(b => b.y + b.h / 2);
  const yVariance = variance(yCenters);
  if (yVariance < parent.height * 0.05) {
    layout.items = 'items-center';
  } else {
    const topAligned = bs.every(b => Math.abs(b.y - bs[0].y) < 4);
    if (topAligned) layout.items = 'items-start';
  }

  // Horizontal distribution
  const totalChildW = bs.reduce((s, b) => s + b.w, 0);
  const totalGap = gaps.reduce((s, g) => s + Math.max(0, g), 0);
  if (totalChildW + totalGap < parent.width * 0.75 && gaps.length >= 2) {
    const gapVariance = variance(gaps);
    if (gapVariance < avg(gaps) * 0.5) {
      layout.justify = 'justify-between';
    }
  }

  return layout;
}

// ─── Flex-col ───────────────────────────────────────────────────────

function flexColLayout(bs: Bounds[], parent: SketchLayer): LayoutInfo {
  const layout: LayoutInfo = { type: 'flex-col' };

  const sorted = bs.slice().sort((a, b) => a.y - b.y);
  const gaps = pairwiseGaps(sorted, 'y');
  layout.gap = toGapClass(avg(gaps));

  // Padding from container edges
  const leftPad = sorted[0].x;
  const rightPad = parent.width - (sorted[sorted.length - 1].x + sorted[sorted.length - 1].w);
  const pad = inferPadding(parent, leftPad, rightPad);
  if (pad) layout.padding = pad;

  // Horizontal alignment
  const xCenters = bs.map(b => b.x + b.w / 2);
  const parentCX = parent.width / 2;
  if (xCenters.every(xc => Math.abs(xc - parentCX) < parent.width * 0.08)) {
    layout.items = 'items-center';
  } else {
    const leftAligned = bs.every(b => Math.abs(b.x - bs[0].x) < 4);
    if (leftAligned) layout.items = 'items-start';
  }

  return layout;
}

// ─── Grid detection ─────────────────────────────────────────────────

function detectGrid(bs: Bounds[]): LayoutInfo | null {
  if (bs.length < 4) return null;

  const yGroups = clusterValues(bs.map(b => b.y), 10);
  if (yGroups.length < 2) return null;

  const colCounts = yGroups.map(g => g.length);
  if (!colCounts.every(c => c === colCounts[0]) || colCounts[0] < 2) return null;

  const cols = colCounts[0];
  const gapX = avg(pairwiseGaps(
    bs.slice().sort((a, b) => a.x - b.x), 'x'
  ));
  const gapY = avg(pairwiseGaps(
    bs.slice().sort((a, b) => a.y - b.y), 'y'
  ));

  return {
    type: 'grid',
    gridCols: cols,
    gap: toGridGapClass(gapX, gapY),
  };
}

function clusterValues(values: number[], threshold: number): number[][] {
  const sorted = values.slice().sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= threshold) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  return groups;
}

// ─── Style mapping ──────────────────────────────────────────────────

function mapStyles(layer: SketchLayer, classes: string[], tokens: DesignTokens): void {
  // Background
  const bgColor = layer.fills.find(f => f.isEnabled && f.color)?.color;
  if (bgColor) {
    const tw = mapColor(bgColor, tokens, 'bg');
    if (tw) classes.push(tw);
  }

  // Corner radius
  if (layer.cornerRadius > 0) {
    classes.push(cornerRadiusClass(layer.cornerRadius));
  }

  // Shadow
  if (layer.shadows.length > 0 && layer.shadows[0].isEnabled) {
    classes.push(shadowClass(layer.shadows[0].blurRadius));
  }

  // Border
  if (layer.strokes.length > 0 && layer.strokes[0].isEnabled && layer.strokeWidth > 0) {
    classes.push('border');
    const strokeColor = layer.strokes[0].color;
    if (strokeColor) {
      const tw = mapColor(strokeColor, tokens, 'border');
      if (tw) classes.push(tw);
    }
  }

  // Opacity
  if (layer.opacity < 1 && layer.opacity >= 0) {
    classes.push(`opacity-${Math.round(layer.opacity * 100)}`);
  }

  // Typography
  if (layer.font) {
    classes.push(fontSizeClass(layer.font.size));
    const w = fontWeightClass(layer.font.weight);
    if (w) classes.push(w);
    if (layer.font.color) {
      const tw = mapColor(layer.font.color, tokens, 'text');
      if (tw) classes.push(tw);
    }
  }
}

// Intentionally removed: mapSize no longer adds fixed w-*/h-* classes.
// Modern UI sizing is content-driven via flex/grid layout.

// ─── Tag inference ──────────────────────────────────────────────────

function inferTag(layer: SketchLayer): string {
  if (layer.type === 'text') return textTag(layer);
  if (layer.type === 'image') return 'img';
  if (layer.type === 'shape') {
    if (layer.cornerRadius > layer.height * 0.3 && layer.height < 60 && layer.height > 0) return 'button';
    return 'div';
  }
  // Check layer name against semantic patterns
  const name = layer.name || '';
  const parentName = ''; // We don't have parent context, but name + type is enough
  
  // symbolInstance names carry the most semantic info
  if (layer.type === 'symbolInstance' || layer.type === 'component') {
    for (const p of SEMANTIC_PATTERNS) {
      if (p.re.test(name)) return p.tag;
    }
    return 'div'; // Unknown symbol → generic container
  }
  
  for (const p of SEMANTIC_PATTERNS) {
    if (p.re.test(name)) return p.tag;
  }
  
  // Fallback for groups with children
  if (layer.type === 'group' && (layer.layers?.length || 0) > 0) {
    const childTypes = new Set(layer.layers.map(l => l.type));
    if (childTypes.has('symbolInstance') && childTypes.size <= 2) return 'nav';
  }
  
  return 'div';
}

/** @returns extra Tailwind classes for a matched semantic pattern */
function getExtraClasses(layer: SketchLayer): string[] {
  const name = layer.name || '';
  for (const p of SEMANTIC_PATTERNS) {
    if (p.re.test(name) && p.extra) return p.extra;
  }
  return [];
}

function textTag(layer: SketchLayer): string {
  if (!layer.font) return 'span';
  const sz = layer.font.size;
  const name = layer.name.toLowerCase();
  if (name.includes('title') || name.includes('heading')) return 'h2';
  if (name.includes('subtitle')) return 'h3';
  if (sz >= 28) return 'h1';
  if (sz >= 24) return 'h2';
  if (sz >= 20) return 'h3';
  if (sz >= 16) return 'h4';
  if (sz >= 14) return 'p';
  return 'span';
}

// ─── Color mapping ──────────────────────────────────────────────────

function mapColor(hex: string, tokens: DesignTokens, prefix: string): string | null {
  const norm = hex.toUpperCase();
  for (const t of tokens.colors) {
    if (t.hex.toUpperCase() === norm && t.name.includes('-')) {
      return `${prefix}-${t.name}`;
    }
  }
  return nearestGray(norm, prefix);
}

function nearestGray(hex: string, prefix: string): string | null {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  const bri = (r * 299 + g * 587 + b * 114) / 1000;
  if (bri > 250) return `${prefix}-white`;
  if (bri > 230) return `${prefix}-gray-50`;
  if (bri > 200) return `${prefix}-gray-100`;
  if (bri > 170) return `${prefix}-gray-200`;
  if (bri > 140) return `${prefix}-gray-300`;
  if (bri > 110) return `${prefix}-gray-400`;
  if (bri > 80)  return `${prefix}-gray-500`;
  if (bri > 50)  return `${prefix}-gray-700`;
  if (bri > 25)  return `${prefix}-gray-800`;
  return `${prefix}-gray-900`;
}

// ─── Tailwind class helpers ─────────────────────────────────────────

function cornerRadiusClass(r: number): string {
  if (r >= 999) return 'rounded-full';
  if (r >= 24)  return 'rounded-3xl';
  if (r >= 16)  return 'rounded-2xl';
  if (r >= 12)  return 'rounded-xl';
  if (r >= 8)   return 'rounded-lg';
  if (r >= 4)   return 'rounded';
  return 'rounded-sm';
}

function shadowClass(blur: number): string {
  if (blur >= 30) return 'shadow-2xl';
  if (blur >= 20) return 'shadow-xl';
  if (blur >= 12) return 'shadow-lg';
  if (blur >= 6)  return 'shadow-md';
  if (blur >= 3)  return 'shadow';
  return 'shadow-sm';
}

function fontSizeClass(px: number): string {
  if (px >= 36) return 'text-4xl';
  if (px >= 30) return 'text-3xl';
  if (px >= 24) return 'text-2xl';
  if (px >= 20) return 'text-xl';
  if (px >= 18) return 'text-lg';
  if (px >= 16) return 'text-base';
  if (px >= 14) return 'text-sm';
  return 'text-xs';
}

function fontWeightClass(w: string): string | null {
  const s = w.toLowerCase();
  if (s === 'bold' || s === '700')   return 'font-bold';
  if (s === 'semibold' || s === '600') return 'font-semibold';
  if (s === 'medium' || s === '500')   return 'font-medium';
  if (s === 'light' || s === '300')    return 'font-light';
  if (s === '800' || s === 'heavy')    return 'font-extrabold';
  return null;
}

function toGapClass(px: number): string | undefined {
  if (px <= 0) return undefined;
  const step = Math.round(px / 4);
  if (step <= 1) return 'gap-1';
  if (step <= 2) return 'gap-2';
  if (step <= 3) return 'gap-3';
  if (step <= 4) return 'gap-4';
  if (step <= 6) return 'gap-6';
  if (step <= 8) return 'gap-8';
  return 'gap-10';
}

function toGridGapClass(gx: number, gy: number): string | undefined {
  const cx = toGapClass(gx);
  const cy = toGapClass(gy);
  if (!cx && !cy) return undefined;
  if (cx === cy || !cy) return cx;
  if (!cx) return cy;
  return `${cx.replace('gap', 'gap-x')} ${cy.replace('gap', 'gap-y')}`;
}

function widthClass(px: number): string | null {
  if (px <= 0) return null;
  if (px >= 384) return 'w-96';
  if (px >= 320) return 'w-80';
  if (px >= 256) return 'w-64';
  if (px >= 192) return 'w-48';
  if (px >= 128) return 'w-32';
  if (px >= 96)  return 'w-24';
  if (px >= 64)  return 'w-16';
  if (px >= 48)  return 'w-12';
  if (px >= 32)  return 'w-8';
  if (px >= 24)  return 'w-6';
  if (px >= 16)  return 'w-4';
  return null;
}

function heightClass(px: number): string | null {
  if (px <= 0) return null;
  if (px >= 96) return 'h-24';
  if (px >= 80) return 'h-20';
  if (px >= 64) return 'h-16';
  if (px >= 48) return 'h-12';
  if (px >= 40) return 'h-10';
  if (px >= 32) return 'h-8';
  if (px >= 24) return 'h-6';
  if (px >= 16) return 'h-4';
  return null;
}

function inferPadding(parent: SketchLayer, left: number, right: number): string | undefined {
  const avg = (left + right) / 2;
  if (avg < 4) return undefined;
  if (avg < 6)  return 'px-1';
  if (avg < 10) return 'px-2';
  if (avg < 14) return 'px-3';
  if (avg < 20) return 'px-4';
  if (avg < 28) return 'px-6';
  if (avg < 40) return 'px-8';
  return 'px-10';
}

// ─── Math helpers ───────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = avg(arr);
  return arr.reduce((s, v) => s + Math.abs(v - m), 0) / arr.length;
}

function pairwiseGaps(sorted: Bounds[], axis: 'x' | 'y'): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (axis === 'x') {
      gaps.push(curr.x - (prev.x + prev.w));
    } else {
      gaps.push(curr.y - (prev.y + prev.h));
    }
  }
  return gaps;
}

// ─── Blueprint → compact prompt string ──────────────────────────────

export function blueprintToPrompt(blueprint: LayoutBlueprint): string {
  const lines: string[] = [];
  lines.push(`Component: ${blueprint.componentName}`);
  if (blueprint.hints.length > 0) {
    lines.push(`Hints: ${blueprint.hints.join(', ')}`);
  }
  lines.push('Structure:');
  renderNode(lines, blueprint.root, 0);

  // Append exact text content mapping for precise restoration
  const textMap = collectExactTexts(blueprint.root);
  if (textMap.length > 0) {
    lines.push('');
    lines.push('### Exact Text Content (source of truth — use these EXACT strings):');
    for (const { id, tag, text } of textMap) {
      const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;
      lines.push(`  [${id}] <${tag}>: "${preview}"`);
    }
    lines.push('IMPORTANT: Copy the text above EXACTLY. Do not paraphrase, truncate, or invent content.');
  }

  return lines.join('\n');
}

function collectExactTexts(node: BlueprintNode, depth = 0): { id: string; tag: string; text: string }[] {
  const result: { id: string; tag: string; text: string }[] = [];
  if (node.text && node.text.length > 0) {
    result.push({ id: node.id, tag: node.tag, text: node.text });
  }
  for (const child of node.children) {
    result.push(...collectExactTexts(child, depth + 1));
  }
  return result;
}

function renderNode(lines: string[], node: BlueprintNode, depth: number): void {
  const indent = '  '.repeat(depth);
  const prefix = depth === 0 ? '' : depth === 1 ? '├─ ' : '│  '.repeat(depth - 1) + '├─ ';

  let allClasses = [...node.classes];
  if (node.layout) {
    allClasses.push(...layoutClasses(node.layout));
  }

  const classStr = allClasses.length > 0 ? ` class="${allClasses.join(' ')}"` : '';
  const truncated = node.text ? ` "${node.text.slice(0, 120).replace(/\n/g, '\\n')}"` : '';
  const childIndicator = node.children.length > 0 ? ` (${node.children.length} children)` : '';

  lines.push(`${indent}${prefix}<${node.tag}${classStr}>${truncated}${childIndicator}`);

  for (const child of node.children) {
    renderNode(lines, child, depth + 1);
  }
}

function layoutClasses(layout: LayoutInfo): string[] {
  const c: string[] = [];
  switch (layout.type) {
    case 'flex-row': c.push('flex', 'flex-row'); break;
    case 'flex-col': c.push('flex', 'flex-col'); break;
    case 'grid': c.push('grid'); if (layout.gridCols) c.push(`grid-cols-${layout.gridCols}`); break;
    case 'absolute': c.push('relative'); break;
    case 'flow': break;
  }
  if (layout.gap) c.push(layout.gap);
  if (layout.padding) c.push(layout.padding);
  if (layout.justify) c.push(layout.justify);
  if (layout.items) c.push(layout.items);
  return c;
}
