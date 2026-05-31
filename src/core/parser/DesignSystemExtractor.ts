/**
 * 修复后的设计系统提取器
 * 正确提取颜色、文本样式和组件信息
 */

import { DesignSystem, ColorDefinition, TextStyleDefinition, Layer, HexColor, UUID, LayerType } from '../types.js';

/**
 * 递归遍历所有图层
 */
function traverseAllLayers(layers: Layer[], callback: (layer: Layer) => void): void {
  for (const layer of layers) {
    callback(layer);
    if (layer.layers && Array.isArray(layer.layers)) {
      traverseAllLayers(layer.layers, callback);
    }
  }
}

/**
 * 修复后的设计系统提取器
 */
export class DesignSystemExtractor {
  /**
   * 提取设计系统
   */
  async extract(document: any, allLayers: Layer[]): Promise<{
    designSystem: DesignSystem;
    errors: Array<{ stage: string; message: string; details?: any }>;
    warnings: string[];
  }> {
    const errors = [];
    const warnings = [];

    try {
      // 提取颜色系统
      const colors = await this.extractColors(document, allLayers, warnings);

      // 提取文本样式
      const textStyles = await this.extractTextStyles(document, allLayers, warnings);

      // 提取图层样式
      const layerStyles = await this.extractLayerStyles(document, warnings);

      // 提取渐变系统
      const gradients = await this.extractGradients(document, warnings);

      // 提取间距系统
      const spacing = await this.extractSpacing(allLayers, warnings);

      const designSystem: DesignSystem = {
        colors,
        textStyles,
        layerStyles,
        gradients,
        spacing
      };

      return {
        designSystem,
        errors,
        warnings
      };

    } catch (error) {
      return {
        designSystem: this.createEmptyDesignSystem(),
        errors: [{
          stage: 'design-system-extraction',
          message: error instanceof Error ? error.message : String(error),
          details: error
        }],
        warnings
      };
    }
  }

  /**
   * 提取颜色系统（修复版）
   */
  private async extractColors(document: any, allLayers: Layer[], warnings: string[]): Promise<ColorDefinition[]> {
    const colors: ColorDefinition[] = [];
    const processedColors = new Set<HexColor>();

    // 第一步：从文档资产中提取
    const assets = (document as any).assets;
    if (assets && assets.colorAssets && Array.isArray(assets.colorAssets)) {
      for (const colorAsset of assets.colorAssets) {
        if (colorAsset && colorAsset.color) {
          const hex = this.parseColor(colorAsset.color);
          if (!processedColors.has(hex)) {
            colors.push({
              id: colorAsset.do_objectID || this.generateId(),
              name: colorAsset.name || hex,
              hex,
              usage: [],
              source: 'document'
            });
            processedColors.add(hex);
          }
        }
      }
    }

    // 第二步：从实际使用的图层中提取常用颜色
    const colorUsage = new Map<HexColor, Set<string>>();

    // 递归遍历所有图层收集颜色
    // 注意：document.pages中的artboards已经包含解析后的图层数据
    for (const page of (document as any).pages || []) {
      // 遍历页面的artboards
      for (const artboard of page.artboards || []) {
        this.collectColorFromLayer(artboard, colorUsage);
      }
    }

    // 如果上面的方法没有找到颜色，尝试从allLayers中收集
    if (colorUsage.size === 0 && allLayers && allLayers.length > 0) {
      for (const layer of allLayers) {
        this.collectColorFromLayer(layer, colorUsage);
      }
    }

    // 按使用频率排序，提取常用颜色
    const sortedColors = Array.from(colorUsage.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 30); // 取前30个

    for (const [hex, usageSet] of sortedColors) {
      if (!processedColors.has(hex)) {
        const usage = Array.from(usageSet);
        colors.push({
          id: this.generateId(),
          name: this.generateColorName(hex, usage),
          hex,
          usage,
          source: 'extracted'
        });
        processedColors.add(hex);
      }
    }

    // 如果没有提取到颜色，添加默认颜色
    if (colors.length === 0) {
      warnings.push('No colors found in document or layers, adding default colors');
      colors.push(
        { id: this.generateId(), name: '#000000', hex: '#000000', usage: [], source: 'extracted' },
        { id: this.generateId(), name: '#FFFFFF', hex: '#FFFFFF', usage: [], source: 'extracted' },
        { id: this.generateId(), name: '#999999', hex: '#999999', usage: [], source: 'extracted' }
      );
    }

    return colors;
  }

  /**
   * 从图层中收集颜色使用情况
   */
  private collectColorFromLayer(layer: any, colorUsage: Map<HexColor, Set<string>>): void {
    if (!layer) return;

    // 收集文本颜色
    if (layer.type === LayerType.TEXT && layer.textStyle && layer.textStyle.color) {
      const color = layer.textStyle.color;
      if (!colorUsage.has(color)) {
        colorUsage.set(color, new Set());
      }
      colorUsage.get(color)!.add(layer.name || 'Unknown');
    }

    // 收集填充颜色
    if (layer.fills && Array.isArray(layer.fills)) {
      for (const fill of layer.fills) {
        if (fill.type === 'color' && fill.color && fill.isEnabled) {
          if (!colorUsage.has(fill.color)) {
            colorUsage.set(fill.color, new Set());
          }
          colorUsage.get(fill.color)!.add(layer.name || 'Unknown');
        }
      }
    }

    // 收集边框颜色
    if (layer.borders && Array.isArray(layer.borders)) {
      for (const border of layer.borders) {
        if (border.isEnabled && border.color) {
          if (!colorUsage.has(border.color)) {
            colorUsage.set(border.color, new Set());
          }
          colorUsage.get(border.color)!.add(layer.name || 'Unknown');
        }
      }
    }

    // 递归处理子图层
    if (layer.layers && Array.isArray(layer.layers)) {
      for (const subLayer of layer.layers) {
        this.collectColorFromLayer(subLayer, colorUsage);
      }
    }
  }

  /**
   * 提取文本样式（修复版）
   */
  private async extractTextStyles(document: any, allLayers: Layer[], warnings: string[]): Promise<TextStyleDefinition[]> {
    const textStyles: TextStyleDefinition[] = [];
    const processedStyles = new Map<string, TextStyleDefinition>();

    // 第一步：从文档文本样式中提取
    if (document.layerTextStyles && Array.isArray(document.layerTextStyles)) {
      for (const textStyleContainer of document.layerTextStyles) {
        if (textStyleContainer && textStyleContainer.style) {
          const ts = textStyleContainer.style;
          const style: TextStyleDefinition = {
            id: textStyleContainer.do_objectID || this.generateId(),
            name: textStyleContainer.name || 'Untitled',
            fontFamily: ts.font?.name || 'Unknown',
            fontSize: ts.font?.size || 12,
            fontWeight: this.detectFontWeight(ts.font?.name || ''),
            color: this.parseColor(ts.foregroundColor),
            lineHeight: ts.lineHeight,
            letterSpacing: ts.kerning,
            textAlign: this.getAlignName(ts.alignment || 0)
          };

          const key = `${style.fontFamily}-${style.fontSize}-${style.fontWeight}-${style.color}`;
          processedStyles.set(key, style);
        }
      }
    }

    // 第二步：从实际使用的文本图层中提取
    const textStyleUsage = new Map<string, number>();

    // 递归遍历所有图层收集文本样式
    for (const page of (document as any).pages || []) {
      for (const artboard of page.artboards || []) {
        this.collectTextStyleFromLayer(artboard, processedStyles, textStyleUsage);
      }
    }

    // 如果上面的方法没有找到文本样式，尝试从allLayers中收集
    if (textStyleUsage.size === 0 && allLayers && allLayers.length > 0) {
      for (const layer of allLayers) {
        this.collectTextStyleFromLayer(layer, processedStyles, textStyleUsage);
      }
    }

    // 只保留被多次使用的样式或在文档中定义的样式
    for (const [key, style] of processedStyles) {
      const usageCount = textStyleUsage.get(key) || 0;
      if (usageCount > 1 || style.name !== 'Untitled') {
        textStyles.push(style);
      }
    }

    // 按使用频率排序
    textStyles.sort((a, b) => {
      const keyA = `${a.fontFamily}-${a.fontSize}-${a.fontWeight}-${a.color}`;
      const keyB = `${b.fontFamily}-${b.fontSize}-${b.fontWeight}-${b.color}`;
      const usageA = textStyleUsage.get(keyA) || 0;
      const usageB = textStyleUsage.get(keyB) || 0;
      return usageB - usageA;
    });

    if (textStyles.length === 0) {
      warnings.push('No text styles found in document or layers');
    }

    return textStyles;
  }

  /**
   * 从图层中收集文本样式
   */
  private collectTextStyleFromLayer(
    layer: any,
    processedStyles: Map<string, TextStyleDefinition>,
    textStyleUsage: Map<string, number>
  ): void {
    if (!layer) return;

    if (layer.type === LayerType.TEXT && layer.textStyle) {
      const textStyle = layer.textStyle;
      const key = `${textStyle.fontFamily}-${textStyle.fontSize}-${textStyle.fontWeight}-${textStyle.color}`;

      if (!processedStyles.has(key)) {
        processedStyles.set(key, {
          id: this.generateId(),
          name: `文本样式${processedStyles.size + 1}`,
          fontFamily: textStyle.fontFamily,
          fontSize: textStyle.fontSize,
          fontWeight: textStyle.fontWeight,
          color: textStyle.color,
          lineHeight: textStyle.lineHeight,
          letterSpacing: textStyle.letterSpacing,
          textAlign: textStyle.textAlign
        });
      }

      textStyleUsage.set(key, (textStyleUsage.get(key) || 0) + 1);
    }

    // 递归处理子图层
    if (layer.layers && Array.isArray(layer.layers)) {
      for (const subLayer of layer.layers) {
        this.collectTextStyleFromLayer(subLayer, processedStyles, textStyleUsage);
      }
    }
  }

  /**
   * 提取图层样式
   */
  private async extractLayerStyles(document: any, warnings: string[]): Promise<any[]> {
    const layerStyles: any[] = [];

    if (document.layerStyles && Array.isArray(document.layerStyles)) {
      for (const styleContainer of document.layerStyles) {
        if (styleContainer && styleContainer.style) {
          const style = styleContainer.style;

          layerStyles.push({
            id: styleContainer.do_objectID || this.generateId(),
            name: styleContainer.name || 'Untitled',
            fills: this.extractFills(style.fills || []),
            borders: this.extractBorders(style.borders || []),
            shadows: this.extractShadows(style.shadows || [])
          });
        }
      }
    }

    if (layerStyles.length === 0) {
      warnings.push('No layer styles found in document');
    }

    return layerStyles;
  }

  /**
   * 提取渐变系统
   */
  private async extractGradients(document: any, warnings: string[]): Promise<any[]> {
    const gradients: any[] = [];

    const assets = (document as any).assets;
    if (assets && assets.gradientAssets && Array.isArray(assets.gradientAssets)) {
      for (const gradientAsset of assets.gradientAssets) {
        if (gradientAsset && gradientAsset.gradient) {
          const gradient = gradientAsset.gradient;
          const stops = gradient.stops || [];

          gradients.push({
            type: this.getGradientTypeName(gradient.gradientType || 0),
            from: this.parsePoint(gradient.from),
            to: this.parsePoint(gradient.to),
            stops: stops.map((stop: any) => ({
              color: this.parseColor(stop.color),
              position: stop.position || 0
            }))
          });
        }
      }
    }

    if (gradients.length === 0) {
      warnings.push('No gradients found in document assets');
    }

    return gradients;
  }

  /**
   * 提取间距系统
   */
  private async extractSpacing(allLayers: Layer[], warnings: string[]): Promise<number[]> {
    const spacingValues = new Set<number>();

    // 收集图层的位置和尺寸信息
    for (const layer of allLayers) {
      // 收集x, y坐标（作为可能的间距值）
      if (layer.rect.x > 0) spacingValues.add(Math.round(layer.rect.x));
      if (layer.rect.y > 0) spacingValues.add(Math.round(layer.rect.y));

      // 收集宽度和高度
      if (layer.rect.width > 0) spacingValues.add(Math.round(layer.rect.width));
      if (layer.rect.height > 0) spacingValues.add(Math.round(layer.rect.height));
    }

    // 转换为数组并排序
    const sortedSpacing = Array.from(spacingValues).sort((a, b) => a - b);

    // 如果没有找到间距值，添加默认间距
    if (sortedSpacing.length === 0) {
      warnings.push('No spacing values found, adding default spacing');
      return [4, 8, 12, 16, 24, 32, 48, 64];
    }

    return sortedSpacing.slice(0, 20); // 最多返回20个间距值
  }

  /**
   * 提取填充样式
   */
  private extractFills(fills: any[]): any[] {
    const result: any[] = [];

    for (const fill of fills) {
      if (fill.isEnabled === false) continue;

      const fillType = fill.fillType || 0;

      if (fillType === 0) {
        result.push({
          type: 'color',
          color: this.parseColor(fill.color),
          opacity: fill.opacity ?? 1,
          isEnabled: true
        });
      } else if (fillType === 1) {
        const gradient = fill.gradient || {};
        result.push({
          type: 'gradient',
          color: '',
          opacity: fill.opacity ?? 1,
          isEnabled: true,
          gradient: {
            type: this.getGradientTypeName(gradient.gradientType || 0),
            from: this.parsePoint(gradient.from),
            to: this.parsePoint(gradient.to),
            stops: (gradient.stops || []).map((stop: any) => ({
              color: this.parseColor(stop.color),
              position: stop.position || 0
            }))
          }
        });
      }
    }

    return result;
  }

  /**
   * 提取边框样式
   */
  private extractBorders(borders: any[]): any[] {
    const result: any[] = [];

    for (const border of borders) {
      if (border.isEnabled === false) continue;

      result.push({
        color: this.parseColor(border.color),
        thickness: border.thickness || 1,
        position: this.getBorderPositionName(border.position || 0),
        opacity: border.contextSettings?.opacity ?? 1,
        isEnabled: true
      });
    }

    return result;
  }

  /**
   * 提取阴影样式
   */
  private extractShadows(shadows: any[]): any[] {
    const result: any[] = [];

    for (const shadow of shadows) {
      if (shadow.isEnabled === false) continue;

      result.push({
        color: this.parseColor(shadow.color),
        blurRadius: shadow.radius || shadow.blurRadius || 0,
        offsetX: shadow.offset?.width || shadow.offsetX || 0,
        offsetY: shadow.offset?.height || shadow.offsetY || 0,
        spread: shadow.spread || 0,
        isEnabled: true,
        isInner: shadow._class === 'innerShadow'
      });
    }

    return result;
  }

  /**
   * 生成颜色名称
   */
  private generateColorName(hex: string, usage: string[]): string {
    // 根据使用情况生成有意义的名称
    if (usage.length > 10) {
      return `${hex} (主要颜色)`;
    } else if (usage.length > 5) {
      return `${hex} (常用颜色)`;
    } else {
      return hex;
    }
  }

  /**
   * 创建空的设计系统
   */
  private createEmptyDesignSystem(): DesignSystem {
    return {
      colors: [],
      textStyles: [],
      layerStyles: [],
      gradients: [],
      spacing: []
    };
  }

  // ─── 辅助方法 ─────────────────────────────────────────────────────

  private parseColor(color: any): string {
    if (!color) return '#000000';
    if (typeof color === 'string' && color.startsWith('#')) return color;

    const r = Math.round((color.red ?? 0) * 255);
    const g = Math.round((color.green ?? 0) * 255);
    const b = Math.round((color.blue ?? 0) * 255);

    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  private parsePoint(pointStr: string): { x: number; y: number } {
    if (!pointStr) return { x: 0, y: 0 };

    const match = pointStr.match(/\{([^,]+),\s*([^}]+)\}/);
    if (match) {
      return { x: parseFloat(match[1]) || 0, y: parseFloat(match[2]) || 0 };
    }

    return { x: 0, y: 0 };
  }

  private detectFontWeight(fontName: string): string {
    const name = fontName.toUpperCase();
    if (name.includes('BOLD')) return 'bold';
    if (name.includes('LIGHT')) return '300';
    if (name.includes('MEDIUM')) return '500';
    if (name.includes('HEAVY') || name.includes('EXTRA')) return '800';
    if (name.includes('THIN')) return '100';
    return 'normal';
  }

  private getAlignName(alignment: number): 'left' | 'center' | 'right' | 'justified' {
    const aligns: Array<'left' | 'center' | 'right' | 'justified'> = ['left', 'right', 'center', 'justified'];
    return aligns[alignment] || 'left';
  }

  private getGradientTypeName(type: number): 'linear' | 'radial' | 'angular' {
    const types: Array<'linear' | 'radial' | 'angular'> = ['linear', 'radial', 'angular'];
    return types[type] || 'linear';
  }

  private getBorderPositionName(position: number): 'center' | 'inside' | 'outside' {
    const positions: Array<'center' | 'inside' | 'outside'> = ['center', 'inside', 'outside'];
    return positions[position] || 'center';
  }

  private generateId(): UUID {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 便捷函数：提取设计系统
 */
export async function extractDesignSystemFixed(document: any, allLayers: Layer[]): Promise<{
  designSystem: DesignSystem;
  errors: Array<{ stage: string; message: string; details?: any }>;
  warnings: string[];
}> {
  const extractor = new DesignSystemExtractorFixed();
  return await extractor.extract(document, allLayers);
}
