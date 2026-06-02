/**
 * 图层拍平器 — 消除 Sketch 中无意义的嵌套组
 *
 * 原则：
 * - 只有1个子元素的组 → 直接提升子元素，跳过该组
 * - 没有背景色/边框/阴影且子元素方向一致的组 → 拍平
 * - 有背景色或有明确视觉边界的组 → 保留为语义容器
 * - 8+ 个尺寸模式重复的子元素 → 保留为列表/表格容器
 */

import type { Layer } from '../types.js';
import { LayerType } from '../types.js';

export interface FlattenResult {
  layers: Layer[];
  removedCount: number;
}

/**
 * 判断一个组是否应该被拍平（子元素提升到父级）
 */
function shouldFlatten(layer: Layer): boolean {
  if (layer.type !== LayerType.GROUP) return false;
  if (!('layers' in layer) || !Array.isArray((layer as any).layers)) return false;

  const children = (layer as any).layers as Layer[];
  if (children.length === 0) return true; // 空组直接移除

  // 规则1: 只有一个子元素 → 拍平
  if (children.length === 1) return true;

  // 规则2: 8+ 个尺寸类似的子元素 → 可能是列表/表格，保留
  if (children.length >= 8) {
    const similarSized = checkSimilarSizes(children);
    if (similarSized) return false;
  }

  // 规则3: 没有视觉样式（背景色/边框/阴影）→ 倾向于拍平
  const hasVisualStyle = checkHasVisualStyle(layer);
  if (!hasVisualStyle) {
    // 检查子元素是否在同一个方向上排列
    const allSameDirection = checkSameDirection(children);
    if (allSameDirection) return true;
  }

  return false;
}

/**
 * 检查子元素尺寸是否相似（用于判断列表/表格）
 */
function checkSimilarSizes(children: Layer[]): boolean {
  if (children.length < 3) return false;

  const widths = children.map(c => c.rect.width);
  const heights = children.map(c => c.rect.height);

  const avgW = widths.reduce((a, b) => a + b, 0) / widths.length;
  const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;

  const wVariance = widths.map(w => Math.abs(w - avgW)).reduce((a, b) => a + b, 0) / widths.length;
  const hVariance = heights.map(h => Math.abs(h - avgH)).reduce((a, b) => a + b, 0) / heights.length;

  // 尺寸差异小于 15% → 认为是相似尺寸
  return wVariance / avgW < 0.15 && hVariance / avgH < 0.15;
}

/**
 * 检查组是否有可见的视觉样式
 */
function checkHasVisualStyle(layer: Layer): boolean {
  const shape = layer as any;

  // 背景填充
  if (shape.fills && Array.isArray(shape.fills)) {
    const hasFill = shape.fills.some((f: any) =>
      f.isEnabled && (f.type === 'color' || f.type === 'gradient')
    );
    if (hasFill) return true;
  }

  // 边框
  if (shape.borders && Array.isArray(shape.borders)) {
    const hasBorder = shape.borders.some((b: any) => b.isEnabled);
    if (hasBorder) return true;
  }

  // 阴影
  if (shape.shadows && Array.isArray(shape.shadows)) {
    const hasShadow = shape.shadows.some((s: any) => s.isEnabled);
    if (hasShadow) return true;
  }

  // 圆角
  if (layer.cornerRadius > 0) return true;

  // clipsContent (overflow: hidden) 表示有边界裁剪
  if (layer.clipsContent) return true;

  return false;
}

/**
 * 检查子元素是否在同一方向上排列
 * 通过比较 y 坐标变化和 x 坐标变化来判断
 */
function checkSameDirection(children: Layer[]): boolean {
  if (children.length < 2) return true;

  const xs = children.map(c => c.rect.x + c.rect.width / 2); // 中心点 x
  const ys = children.map(c => c.rect.y + c.rect.height / 2); // 中心点 y

  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);

  const avgSize = children.reduce((s, c) => s + (c.rect.width + c.rect.height) / 2, 0) / children.length;

  // 如果 x 方向变化远大于 y 方向 → 水平排列
  if (xRange > yRange * 2 && yRange < avgSize * 0.5) return true;

  // 如果 y 方向变化远大于 x 方向 → 垂直排列
  if (yRange > xRange * 2 && xRange < avgSize * 0.5) return true;

  // x 和 y 都有变化 → 可能是网格或不规则布局，不拍平
  return false;
}

/**
 * 拍平一组图层（只对需要拍平的组递归操作）
 */
function flattenLayers(layers: Layer[], removedCount: { count: number }): Layer[] {
  const result: Layer[] = [];

  for (const layer of layers) {
    if (layer.type === LayerType.GROUP) {
      // 先递归拍平子层
      if ('layers' in layer && Array.isArray((layer as any).layers)) {
        (layer as any).layers = flattenLayers((layer as any).layers, removedCount);
      }

      // 判断是否拍平当前组
      if (shouldFlatten(layer)) {
        removedCount.count++;
        // 将子元素提升到当前层级，保持其原始坐标
        const children = (layer as any).layers || [];
        result.push(...children);
      } else {
        result.push(layer);
      }
    } else if (layer.type === LayerType.ARTBOARD || layer.type === LayerType.COMPONENT) {
      // Artboard 和 Component 永远保留，但递归拍平内部
      if ('layers' in layer && Array.isArray((layer as any).layers)) {
        (layer as any).layers = flattenLayers((layer as any).layers, removedCount);
      }
      result.push(layer);
    } else {
      result.push(layer);
    }
  }

  return result;
}

/**
 * 主入口：拍平 Artboard 内的无效嵌套
 */
export function flattenArtboard(layer: Layer): FlattenResult {
  if (layer.type !== LayerType.ARTBOARD && layer.type !== LayerType.COMPONENT) {
    return { layers: [layer], removedCount: 0 };
  }

  const removedCount = { count: 0 };

  if ('layers' in layer && Array.isArray((layer as any).layers)) {
    (layer as any).layers = flattenLayers((layer as any).layers, removedCount);
  }

  return { layers: [layer], removedCount: removedCount.count };
}
