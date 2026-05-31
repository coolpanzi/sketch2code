/**
 * 图层提取器
 * 负责从Sketch文档中提取并转换图层数据
 */

import { Layer, LayerType, BaseLayer, UUID, Rect, FillStyle, BorderStyle, ShadowStyle, BlendMode } from '../types.js';

/**
 * 图层提取结果
 */
export interface LayerExtractResult {
  artboards: Layer[];
  allLayers: Layer[];
  errors: Array<{ stage: string; message: string; details?: any }>;
  warnings: string[];
  statistics: {
    totalLayers: number;
    layersByType: Map<LayerType, number>;
    maxDepth: number;
  };
}

/**
 * 图层提取器
 */
export class LayerExtractor {
  /**
   * 提取图层数据
   */
  async extract(document: any): Promise<LayerExtractResult> {
    const errors: LayerExtractResult['errors'] = [];
    const warnings: string[] = [];
    const artboards: Layer[] = [];
    const allLayers: Layer[] = [];

    const statistics = {
      totalLayers: 0,
      layersByType: new Map<LayerType, number>(),
      maxDepth: 0
    };

    try {
      // 获取页面数据
      const pages = document.pages || [];

      // 提取每个页面的图层
      for (const pageData of pages) {
        const pageLayers = pageData.layers || [];

        for (const layerData of pageLayers) {
          const result = await this.parseLayer(layerData, 0, null, document);

          if (result.layer) {
            allLayers.push(result.layer);

            // 递归添加所有嵌套图层到allLayers
            this.addAllNestedLayers(result.layer, allLayers);

            statistics.totalLayers++;

            // 统计图层类型
            const typeCount = statistics.layersByType.get(result.layer.type) || 0;
            statistics.layersByType.set(result.layer.type, typeCount + 1);

            // 如果是artboard，添加到artboards列表
            if (result.layer.type === LayerType.ARTBOARD) {
              artboards.push(result.layer);
            }

            // 更新最大深度
            statistics.maxDepth = Math.max(statistics.maxDepth, result.depth);
          }

          if (result.warnings.length > 0) {
            warnings.push(...result.warnings);
          }
        }
      }

      return {
        artboards,
        allLayers,
        errors,
        warnings,
        statistics
      };

    } catch (error) {
      return {
        artboards: [],
        allLayers: [],
        errors: [{
          stage: 'layer-extraction',
          message: error instanceof Error ? error.message : String(error),
          details: error
        }],
        warnings,
        statistics
      };
    }
  }

  /**
   * 解析单个图层
   */
  private async parseLayer(
    layerData: any,
    depth: number,
    parent: Layer | null,
    document: any
  ): Promise<{
    layer?: Layer;
    warnings: string[];
    depth: number;
  }> {
    const warnings: string[] = [];

    if (!layerData || !layerData.do_objectID) {
      return { warnings, depth };
    }

    const frame = layerData.frame || { x: 0, y: 0, width: 0, height: 0 };
    const style = layerData.style || {};
    const contextSettings = style.contextSettings || {};

    // 确定图层类型
    const layerType = this.determineLayerType(layerData);

    // 基础属性
    const baseLayer: BaseLayer = {
      id: layerData.do_objectID,
      name: layerData.name || 'Untitled',
      type: layerType,
      visible: layerData.isVisible !== false,
      locked: layerData.isLocked || false,
      opacity: contextSettings.opacity ?? 1,
      blendMode: this.getBlendMode(contextSettings.blendMode || 0),
      rotation: layerData.rotation || 0,
      rect: {
        x: frame.x || 0,
        y: frame.y || 0,
        width: frame.width || 0,
        height: frame.height || 0
      },
      cornerRadius: layerData.radius || 0,
      clipsContent: layerData.hasClippingMask || false
    };

    // 根据类型构建具体图层
    let layer: Layer | undefined;

    switch (layerType) {
      case LayerType.TEXT:
        layer = this.parseTextLayer(layerData, baseLayer, warnings);
        break;

      case LayerType.SHAPE:
        layer = this.parseShapeLayer(layerData, baseLayer, style, warnings);
        break;

      case LayerType.IMAGE:
        layer = await this.parseImageLayer(layerData, baseLayer, warnings);
        break;

      case LayerType.GROUP:
        layer = this.parseGroupLayer(layerData, baseLayer, depth, document, warnings);
        break;

      case LayerType.ARTBOARD:
        layer = this.parseArtboardLayer(layerData, baseLayer, depth, document, warnings);
        break;

      case LayerType.SYMBOL:
        layer = this.parseSymbolLayer(layerData, baseLayer, warnings);
        break;

      case LayerType.COMPONENT:
        layer = this.parseComponentLayer(layerData, baseLayer, depth, document, warnings);
        break;

      default:
        warnings.push(`Unknown layer type: ${layerData._class}`);
        layer = { ...baseLayer, type: LayerType.UNKNOWN } as unknown as Layer;
    }

    return { layer, warnings, depth };
  }

  /**
   * 确定图层类型
   */
  private determineLayerType(layerData: any): LayerType {
    const classType = layerData._class || '';

    switch (classType) {
      case 'text':
      case 'MSImmutableTextLayer':
        return LayerType.TEXT;

      case 'rectangle':
      case 'oval':
      case 'star':
      case 'triangle':
      case 'polygon':
      case 'path':
      case 'shapePath':
        return LayerType.SHAPE;

      case 'bitmap':
        return LayerType.IMAGE;

      case 'group':
      case 'MSImmutableGroup':
        return LayerType.GROUP;

      case 'artboard':
      case 'MSImmutableArtboard':
        return LayerType.ARTBOARD;

      case 'symbolMaster':
        return LayerType.COMPONENT;

      case 'symbolInstance':
        return LayerType.SYMBOL;

      default:
        return LayerType.UNKNOWN;
    }
  }

  /**
   * 解析文本图层
   */
  private parseTextLayer(layerData: any, baseLayer: BaseLayer, warnings: string[]): Layer {
    let content = '';
    let textStyle: any;

    if (layerData.attributedString) {
      content = layerData.attributedString.string || '';
      const attributes = layerData.attributedString.attributes || [];

      if (attributes.length > 0) {
        const firstAttr = attributes[0].attributes || {};
        const fontAttr = firstAttr.MSAttributedStringFontAttribute || firstAttr.font || {};
        const colorAttr = firstAttr.MSAttributedStringColorAttribute || firstAttr.color;

        textStyle = {
          id: this.generateId(),
          name: 'Text Style',
          fontFamily: fontAttr.attributes?.name || fontAttr.name || 'Unknown',
          fontSize: fontAttr.attributes?.size || fontAttr.size || 12,
          fontWeight: this.detectFontWeight(fontAttr.attributes?.name || fontAttr.name || ''),
          color: this.parseColor(colorAttr),
          lineHeight: firstAttr.lineHeight,
          letterSpacing: firstAttr.kerning || 0,
          textAlign: this.getAlignName(firstAttr.paragraphStyle?.alignment || 0)
        };
      }
    }

    return {
      ...baseLayer,
      type: LayerType.TEXT,
      content,
      textStyle,
      attributedString: layerData.attributedString
    };
  }

  /**
   * 解析形状图层
   */
  private parseShapeLayer(layerData: any, baseLayer: BaseLayer, style: any, warnings: string[]): Layer {
    const fills = this.parseFills(style.fills || [], warnings);
    const borders = this.parseBorders(style.borders || [], warnings);
    const shadows = this.parseShadows(style.shadows || [], warnings);

    // 确定具体形状类型
    const classType = layerData._class || '';
    let shapeType: any = 'rectangle';

    switch (classType) {
      case 'oval':
        shapeType = 'oval';
        break;
      case 'star':
        shapeType = 'star';
        break;
      case 'triangle':
        shapeType = 'triangle';
        break;
      case 'polygon':
        shapeType = 'polygon';
        break;
      case 'path':
      case 'shapePath':
        shapeType = 'path';
        break;
    }

    return {
      ...baseLayer,
      type: LayerType.SHAPE,
      shapeType,
      fills,
      borders,
      shadows
    };
  }

  /**
   * 解析图像图层
   */
  private async parseImageLayer(layerData: any, baseLayer: BaseLayer, warnings: string[]): Promise<Layer> {
    const imageRef = layerData.image;

    let imageData: any = undefined;

    if (imageRef) {
      try {
        // 处理文件引用
        if (imageRef._class === 'MSJSONFileReference') {
          imageData = {
            ref: imageRef._ref || '',
            data: Buffer.alloc(0), // 占位数据
            width: baseLayer.rect.width,
            height: baseLayer.rect.height
          };
        }
        // 处理内联数据
        else if (imageRef._class === 'MSJSONOriginalDataReference' && imageRef.data?._data) {
          try {
            imageData = {
              ref: 'inline',
              data: Buffer.from(imageRef.data._data, 'base64'),
              width: baseLayer.rect.width,
              height: baseLayer.rect.height
            };
          } catch {
            warnings.push(`Failed to decode inline image data for layer: ${baseLayer.name}`);
          }
        }
      } catch (error) {
        warnings.push(`Failed to parse image data for layer: ${baseLayer.name}`);
      }
    }

    return {
      ...baseLayer,
      type: LayerType.IMAGE,
      imageData
    };
  }

  /**
   * 解析组合图层
   */
  private parseGroupLayer(
    layerData: any,
    baseLayer: BaseLayer,
    depth: number,
    document: any,
    warnings: string[]
  ): Layer {
    const subLayers: Layer[] = [];

    if (layerData.layers && Array.isArray(layerData.layers)) {
      for (const subLayerData of layerData.layers) {
        const result = this.parseLayerSync(subLayerData, depth + 1, baseLayer, document);
        if (result.layer) {
          subLayers.push(result.layer);
        }
        warnings.push(...result.warnings);
      }
    }

    return {
      ...baseLayer,
      type: LayerType.GROUP,
      layers: subLayers,
      layoutInfo: this.parseLayoutInfo(layerData)
    };
  }

  /**
   * 解析Artboard图层
   */
  private parseArtboardLayer(
    layerData: any,
    baseLayer: BaseLayer,
    depth: number,
    document: any,
    warnings: string[]
  ): Layer {
    const subLayers: Layer[] = [];

    if (layerData.layers && Array.isArray(layerData.layers)) {
      for (const subLayerData of layerData.layers) {
        const result = this.parseLayerSync(subLayerData, depth + 1, baseLayer, document);
        if (result.layer) {
          subLayers.push(result.layer);
        }
        warnings.push(...result.warnings);
      }
    }

    let backgroundColor: string | undefined;
    if (layerData.backgroundColor) {
      backgroundColor = this.parseColor(layerData.backgroundColor);
    }

    return {
      ...baseLayer,
      type: LayerType.ARTBOARD,
      layers: subLayers,
      backgroundColor,
      resizeMode: layerData.resizeMode
    };
  }

  /**
   * 解析Symbol图层
   */
  private parseSymbolLayer(layerData: any, baseLayer: BaseLayer, warnings: string[]): Layer {
    let symbolMasterId: UUID | undefined;
    let symbolMasterName = 'Unknown Symbol';

    // Symbol实例使用symbolID而不是symbolMaster
    if (layerData.symbolID) {
      symbolMasterId = layerData.symbolID;
      // 尝试从symbolID中提取有意义的名称
      symbolMasterName = this.extractSymbolName(layerData.symbolID, layerData.name);
    }

    return {
      ...baseLayer,
      type: LayerType.SYMBOL,
      symbolMasterId: symbolMasterId || '',
      symbolMasterName,
      overrides: new Map()
    };
  }

  /**
   * 从Symbol ID和名称中提取有意义的名称
   */
  private extractSymbolName(symbolId: string, layerName: string): string {
    // 尝试从layerName中提取有意义的名称
    if (layerName && layerName !== 'Unknown') {
      // 如果layerName包含斜杠，提取最后部分作为组件名称
      if (layerName.includes('/')) {
        const parts = layerName.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.trim()) {
          return lastPart.trim();
        }
      }
      return layerName;
    }

    // 从symbolId中提取名称（假设格式为 "组件库名称_组件ID"）
    if (symbolId.includes('_')) {
      const parts = symbolId.split('_');
      if (parts.length > 1) {
        return parts[0];
      }
    }

    return 'Symbol Component';
  }

  /**
   * 解析Component图层
   */
  private parseComponentLayer(
    layerData: any,
    baseLayer: BaseLayer,
    depth: number,
    document: any,
    warnings: string[]
  ): Layer {
    const subLayers: Layer[] = [];

    if (layerData.layers && Array.isArray(layerData.layers)) {
      for (const subLayerData of layerData.layers) {
        const result = this.parseLayerSync(subLayerData, depth + 1, baseLayer, document);
        if (result.layer) {
          subLayers.push(result.layer);
        }
        warnings.push(...result.warnings);
      }
    }

    return {
      ...baseLayer,
      type: LayerType.COMPONENT,
      layers: subLayers,
      instances: []
    };
  }

  /**
   * 同步版本的图层解析（用于子图层）
   */
  private parseLayerSync(layerData: any, depth: number, parent: any, document: any): {
    layer?: Layer;
    warnings: string[];
  } {
    // 简化版本，只处理同步操作
    const warnings: string[] = [];

    if (!layerData || !layerData.do_objectID) {
      return { warnings };
    }

    const frame = layerData.frame || { x: 0, y: 0, width: 0, height: 0 };
    const style = layerData.style || {};
    const contextSettings = style.contextSettings || {};

    const layerType = this.determineLayerType(layerData);

    const baseLayer: BaseLayer = {
      id: layerData.do_objectID,
      name: layerData.name || 'Untitled',
      type: layerType,
      visible: layerData.isVisible !== false,
      locked: layerData.isLocked || false,
      opacity: contextSettings.opacity ?? 1,
      blendMode: this.getBlendMode(contextSettings.blendMode || 0),
      rotation: layerData.rotation || 0,
      rect: {
        x: frame.x || 0,
        y: frame.y || 0,
        width: frame.width || 0,
        height: frame.height || 0
      },
      cornerRadius: layerData.radius || 0,
      clipsContent: layerData.hasClippingMask || false
    };

    let layer: Layer;

    switch (layerType) {
      case LayerType.TEXT:
        layer = this.parseTextLayer(layerData, baseLayer, warnings);
        break;
      case LayerType.SHAPE:
        layer = this.parseShapeLayer(layerData, baseLayer, style, warnings);
        break;
      case LayerType.IMAGE:
        // 简化处理，异步版本会在主流程中处理
        layer = { ...baseLayer, type: LayerType.IMAGE, imageData: { ref: '', data: Buffer.alloc(0), width: baseLayer.rect.width, height: baseLayer.rect.height } };
        break;
      case LayerType.GROUP:
        layer = this.parseGroupLayer(layerData, baseLayer, depth, document, warnings);
        break;
      case LayerType.ARTBOARD:
        layer = this.parseArtboardLayer(layerData, baseLayer, depth, document, warnings);
        break;
      case LayerType.SYMBOL:
        layer = this.parseSymbolLayer(layerData, baseLayer, warnings);
        break;
      case LayerType.COMPONENT:
        layer = this.parseComponentLayer(layerData, baseLayer, depth, document, warnings);
        break;
      default:
        layer = { ...baseLayer, type: LayerType.UNKNOWN } as unknown as Layer;
    }

    return { layer, warnings };
  }

  /**
   * 解析填充样式
   */
  private parseFills(fills: any[], warnings: string[]): FillStyle[] {
    const result: FillStyle[] = [];

    for (const fill of fills) {
      if (fill.isEnabled === false) continue;

      const fillType = fill.fillType || 0; // 0=Color, 1=Gradient, 4=Pattern

      if (fillType === 0) {
        result.push({
          type: 'color',
          color: this.parseColor(fill.color),
          opacity: fill.opacity ?? 1,
          isEnabled: true
        });
      } else if (fillType === 1) {
        // 渐变填充
        const gradient = fill.gradient || {};
        const stops = gradient.stops || [];

        result.push({
          type: 'gradient',
          color: '',
          opacity: fill.opacity ?? 1,
          isEnabled: true,
          gradient: {
            type: this.getGradientTypeName(gradient.gradientType || 0),
            from: this.parsePoint(gradient.from),
            to: this.parsePoint(gradient.to),
            stops: stops.map((stop: any) => ({
              color: this.parseColor(stop.color),
              position: stop.position || 0
            }))
          }
        });
      } else if (fillType === 4) {
        result.push({
          type: 'pattern',
          color: '',
          opacity: fill.opacity ?? 1,
          isEnabled: true
        });
      }
    }

    return result;
  }

  /**
   * 解析边框样式
   */
  private parseBorders(borders: any[], warnings: string[]): BorderStyle[] {
    const result: BorderStyle[] = [];

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
   * 解析阴影样式
   */
  private parseShadows(shadows: any[], warnings: string[]): ShadowStyle[] {
    const result: ShadowStyle[] = [];

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
   * 解析布局信息
   */
  private parseLayoutInfo(layerData: any): any {
    if (!layerData.layout) return undefined;

    return {
      layout: this.getLayoutName(layerData.layout),
      align: layerData.layout?.align || 'top-left',
      distribution: layerData.layout?.distribution || 'space-between',
      spacing: layerData.layout?.spacing || 0
    };
  }

  // ─── 辅助方法 ─────────────────────────────────────────────────────

  private parseColor(color: any): string {
    if (!color) return '#000000';
    if (typeof color === 'string' && color.startsWith('#')) return color;

    const r = Math.round((color.red ?? 0) * 255);
    const g = Math.round((color.green ?? 0) * 255);
    const b = Math.round((color.blue ?? 0) * 255);

    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('') as string;
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

  private getBlendMode(mode: number): BlendMode {
    const modes: BlendMode[] = [
      BlendMode.NORMAL, BlendMode.DARKEN, BlendMode.MULTIPLY, BlendMode.COLOR_BURN,
      BlendMode.LIGHTEN, BlendMode.SCREEN, BlendMode.COLOR_DODGE, BlendMode.OVERLAY,
      BlendMode.SOFT_LIGHT, BlendMode.HARD_LIGHT, BlendMode.DIFFERENCE, BlendMode.EXCLUSION,
      BlendMode.HUE, BlendMode.SATURATION, BlendMode.COLOR, BlendMode.LUMINOSITY
    ];
    return modes[mode] || BlendMode.NORMAL;
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

  private getLayoutName(layout: any): string {
    if (!layout) return 'absolute';
    // 简化处理
    return 'flex';
  }

  /**
   * 递归添加所有嵌套图层到数组
   */
  private addAllNestedLayers(layer: Layer, targetArray: Layer[]): void {
    if (!layer) return;

    // 如果图层有子图层，递归添加
    if ('layers' in layer && Array.isArray((layer as any).layers)) {
      for (const subLayer of (layer as any).layers) {
        targetArray.push(subLayer);
        this.addAllNestedLayers(subLayer, targetArray);
      }
    }
  }

  private generateId(): UUID {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
