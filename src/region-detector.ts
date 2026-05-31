/**
 * Region detector — splits sketch artboard layers into semantic regions
 * and extracts content (text, colors, sizes) for HTML generation.
 *
 * Strategy: classify layers by their position, size, and name patterns,
 * then group them into header / sidebar / main / footer regions.
 */

import { SketchLayer } from './sketch-parser.js';

// ─── Content item extracted from a layer ──────────────────────────

export interface ContentItem {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: string;
  color: string;
  bgColor: string;
  layerName: string;
  layerType: string;
  cornerRadius: number;
  hasBorder: boolean;
  borderColor: string;
}

// ─── A detected page region ───────────────────────────────────────

export interface PageRegion {
  type: 'header' | 'sidebar' | 'main' | 'footer' | 'overlay';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  items: ContentItem[];
  /** Sub-regions within this region */
  subRegions?: PageRegion[];
}

// ─── Pattern detection results ────────────────────────────────────

export interface DetectedPattern {
  type: 'nav-tabs' | 'menu-list' | 'kpi-card' | 'bar-chart' | 'data-table' | 'button' | 'alert' | 'input-group';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  items: ContentItem[];
}

// ─── Full detection result ────────────────────────────────────────

export interface RegionResult {
  pageName: string;
  pageW: number;
  pageH: number;
  allText: ContentItem[];
  regions: PageRegion[];
}

// ─── Main entry — extract and classify ─────────────────────────────

export function detectRegions(layers: SketchLayer[], pageName: string): RegionResult {
  // 1. Extract all content from layers
  const allText = extractContent(layers);

  // 2. Determine page bounds
  const pageW = Math.max(...layers.map(l => l.x + l.width), 1280);
  const pageH = Math.max(...layers.map(l => l.y + l.height), 800);

  // 3. Classify layers into regions based on position
  const regions = classifyRegions(layers, pageW, pageH, allText);

  return { pageName, pageW, pageH, allText, regions };
}

// ─── Extract text content from layers ──────────────────────────────

function extractContent(layers: SketchLayer[]): ContentItem[] {
  const items: ContentItem[] = [];

  function walk(ls: SketchLayer[], offsetX = 0, offsetY = 0): void {
    for (const l of ls) {
      if (!l.visible) continue;

      const absX = offsetX + l.x;
      const absY = offsetY + l.y;

      // Text layers with content
      if (l.textContent && l.textContent.trim()) {
        items.push({
          text: l.textContent.trim(),
          x: absX,
          y: absY,
          w: l.width,
          h: l.height,
          fontSize: l.font?.size || 12,
          fontWeight: l.font?.weight || 'normal',
          color: l.font?.color || '',
          bgColor: l.fills.find(f => f.isEnabled)?.color || '',
          layerName: l.name,
          layerType: l.type,
          cornerRadius: l.cornerRadius,
          hasBorder: l.strokes.some(s => s.isEnabled),
          borderColor: l.strokes.find(s => s.isEnabled)?.color || '',
        });
      }

      // Shape layers with fills/borders (visual containers)
      if (l.type === 'shape') {
        const fill = l.fills.find(f => f.isEnabled);
        const stroke = l.strokes.find(s => s.isEnabled);
        if (fill || stroke) {
          items.push({
            text: '',
            x: absX,
            y: absY,
            w: l.width,
            h: l.height,
            fontSize: 0,
            fontWeight: '',
            color: '',
            bgColor: fill?.color || '',
            layerName: l.name,
            layerType: l.type,
            cornerRadius: l.cornerRadius,
            hasBorder: !!stroke,
            borderColor: stroke?.color || '',
          });
        }
      }

      // Recurse with accumulated offset
      if (l.layers?.length) walk(l.layers, absX, absY);
    }
  }

  walk(layers);
  return items;
}

// ─── Region classification ─────────────────────────────────────────

/** Classify a top-level layer into a region by its name, position, and size */
function classifyLayerRegion(layer: SketchLayer, pageW: number, pageH: number): PageRegion['type'] {
  const name = (layer.name || '').toLowerCase();
  const type = layer.type;
  
  // Sidebar heuristics: narrow tall group / named "side" or "menu" / symbolInstance at left edge
  if (type === 'group' && layer.width < layer.height * 0.3 && layer.width < pageW * 0.2) return 'sidebar';
  if (/侧|sidebar|aside|菜单/.test(name)) return 'sidebar';
  
  // Header heuristics: top-of-page, wide, named "nav" or "tab"
  if (layer.y < pageH * 0.09 && (layer.width > pageW * 0.5 || type === 'symbolInstance')) return 'header';
  if (/导航|nav|tab|页签|header|下拉/.test(name) && layer.y < pageH * 0.18) return 'header';
  
  // Footer: bottom of page
  if (layer.y + layer.height > pageH * 0.85) return 'footer';
  if (/footer|页脚|底部/.test(name)) return 'footer';
  
  // Alert/banner: named "alert" or "warning" or "提醒"
  if (/alert|warning|提醒|警告/.test(name)) return 'header';
  
  // Main content: everything else
  return 'main';
}

function classifyRegions(
  layers: SketchLayer[],
  pageW: number,
  pageH: number,
  allText: ContentItem[]
): PageRegion[] {
  const regions: PageRegion[] = [];
  const labels: Record<PageRegion['type'], string> = {
    header: 'Header', sidebar: 'Sidebar', main: 'Main Content',
    footer: 'Footer', overlay: 'Overlay',
  };
  
  // Classify each top-level layer, build one region per layer
  const usedItems = new Set<ContentItem>();
  
  for (const layer of layers) {
    const rtype = classifyLayerRegion(layer, pageW, pageH);
    
    // Find text items that fall within this layer's bounds
    const items = allText.filter(item => {
      if (usedItems.has(item)) return false;
      return item.x >= layer.x - 5 && item.x + item.w <= layer.x + layer.width + 5 &&
             item.y >= layer.y - 5 && item.y + item.h <= layer.y + layer.height + 5;
    });
    items.forEach(i => usedItems.add(i));
    
    // Skip empty regions (like header without text)
    if (items.length === 0 && rtype !== 'main') continue;
    
    regions.push({
      type: rtype,
      label: labels[rtype],
      x: layer.x, y: layer.y,
      w: layer.width, h: layer.height,
      items,
    });
  }
  
  // Add any orphan items to the nearest region
  const orphans = allText.filter(i => !usedItems.has(i));
  if (orphans.length > 0 && regions.length > 0) {
    // Add to the region with the closest y
    for (const item of orphans) {
      let best = regions[0];
      let bestDist = Infinity;
      for (const r of regions) {
        const dist = Math.abs(item.y - (r.y + r.h / 2));
        if (dist < bestDist) { bestDist = dist; best = r; }
      }
      best.items.push(item);
    }
  }
  
  regions.sort((a, b) => a.y - b.y);
  return regions;
}

// ─── Split main region into sub-regions ─────────────────────────────

function splitMainRegion(items: ContentItem[], baseX: number, baseX2: number): PageRegion[] {
  const subRegions: PageRegion[] = [];
  if (items.length === 0) return subRegions;

  // Sort by y
  const sorted = [...items].sort((a, b) => a.y - b.y);

  // Find large vertical gaps (white space between sections)
  const GAP_THRESHOLD = 24; // pixels
  const groups: ContentItem[][] = [];
  let currentGroup: ContentItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.y - (prev.y + prev.h);
    if (gap > GAP_THRESHOLD) {
      groups.push(currentGroup);
      currentGroup = [curr];
    } else {
      currentGroup.push(curr);
    }
  }
  groups.push(currentGroup);

  let sectionNum = 1;
  for (const group of groups) {
    if (group.length === 0) continue;
    const yMin = Math.min(...group.map(i => i.y));
    const yMax = Math.max(...group.map(i => i.y + i.h));

    // Detect pattern within this group
    const pattern = detectPattern(group, baseX);

    subRegions.push({
      type: 'main',
      label: pattern.type === 'unknown' ? `Section ${sectionNum}` : pattern.label,
      x: baseX, y: yMin,
      w: baseX2 - baseX, h: yMax - yMin,
      items: group,
    });
    sectionNum++;
  }

  return subRegions;
}

// ─── Pattern detection within a group of items ──────────────────────

interface PatternInfo {
  type: string;
  label: string;
}

function detectPattern(items: ContentItem[], _baseX: number): PatternInfo {
  const textItems = items.filter(i => i.text);

  // KPI card: large number + small label
  const largeNumbers = textItems.filter(i => i.fontSize >= 24);
  if (largeNumbers.length >= 1 && textItems.length <= 10) {
    return { type: 'kpi-card', label: 'KPI Card' };
  }

  // Bar chart: many vertically-aligned items with similar widths and small text
  const narrowBars = items.filter(i => i.w < 80 && i.h > 40 && !i.text);
  if (narrowBars.length >= 3) {
    return { type: 'bar-chart', label: 'Bar Chart' };
  }

  // Table: many text items with similar y alignment (rows)
  const yValues = textItems.map(i => i.y);
  const uniqueY = new Set(yValues.map(y => Math.round(y / 4) * 4));
  if (uniqueY.size >= 5 && textItems.length >= 10) {
    return { type: 'data-table', label: 'Data Table' };
  }

  // Menu list: items in a narrow vertical stack
  const xValues = textItems.map(i => i.x);
  const xVariance = variance(xValues);
  if (xVariance < 20 && textItems.length >= 4) {
    return { type: 'menu-list', label: 'Menu List' };
  }

  // Nav tabs: horizontal row of similarly-sized items
  if (textItems.length >= 3) {
    const allSmall = textItems.every(i => i.h < 40);
    const allCloseY = variance(textItems.map(i => i.y)) < 100;
    if (allSmall && allCloseY) {
      return { type: 'nav-tabs', label: 'Navigation Tabs' };
    }
  }

  // Alert/banner: single text item with a bgColor
  const withBg = items.filter(i => i.bgColor);
  if (withBg.length === 1 && textItems.length <= 2) {
    return { type: 'alert', label: 'Alert Banner' };
  }

  // Button: rounded shape with text
  const rounded = items.filter(i => i.cornerRadius > 4 && i.text);
  if (rounded.length >= 1) {
    return { type: 'button', label: 'Button Group' };
  }

  return { type: 'unknown', label: `Content` };
}

function clusterByY(values: number[], threshold: number): number[][] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
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

// ─── HTML Renderer ─────────────────────────────────────────────────

export function renderToHtml(result: RegionResult): string {
  const { allText, pageW } = result;
  const texts = allText.filter(i => i.text);
  
  // Scale factor for rendering
  const scaleX = 100 / pageW;
  
  const lines: string[] = [];
  lines.push('<template>');
  lines.push(`<div class="relative min-h-screen bg-white font-sans text-xs" style="font-size:12px">`);
  
  // Sort all text by y, then x
  const sorted = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  
  // Group by y to detect rows
  const rows = groupByY(sorted, 8);
  
  for (const row of rows) {
    const xSorted = [...row].sort((a, b) => a.x - b.x);
    const minY = Math.min(...row.map(i => i.y));
    
    lines.push(`  <div style="display:flex; align-items:flex-start; padding:2px 0; min-height:${Math.max(20, row[0]?.h || 20)}px">`);
    
    for (const item of xSorted) {
      const left = Math.round(item.x * scaleX);
      const size = fontSizeClass(item.fontSize);
      const weight = item.fontWeight === 'bold' ? 'font-bold' : '';
      const color = item.color ? inlineColor(item.color) : 'text-gray-900';
      const bg = item.bgColor ? inlineBg(item.bgColor) : '';
      const margin = left > 0 ? `ml-[${left}%]` : '';
      const br = item.cornerRadius > 4 ? 'rounded' : '';
      
      const classes = [size, weight, color, bg, margin, br].filter(Boolean).join(' ');
      const tag = item.fontSize >= 20 ? 'h2' : item.fontSize >= 16 ? 'h3' : 'span';
      
      lines.push(`      <${tag} class="${classes} whitespace-nowrap">${escapeHtml(item.text)}</${tag}>`);
    }
    
    lines.push('  </div>');
  }
  
  lines.push('</div>');
  lines.push('</template>');
  lines.push('');
  lines.push('<script setup lang="ts">');
  lines.push(`// Page: ${result.pageName}`);
  lines.push(`// Size: ${result.pageW}x${result.pageH}`);
  lines.push(`// Text items: ${texts.length}`);
  lines.push('</script>');
  lines.push('');
  lines.push('<style scoped>');
  lines.push('/* Layout: exact-position rendering of design content */');
  lines.push('.font-sans { font-family: system-ui, -apple-system, sans-serif; }');
  for (const t of texts) {
    const hex = t.color || t.bgColor;
    if (hex && hex.startsWith('#')) {
      lines.push(`/* ${t.layerName}: ${hex} */`);
    }
  }
  lines.push('</style>');
  
  return lines.join('\n');
}

// ─── LLM Prompt Builder ────────────────────────────────────────────

/** Build a concise design description for the LLM (not a 1000-node tree) */
export function buildLlmPrompt(result: RegionResult): string {
  const lines: string[] = [];
  lines.push(`## Page: ${result.pageName} (${result.pageW}x${result.pageH}px)`);
  lines.push('');
  
  for (const region of result.regions) {
    const texts = region.items.filter(i => i.text);
    if (texts.length === 0) continue;
    
    lines.push(`### ${region.label} (x:${region.x}, y:${region.y}, ${region.w}x${region.h}px)`);
    
    // Group texts by y-position
    const sorted = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
    
    for (const item of sorted) {
      const fg = item.color ? ` color:${item.color}` : '';
      const bg = item.bgColor ? ` bg:${item.bgColor}` : '';
      const sz = item.fontSize ? ` ${item.fontSize}px` : '';
      const wt = item.fontWeight === 'bold' ? ' bold' : '';
      const tag = item.fontSize >= 24 ? 'H2' : item.fontSize >= 16 ? 'H3' : 'TEXT';
      lines.push(`  [${tag}] "${item.text}" (at ${item.x},${item.y}${sz}${wt}${fg}${bg})`);
    }
    lines.push('');
  }
  
  lines.push('### Instructions');
  lines.push('Generate a Vue 3 + Tailwind CSS component that reproduces this design exactly.');
  lines.push('1. Use the EXACT text content above — do not change a single character.');
  lines.push('2. Use the EXACT colors (hex values) for backgrounds and text.');
  lines.push('3. Match the font sizes and weights shown.');
  lines.push('4. The sidebar is on the LEFT (narrow). Main content is on the RIGHT (wide).');
  lines.push('5. Use semantic HTML: aside for sidebar, main for content, header for top elements.');
  lines.push('6. Render bar chart data as actual visual bars with labels.');
  lines.push('7. KPI numbers should be LARGE and prominent.');
  lines.push('');
  lines.push('Return ONLY a JSON object: {"template":"...","script":"...","style":"..."}');
  
  return lines.join('\n');
}

function groupByY(items: ContentItem[], threshold: number): ContentItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const groups: ContentItem[][] = [[sorted[0]]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (Math.abs(curr.y - prev.y) <= threshold) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }
  
  return groups;
}

function fontSizeClass(px: number): string {
  if (px >= 28) return 'text-2xl';
  if (px >= 24) return 'text-xl';
  if (px >= 20) return 'text-lg';
  if (px >= 16) return 'text-base';
  if (px >= 14) return 'text-sm';
  if (px >= 12) return 'text-xs';
  return 'text-[10px]';
}

function inlineColor(hex: string): string {
  if (!hex) return '';
  // Use arbitrary Tailwind values for faithful color reproduction
  return `text-[${hex}]`;
}

function inlineBg(hex: string): string {
  if (!hex) return '';
  return `bg-[${hex}]`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hexBrightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + Math.abs(v - m), 0) / arr.length;
}
