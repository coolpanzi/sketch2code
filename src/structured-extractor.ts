/**
 * Structured Data Extractor
 * Walks the parsed Sketch layer tree and extracts every precise data point:
 * - Text content with positions
 * - Colors with usage counts
 * - Layout structure hints
 * - Image references
 *
 * Output is a structured text block meant to be injected into a vision model prompt.
 */

import type { Layer, SketchFile, DesignSystem } from './core/types.js';
import { LayerType } from './core/types.js';

export interface StructuredData {
  /** Human-readable summary for the vision model prompt */
  promptBlock: string;
  /** Raw data for potential programmatic use */
  raw: {
    textItems: TextItem[];
    colors: ColorItem[];
    layoutSections: LayoutSection[];
    imageRefs: string[];
  };
}

export interface TextItem {
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layerName: string;
  parentName: string;
}

export interface ColorItem {
  hex: string;
  count: number;
  usedBy: string[];
}

export interface LayoutSection {
  type: 'header' | 'sidebar' | 'main' | 'footer' | 'top-bar' | 'unknown';
  bounds: { x: number; y: number; width: number; height: number };
  textSummary: string;
}

/**
 * Extract structured data from a parsed Sketch file.
 */
export function extractStructuredData(sketchFile: SketchFile, artboardIndex: number = 0): StructuredData {
  const allTextItems: TextItem[] = [];
  const colorMap = new Map<string, { count: number; usedBy: Set<string> }>();
  const imageRefs: string[] = [];

  // Walk all layers recursively
  const walkLayers = (layers: Layer[], parentName: string) => {
    for (const layer of layers) {
      // Collect text
      if (layer.type === LayerType.TEXT) {
        const textLayer = layer as any;
        if (textLayer.content && textLayer.content.trim()) {
          allTextItems.push({
            content: textLayer.content.trim(),
            x: Math.round(textLayer.rect.x),
            y: Math.round(textLayer.rect.y),
            width: Math.round(textLayer.rect.width),
            height: Math.round(textLayer.rect.height),
            layerName: textLayer.name,
            parentName,
          });
        }
      }

      // Collect colors from shapes
      if (layer.type === LayerType.SHAPE) {
        const shape = layer as any;
        if (shape.fills) {
          for (const fill of shape.fills) {
            if (fill.isEnabled && fill.color && fill.type === 'color') {
              const hex = typeof fill.color === 'string' ? fill.color : extractHex(fill.color);
              if (hex && hex !== 'transparent') {
                const entry = colorMap.get(hex) || { count: 0, usedBy: new Set<string>() };
                entry.count++;
                entry.usedBy.add(layer.name);
                colorMap.set(hex, entry);
              }
            }
          }
        }
      }

      // Collect images
      if (layer.type === LayerType.IMAGE && (layer as any).imageData?.ref) {
        imageRefs.push((layer as any).imageData.ref);
      }

      // Recurse
      if ('layers' in layer && Array.isArray((layer as any).layers)) {
        walkLayers((layer as any).layers, layer.name);
      }
    }
  };

  // Resolve flat artboard index → [pageIdx, artboardInPage]
  let remaining = artboardIndex;
  let pageIdx = 0;
  let artboardInPage = 0;
  for (; pageIdx < sketchFile.pages.length; pageIdx++) {
    const p = sketchFile.pages[pageIdx];
    const count = p.artboards.length > 0 ? p.artboards.length : (p.layers.length > 0 ? 1 : 0);
    if (remaining < count) {
      artboardInPage = remaining;
      break;
    }
    remaining -= count;
  }
  // If we went past all pages, use the last available
  if (pageIdx >= sketchFile.pages.length) {
    pageIdx = sketchFile.pages.length - 1;
    artboardInPage = 0;
  }

  const page = sketchFile.pages[pageIdx];
  const artboard = page.artboards.length > 0
    ? page.artboards[artboardInPage]
    : (page.layers.length > 0 ? page.layers[0] : undefined);
  if (artboard && 'layers' in artboard && Array.isArray((artboard as any).layers)) {
    walkLayers((artboard as any).layers, artboard.name);
  }

  // Build layout sections by clustering text by y-coordinate
  const layoutSections = buildLayoutSections(allTextItems);

  // Build prompt block
  const promptBlock = buildPromptBlock(allTextItems, colorMap, sketchFile.designSystem, layoutSections, imageRefs, artboard);

  const raw = {
    textItems: allTextItems,
    colors: Array.from(colorMap.entries()).map(([hex, v]) => ({
      hex,
      count: v.count,
      usedBy: Array.from(v.usedBy),
    })),
    layoutSections,
    imageRefs,
  };

  return { promptBlock, raw };
}

function extractHex(color: any): string {
  if (typeof color === 'string') return color;
  if (color.red !== undefined) {
    const r = Math.round((color.red ?? 0) * 255);
    const g = Math.round((color.green ?? 0) * 255);
    const b = Math.round((color.blue ?? 0) * 255);
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return '';
}

/**
 * Cluster text items into logical layout sections.
 */
function buildLayoutSections(textItems: TextItem[]): LayoutSection[] {
  if (textItems.length === 0) return [];

  // Sort by y, then x
  const sorted = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);

  // Find spatial clusters (elements close together in y)
  const sections: LayoutSection[] = [];
  let currentCluster: TextItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentCluster[currentCluster.length - 1];
    const gap = Math.abs(sorted[i].y - prev.y);
    // If gap is more than 80px, new cluster
    if (gap > 80) {
      sections.push(makeSection(currentCluster));
      currentCluster = [sorted[i]];
    } else {
      currentCluster.push(sorted[i]);
    }
  }
  sections.push(makeSection(currentCluster));

  return sections;
}

function makeSection(items: TextItem[]): LayoutSection {
  const xs = items.map(i => i.x);
  const ys = items.map(i => i.y);
  const rights = items.map(i => i.x + i.width);
  const bottoms = items.map(i => i.y + i.height);

  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...rights) - Math.min(...xs),
    height: Math.max(...bottoms) - Math.min(...ys),
  };

  // Classify: if y < 100 and spans full width → header
  const avgX = items.reduce((s, i) => s + i.x, 0) / items.length;
  let type: LayoutSection['type'] = 'unknown';
  if (bounds.y < 100 && bounds.width > 600) type = 'header';
  else if (avgX < 200 && bounds.height > 300) type = 'sidebar';
  else if (bounds.y > 600) type = 'footer';
  else type = 'main';

  const textSummary = items.map(i => `  "${i.content}"`).join('\n');

  return { type, bounds, textSummary };
}

function buildPromptBlock(
  textItems: TextItem[],
  colorMap: Map<string, { count: number; usedBy: Set<string> }>,
  designSystem: DesignSystem,
  sections: LayoutSection[],
  imageRefs: string[],
  artboard: Layer | undefined,
): string {
  const width = artboard ? Math.round(artboard.rect.width) : 1440;
  const height = artboard ? Math.round(artboard.rect.height) : 900;

  // Top colors by usage
  const topColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  const textByY = [...textItems].sort((a, b) => a.y - b.y || a.x - b.x);

  return `## CRITICAL: This is the EXACT data from the design. DO NOT invent or change any text, numbers, or colors.

### Page Dimensions
${width} × ${height}px

### LAYOUT STRUCTURE
${sections.map(s => `**[${s.type.toUpperCase()}]** at y=${s.bounds.y}, x=${s.bounds.x} — ${s.textSummary.split('\n').length} elements:
${s.textSummary}`).join('\n\n')}

### EVERY TEXT ELEMENT (top to bottom, left to right)
You MUST use these exact strings. No paraphrasing, no translation, no changes.
${textByY.slice(0, 80).map(t => `  [${t.x},${t.y}] "${t.content}"`).join('\n')}
${textItems.length > 80 ? `  ... and ${textItems.length - 80} more text elements (omitted for brevity, see screenshot)` : ''}

### EXACT COLOR PALETTE (use these hex values, DO NOT approximate)
${topColors.map(c => `  ${c[0]} — used ${c[1].count}× (e.g. "${[...c[1].usedBy].slice(0, 3).join('", "')}")`).join('\n')}

### DESIGN SYSTEM COLORS (from Sketch document)
${designSystem.colors.length > 0
    ? designSystem.colors.slice(0, 15).map(c => `  ${c.name}: ${c.hex}`).join('\n')
    : '  (none defined in document)'}

### IMAGE REFERENCES
${imageRefs.length > 0
    ? imageRefs.map(r => `  ${r}`).join('\n')
    : '  (no images in this artboard)'}

### RULES (violating any = FAIL)
1. Every visible text string MUST match the "EVERY TEXT ELEMENT" list exactly
2. Every color MUST come from the palette above — no approximations
3. ${width}×${height}px canvas — do not overflow or leave empty space
4. Use flexbox/grid, NOT position:absolute
5. Use CSS custom properties for colors: :root { --color-xxx: #HEX; }
6. Semantic HTML: <aside> for sidebar, <header> for top bar, <table> for data tables
7. For repeating patterns (table rows, list items, tabs) use v-for with realistic data arrays
8. SVG charts inline where the design has charts
9. Output ONLY the raw Vue SFC code, no markdown, no explanation`;
}
