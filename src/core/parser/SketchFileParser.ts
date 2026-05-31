/**
 * Sketch文件解析器 - 核心模块
 * 提供统一的.sketch文件解析功能
 */

import {
  SketchFile,
  Page,
  Layer,
  DesignSystem,
  SketchMetadata,
  LayerType,
  UUID
} from '../types.js';
import { SketchFileReader } from './SketchFileReader.js';
import { LayerExtractor } from './LayerExtractor.js';
import { DesignSystemExtractor } from './DesignSystemExtractor.js';

/**
 * Sketch文件解析器配置
 */
export interface ParserConfig {
  extractImages?: boolean;
  analyzeDesignSystem?: boolean;
  resolveSymbolInstances?: boolean;
  preserveMetadata?: boolean;
}

/**
 * 解析结果
 */
export interface ParseResult {
  success: boolean;
  file?: SketchFile;
  errors: Array<{
    stage: string;
    message: string;
    details?: any;
  }>;
  warnings: string[];
  metadata: {
    parseTime: number;
    fileSize: number;
    version: string;
  };
}

/**
 * Sketch文件解析器
 */
export class SketchFileParser {
  private config: ParserConfig;
  private fileReader: SketchFileReader;
  private layerExtractor: LayerExtractor;
  private designSystemExtractor: DesignSystemExtractor;

  constructor(config: ParserConfig = {}) {
    this.config = {
      extractImages: true,
      analyzeDesignSystem: true,
      resolveSymbolInstances: true,
      preserveMetadata: true,
      ...config
    };

    this.fileReader = new SketchFileReader();
    this.layerExtractor = new LayerExtractor();
    this.designSystemExtractor = new DesignSystemExtractor();
  }

  /**
   * 解析Sketch文件
   */
  async parse(filePath: string): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseResult['errors'] = [];
    const warnings: string[] = [];

    try {
      // 第一步：读取文件
      const fileData = await this.fileReader.read(filePath);
      if (fileData.errors.length > 0) {
        errors.push(...fileData.errors);
      }
      warnings.push(...fileData.warnings);

      // 第二步：提取图层
      const layersResult = await this.layerExtractor.extract(fileData.document);
      if (layersResult.errors.length > 0) {
        errors.push(...layersResult.errors);
      }
      warnings.push(...layersResult.warnings);

      // 第三步：提取设计系统
      let designSystem: DesignSystem;
      if (this.config.analyzeDesignSystem) {
        const dsResult = await this.designSystemExtractor.extract(
          fileData.document,
          layersResult.allLayers
        );
        designSystem = dsResult.designSystem;
        warnings.push(...dsResult.warnings);
      } else {
        designSystem = this.createEmptyDesignSystem();
      }

      // 第四步：构建页面结构
      const pages = this.buildPages(layersResult.artboards, layersResult.allLayers);

      // 第五步：分析Symbol使用情况
      const symbolUsage = this.analyzeSymbolUsage(layersResult.allLayers);

      // 构建最终结果
      const sketchFile: SketchFile = {
        metadata: this.extractMetadata(fileData.document),
        pages,
        designSystem,
        images: fileData.images,
        symbolUsage
      };

      const parseTime = Date.now() - startTime;

      return {
        success: errors.length === 0,
        file: sketchFile,
        errors,
        warnings,
        metadata: {
          parseTime,
          fileSize: fileData.fileSize,
          version: fileData.document.meta?.version || 'unknown'
        }
      };

    } catch (error) {
      return {
        success: false,
        errors: [{
          stage: 'parsing',
          message: error instanceof Error ? error.message : String(error),
          details: error
        }],
        warnings,
        metadata: {
          parseTime: Date.now() - startTime,
          fileSize: 0,
          version: 'unknown'
        }
      };
    }
  }

  /**
   * 构建页面结构
   */
  private buildPages(artboards: Layer[], allLayers: Layer[]): Page[] {
    // 按页面分组artboards
    const pageMap = new Map<string, Layer[]>();

    for (const artboard of artboards) {
      // 假设artboard的name包含页面信息
      const pageName = this.extractPageName(artboard.name);

      if (!pageMap.has(pageName)) {
        pageMap.set(pageName, []);
      }

      pageMap.get(pageName)!.push(artboard);
    }

    // 构建页面对象
    const pages: Page[] = [];

    for (const [pageName, pageArtboards] of pageMap) {
      const page: Page = {
        id: this.generateId(),
        name: pageName,
        artboards: pageArtboards as any[],
        symbols: [],
        layers: pageArtboards,
        metadata: {
          totalLayers: pageArtboards.length,
          actualDimensions: this.calculatePageSize(pageArtboards),
          layoutBounds: this.calculateLayoutBounds(pageArtboards)
        }
      };

      pages.push(page);
    }

    return pages;
  }

  /**
   * 从artboard名称中提取页面名称
   */
  private extractPageName(artboardName: string): string {
    // 简单的命名规则：如果artboard名称包含数字前缀，去掉数字前缀
    // 例如： "1-首页" -> "首页"
    const match = artboardName.match(/^\d+[-.]?\s*(.+)$/);
    return match ? match[1] : artboardName;
  }

  /**
   * 计算页面尺寸
   */
  private calculatePageSize(artboards: Layer[]): { width: number; height: number } {
    if (artboards.length === 0) {
      return { width: 0, height: 0 };
    }

    // 使用最大的artboard尺寸
    let maxWidth = 0;
    let maxHeight = 0;

    for (const artboard of artboards) {
      maxWidth = Math.max(maxWidth, artboard.rect.width);
      maxHeight = Math.max(maxHeight, artboard.rect.height);
    }

    return { width: maxWidth, height: maxHeight };
  }

  /**
   * 计算布局边界
   */
  private calculateLayoutBounds(layers: Layer[]): any {
    if (layers.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const layer of layers) {
      minX = Math.min(minX, layer.rect.x);
      minY = Math.min(minY, layer.rect.y);
      maxX = Math.max(maxX, layer.rect.x + layer.rect.width);
      maxY = Math.max(maxY, layer.rect.y + layer.rect.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 分析Symbol使用情况
   */
  private analyzeSymbolUsage(allLayers: Layer[]): SketchFile['symbolUsage'] {
    const componentMap = new Map<UUID, { name: string; instanceCount: number }>();
    let totalSymbols = 0;

    for (const layer of allLayers) {
      if (layer.type === LayerType.SYMBOL) {
        totalSymbols++;
        const symbolLayer = layer as any;
        const masterId = symbolLayer.symbolMasterId;

        if (masterId && !componentMap.has(masterId)) {
          componentMap.set(masterId, {
            name: symbolLayer.symbolMasterName || 'Unknown',
            instanceCount: 0
          });
        }

        if (masterId) {
          const entry = componentMap.get(masterId)!;
          entry.instanceCount++;
        }
      }
    }

    return {
      totalSymbols,
      uniqueComponents: componentMap.size,
      componentMap
    };
  }

  /**
   * 提取元数据
   */
  private extractMetadata(document: any): SketchMetadata {
    return {
      version: document.meta?.version || 'unknown',
      colorSpace: this.getColorSpaceName(document.colorSpace || 0),
      appVersion: document.app || 'unknown',
      modifiedDate: document.meta?.modifiedDate,
      commit: document.meta?.commit
    };
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

  /**
   * 获取颜色空间名称
   */
  private getColorSpaceName(space: number): 'Unmanaged' | 'sRGB' | 'P3' {
    const colorSpaces: Array<'Unmanaged' | 'sRGB' | 'P3'> = ['Unmanaged', 'sRGB', 'P3'];
    return colorSpaces[space] || 'Unmanaged';
  }

  /**
   * 生成唯一ID
   */
  private generateId(): UUID {
    return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 便捷函数：解析Sketch文件
 */
export async function parseSketchFile(
  filePath: string,
  config?: ParserConfig
): Promise<ParseResult> {
  const parser = new SketchFileParser(config);
  return await parser.parse(filePath);
}
