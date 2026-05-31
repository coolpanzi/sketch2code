/**
 * Phase 3: Layout Converter
 * Converts absolute positioning to flex/grid CSS layouts.
 * Detects row, column, grid, and space-between patterns among sibling layers.
 */

import type {
  Layer,
  CSSPropertiesMap,
  LayoutConvertResult,
} from '../types.js';
import { LayerType } from '../types.js';

// ─── Layout Pattern Detection Types ────────────────────────────────────────

interface LayerBounds {
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type LayoutPattern = 'row' | 'column' | 'grid' | 'space-between' | 'none';

interface PatternDetection {
  pattern: LayoutPattern;
  gap: number;
  confidence: number;
}

// ─── Layout Converter ───────────────────────────────────────────────────────

/**
 * Converts absolute-positioned CSS to flex/grid layouts.
 * Analyzes sibling relationships within containers to detect layout patterns.
 */
export class LayoutConverter {
  private cssMap!: CSSPropertiesMap;
  private layerClassMap!: Map<string, string>;
  private convertedClasses: string[] = [];

  /**
   * Main entry point: converts absolute positioning to flex/grid in the CSS map.
   *
   * @param cssMap - The CSS properties map from Phase 1
   * @param artboard - The root artboard layer (used for layer tree traversal)
   * @param layerClassMap - Map of layerId -> className from Phase 1
   * @returns Updated CSS map and list of converted class names
   */
  convert(cssMap: CSSPropertiesMap, artboard: Layer, layerClassMap: Map<string, string>): LayoutConvertResult {
    this.cssMap = JSON.parse(JSON.stringify(cssMap)); // Deep clone to avoid mutation
    this.layerClassMap = layerClassMap;
    this.convertedClasses = [];

    // Find all containers (layers with 2+ children) and analyze their children
    const layers =
      'layers' in artboard && Array.isArray((artboard as any).layers)
        ? (artboard as any).layers
        : [];

    this.processContainers(layers, this.cssMap);

    return {
      cssMap: this.cssMap,
      convertedClasses: this.convertedClasses,
    };
  }

  /**
   * Recursively processes all layers, looking for containers with convertible children.
   */
  private processContainers(
    layers: Layer[],
    cssMap: CSSPropertiesMap
  ): void {
    for (const layer of layers) {
      if (
        'layers' in layer &&
        Array.isArray((layer as any).layers)
      ) {
        const children = (layer as any).layers as Layer[];

        if (children.length >= 2) {
          this.analyzeAndConvertContainer(layer, children, cssMap);
        }

        // Recurse into children
        this.processContainers(children, cssMap);
      }
    }
  }

  /**
   * Looks up the CSS class name for a layer using the layerClassMap.
   */
  private findClassNameForLayer(layer: Layer): string | null {
    return this.layerClassMap.get(layer.id) || null;
  }

  /**
   * Analyzes children of a container layer to detect layout patterns.
   */
  private analyzeAndConvertContainer(
    parentLayer: Layer,
    children: Layer[],
    cssMap: CSSPropertiesMap
  ): void {
    const parentClassName = this.findClassNameForLayer(parentLayer);
    if (!parentClassName || !cssMap[parentClassName]) {
      return;
    }

    // Collect child bounds and class names
    const childBounds: LayerBounds[] = [];
    for (const child of children) {
      const childClassName = this.findClassNameForLayer(child);
      if (!childClassName || !cssMap[childClassName]) {
        continue;
      }
      childBounds.push({
        className: childClassName,
        x: child.rect.x,
        y: child.rect.y,
        width: child.rect.width,
        height: child.rect.height,
      });
    }

    if (childBounds.length < 2) {
      return;
    }

    // Detect layout pattern
    const detection = this.detectPattern(childBounds);
    if (detection.pattern === 'none') {
      return;
    }

    // Apply the layout conversion
    this.applyLayout(
      parentClassName,
      detection,
      childBounds,
      cssMap
    );

    this.convertedClasses.push(parentClassName);
  }

  /**
   * Detects the layout pattern among sibling elements.
   */
  private detectPattern(bounds: LayerBounds[]): PatternDetection {
    if (bounds.length === 2) {
      return this.detectTwoElementPattern(bounds);
    }

    if (bounds.length >= 4) {
      // Check for grid pattern first
      const grid = this.detectGridPattern(bounds);
      if (grid.pattern !== 'none') {
        return grid;
      }
    }

    // Check for row pattern
    const row = this.detectRowPattern(bounds);
    if (row.pattern !== 'none' && row.confidence > 0.6) {
      return row;
    }

    // Check for column pattern
    const col = this.detectColumnPattern(bounds);
    if (col.pattern !== 'none' && col.confidence > 0.6) {
      return col;
    }

    return { pattern: 'none', gap: 0, confidence: 0 };
  }

  /**
   * Detects patterns between exactly two elements.
   * Checks for space-between (elements at opposite horizontal/vertical ends).
   */
  private detectTwoElementPattern(bounds: LayerBounds[]): PatternDetection {
    const [a, b] = bounds;

    // Calculate container bounds
    const containerLeft = Math.min(a.x, b.x);
    const containerRight = Math.max(a.x + a.width, b.x + b.width);
    const containerTop = Math.min(a.y, b.y);
    const containerBottom = Math.max(a.y + a.height, b.y + b.height);
    const containerWidth = containerRight - containerLeft;
    const containerHeight = containerBottom - containerTop;

    // Space-between horizontally: elements are at opposite horizontal ends
    const isHorizontallyOpposite =
      Math.abs((a.x - containerLeft) + (b.x + b.width - containerRight)) <
      containerWidth * 0.15 &&
      Math.abs(a.y - b.y) < Math.max(a.height, b.height) * 0.5;

    // Space-between vertically: elements are at opposite vertical ends
    const isVerticallyOpposite =
      Math.abs((a.y - containerTop) + (b.y + b.height - containerBottom)) <
      containerHeight * 0.15 &&
      Math.abs(a.x - b.x) < Math.max(a.width, b.width) * 0.5;

    if (isHorizontallyOpposite) {
      const gap = Math.abs(b.x - (a.x + a.width));
      return {
        pattern: 'space-between',
        gap: Math.round(gap),
        confidence: 0.85,
      };
    }

    if (isVerticallyOpposite) {
      const gap = Math.abs(b.y - (a.y + a.height));
      return {
        pattern: 'space-between',
        gap: Math.round(gap),
        confidence: 0.85,
      };
    }

    // Check for simple row/column with 2 elements
    const avgHeight = (a.height + b.height) / 2;
    const avgWidth = (a.width + b.width) / 2;

    // Row check: y-coordinates similar, x increasing
    const ySimilar = Math.abs(a.y - b.y) < avgHeight * 0.2;
    if (ySimilar && b.x > a.x) {
      const gap = Math.round(Math.abs(b.x - (a.x + a.width)));
      return { pattern: 'row', gap, confidence: 0.7 };
    }

    // Column check: x-coordinates similar, y increasing
    const xSimilar = Math.abs(a.x - b.x) < avgWidth * 0.2;
    if (xSimilar && b.y > a.y) {
      const gap = Math.round(Math.abs(b.y - (a.y + a.height)));
      return { pattern: 'column', gap, confidence: 0.7 };
    }

    return { pattern: 'none', gap: 0, confidence: 0 };
  }

  /**
   * Detects a row layout pattern: elements aligned horizontally with increasing x.
   */
  private detectRowPattern(bounds: LayerBounds[]): PatternDetection {
    // Sort by y, then x
    const sorted = [...bounds].sort((a, b) => a.y - b.y || a.x - b.x);

    // Calculate average height
    const avgHeight = sorted.reduce((sum, b) => sum + b.height, 0) / sorted.length;

    // Check if y-coordinates are within 20% of average height
    const yMin = Math.min(...sorted.map((b) => b.y));
    const yMax = Math.max(...sorted.map((b) => b.y));
    const yRange = yMax - yMin;

    if (yRange > avgHeight * 0.2) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Check if x-coordinates are generally increasing
    let xIncreasing = true;
    let prevX = sorted[0].x;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x < prevX) {
        xIncreasing = false;
        break;
      }
      prevX = sorted[i].x;
    }

    if (!xIncreasing) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Calculate average gap between consecutive elements
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
      if (gap < 0) {
        // Overlapping elements - not a clean row
        return { pattern: 'none', gap: 0, confidence: 0 };
      }
      totalGap += gap;
    }
    const avgGap = Math.round(totalGap / (sorted.length - 1));

    return {
      pattern: 'row',
      gap: avgGap,
      confidence: 0.8,
    };
  }

  /**
   * Detects a column layout pattern: elements aligned vertically with increasing y.
   */
  private detectColumnPattern(bounds: LayerBounds[]): PatternDetection {
    // Sort by x, then y
    const sorted = [...bounds].sort((a, b) => a.x - b.x || a.y - b.y);

    // Calculate average width
    const avgWidth = sorted.reduce((sum, b) => sum + b.width, 0) / sorted.length;

    // Check if x-coordinates are within 20% of average width
    const xMin = Math.min(...sorted.map((b) => b.x));
    const xMax = Math.max(...sorted.map((b) => b.x));
    const xRange = xMax - xMin;

    if (xRange > avgWidth * 0.2) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Check if y-coordinates are generally increasing
    let yIncreasing = true;
    let prevY = sorted[0].y;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y < prevY) {
        yIncreasing = false;
        break;
      }
      prevY = sorted[i].y;
    }

    if (!yIncreasing) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Calculate average gap between consecutive elements
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height);
      if (gap < 0) {
        // Overlapping elements - not a clean column
        return { pattern: 'none', gap: 0, confidence: 0 };
      }
      totalGap += gap;
    }
    const avgGap = Math.round(totalGap / (sorted.length - 1));

    return {
      pattern: 'column',
      gap: avgGap,
      confidence: 0.8,
    };
  }

  /**
   * Detects a grid layout pattern: 4+ children arranged in regular rows and columns.
   */
  private detectGridPattern(bounds: LayerBounds[]): PatternDetection {
    if (bounds.length < 4) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Sort by position (top-to-bottom, left-to-right)
    const sorted = [...bounds].sort((a, b) => a.y - b.y || a.x - b.x);

    // Try to detect distinct row clusters by y-coordinate
    const rows: LayerBounds[][] = [];
    let currentRow: LayerBounds[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = currentRow[0];
      const curr = sorted[i];
      const avgHeight = (prev.height + curr.height) / 2;

      // If y is similar to the first element in current row, it belongs to this row
      if (Math.abs(curr.y - prev.y) < avgHeight * 0.3) {
        currentRow.push(curr);
      } else {
        rows.push(currentRow);
        currentRow = [curr];
      }
    }
    rows.push(currentRow);

    // Need at least 2 rows and 2 columns for a grid
    if (rows.length < 2) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    const minCols = Math.min(...rows.map((r) => r.length));
    if (minCols < 2) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    // Calculate column gaps (average gap within each row)
    let totalColGap = 0;
    let colGapCount = 0;
    for (const row of rows) {
      const rowSorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < rowSorted.length; i++) {
        totalColGap += rowSorted[i].x - (rowSorted[i - 1].x + rowSorted[i - 1].width);
        colGapCount++;
      }
    }
    const colGap = colGapCount > 0 ? Math.round(totalColGap / colGapCount) : 0;

    // Calculate row gaps
    let totalRowGap = 0;
    for (let i = 1; i < rows.length; i++) {
      const prevRowBottom = Math.max(...rows[i - 1].map((b) => b.y + b.height));
      const currRowTop = Math.min(...rows[i].map((b) => b.y));
      totalRowGap += currRowTop - prevRowBottom;
    }
    const rowGap = rows.length > 1 ? Math.round(totalRowGap / (rows.length - 1)) : 0;

    // If gaps are negative, elements overlap - not a clean grid
    if (colGap < 0 || rowGap < 0) {
      return { pattern: 'none', gap: 0, confidence: 0 };
    }

    return {
      pattern: 'grid',
      gap: Math.max(colGap, rowGap), // Use a single gap value
      confidence: 0.7,
    };
  }

  /**
   * Applies a detected layout pattern to the container and its children.
   */
  private applyLayout(
    parentClassName: string,
    detection: PatternDetection,
    childBounds: LayerBounds[],
    cssMap: CSSPropertiesMap
  ): void {
    const parentCSS = cssMap[parentClassName];
    if (!parentCSS) return;

    switch (detection.pattern) {
      case 'row':
        this.applyRowLayout(parentCSS, childBounds, cssMap, detection.gap);
        break;
      case 'column':
        this.applyColumnLayout(parentCSS, childBounds, cssMap, detection.gap);
        break;
      case 'grid':
        this.applyGridLayout(parentCSS, childBounds, cssMap, detection.gap);
        break;
      case 'space-between':
        this.applySpaceBetweenLayout(parentCSS, childBounds, cssMap, detection);
        break;
    }
  }

  /**
   * Applies a flex row layout to the container.
   * Converts parent position to relative with margin preserving original placement.
   */
  private applyRowLayout(
    parentCSS: Record<string, string>,
    childBounds: LayerBounds[],
    cssMap: CSSPropertiesMap,
    gap: number
  ): void {
    // Convert parent to flex row
    parentCSS['display'] = 'flex';
    parentCSS['flex-direction'] = 'row';
    if (gap > 0) {
      parentCSS['gap'] = `${gap}px`;
    }

    // Preserve original position as margin so the container doesn't jump to (0,0)
    // within its absolutely-positioned parent.
    this.preservePositionAsMargin(parentCSS);

    // Remove absolute positioning from children (they flow within the flex container)
    for (const child of childBounds) {
      const childCSS = cssMap[child.className];
      if (!childCSS) continue;

      delete childCSS['position'];
      delete childCSS['left'];
      delete childCSS['top'];
    }
  }

  /**
   * Applies a flex column layout to the container.
   * Converts parent position to relative with margin preserving original placement.
   */
  private applyColumnLayout(
    parentCSS: Record<string, string>,
    childBounds: LayerBounds[],
    cssMap: CSSPropertiesMap,
    gap: number
  ): void {
    // Convert parent to flex column
    parentCSS['display'] = 'flex';
    parentCSS['flex-direction'] = 'column';
    if (gap > 0) {
      parentCSS['gap'] = `${gap}px`;
    }

    // Preserve original position as margin
    this.preservePositionAsMargin(parentCSS);

    // Remove absolute positioning from children
    for (const child of childBounds) {
      const childCSS = cssMap[child.className];
      if (!childCSS) continue;

      delete childCSS['position'];
      delete childCSS['left'];
      delete childCSS['top'];
    }
  }

  /**
   * Applies a grid layout to the container.
   */
  private applyGridLayout(
    parentCSS: Record<string, string>,
    childBounds: LayerBounds[],
    cssMap: CSSPropertiesMap,
    gap: number
  ): void {
    // Detect grid columns by counting elements per row
    const sorted = [...childBounds].sort((a, b) => a.y - b.y || a.x - b.x);
    const yGroups: number[] = [];
    let currentY = sorted[0].y;
    let count = 0;
    const avgHeight = sorted.reduce((s, b) => s + b.height, 0) / sorted.length;

    for (const b of sorted) {
      if (Math.abs(b.y - currentY) > avgHeight * 0.3) {
        yGroups.push(count);
        count = 1;
        currentY = b.y;
      } else {
        count++;
      }
    }
    yGroups.push(count);

    const cols = Math.max(...yGroups);

    // Convert parent to CSS grid
    parentCSS['display'] = 'grid';
    parentCSS['grid-template-columns'] = `repeat(${cols}, 1fr)`;
    if (gap > 0) {
      parentCSS['gap'] = `${gap}px`;
    }

    // Preserve original position as margin
    this.preservePositionAsMargin(parentCSS);

    // Remove absolute positioning from children
    for (const child of childBounds) {
      const childCSS = cssMap[child.className];
      if (!childCSS) continue;

      delete childCSS['position'];
      delete childCSS['left'];
      delete childCSS['top'];
    }
  }

  /**
   * Applies a space-between layout to the container.
   */
  private applySpaceBetweenLayout(
    parentCSS: Record<string, string>,
    childBounds: LayerBounds[],
    cssMap: CSSPropertiesMap,
    detection: PatternDetection
  ): void {
    // Determine if horizontal or vertical space-between
    const sorted = [...childBounds].sort((a, b) => a.x - b.x);
    const [a, b] = sorted;

    const isHorizontal = Math.abs(a.y - b.y) < Math.max(a.height, b.height) * 0.5;

    parentCSS['display'] = 'flex';
    parentCSS['flex-direction'] = isHorizontal ? 'row' : 'column';
    parentCSS['justify-content'] = 'space-between';
    parentCSS['align-items'] = 'center';

    // Preserve original position as margin
    this.preservePositionAsMargin(parentCSS);

    // Remove absolute positioning from children
    for (const child of childBounds) {
      const childCSS = cssMap[child.className];
      if (!childCSS) continue;

      delete childCSS['position'];
      delete childCSS['left'];
      delete childCSS['top'];
    }
  }

  /**
   * Converts absolute position (left/top) to margin on a flex/grid container.
   * This prevents the container from jumping to (0,0) when switched to
   * position:relative inside an absolutely-positioned parent.
   */
  private preservePositionAsMargin(parentCSS: Record<string, string>): void {
    const left = parentCSS['left'];
    const top = parentCSS['top'];

    parentCSS['position'] = 'relative';

    // Convert left/top to margin-left/margin-top to preserve visual position
    if (left && left !== '0' && left !== '0px') {
      parentCSS['margin-left'] = left;
    }
    if (top && top !== '0' && top !== '0px') {
      parentCSS['margin-top'] = top;
    }

    delete parentCSS['left'];
    delete parentCSS['top'];
  }

}
