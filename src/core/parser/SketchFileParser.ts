/**
 * Sketch文件解析器 - 核心模块
 * 提供统一的.sketch文件解析功能
 *
 * 关键设计：直接遍历 document.pages[] 保持页面归属，
 * 不把所有页面的 artboard 混在一起再反推。
 */

import {
  SketchFile,
  Page,
  Layer,
  DesignSystem,
  SketchMetadata,
  LayerType,
  UUID,
  ArtboardLayer,
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
      // Step 1: Read the .sketch ZIP file
      const fileData = await this.fileReader.read(filePath);
      if (fileData.errors.length > 0) {
        errors.push(...fileData.errors);
      }
      warnings.push(...fileData.warnings);

      const document = fileData.document;
      if (!document) {
        return {
          success: false,
          errors: [...errors, { stage: 'parsing', message: 'Failed to read document data' }],
          warnings,
          metadata: { parseTime: Date.now() - startTime, fileSize: fileData.fileSize, version: 'unknown' }
        };
      }

      // Step 2: Build pages directly from document.pages[]
      // Each page in document.pages has a .name and .layers[] — we preserve
      // this mapping instead of guessing from artboard names.
      const rawPages: any[] = document.pages || [];
      const pages: Page[] = [];
      const allLayers: Layer[] = [];

      for (const pageData of rawPages) {
        const pageName: string = pageData.name || 'Unnamed Page';
        const pageLayers: any[] = pageData.layers || [];

        // Extract layers for this page using LayerExtractor
        const layerResult = await this.layerExtractor.extract({ pages: [pageData] });

        if (layerResult.errors.length > 0) {
          errors.push(...layerResult.errors);
        }
        warnings.push(...layerResult.warnings);

        // Collect artboards for this page
        const pageArtboards: ArtboardLayer[] = layerResult.artboards as ArtboardLayer[];

        allLayers.push(...layerResult.allLayers);

        // If no artboards found, use ONLY the top-level layers (not the flattened allLayers).
        // allLayers is recursively flattened — using it would cause nested children to appear
        // as siblings, breaking LayoutConverter's coordinate detection.
        const topLevelLayers = layerResult.allLayers.filter(l => {
          // A top-level layer is one whose parent is the page, not another layer.
          // In the extraction flow, these are the direct children of pageData.layers.
          // We identify them by checking if they appear in pageData.layers.
          return (pageData.layers || []).some((pl: any) => pl.do_objectID === l.id);
        });

        const pageContent = pageArtboards.length > 0 ? pageArtboards : topLevelLayers;

        const page: Page = {
          id: pageData.do_objectID || this.generateId(),
          name: pageName,
          artboards: pageArtboards,
          symbols: [],
          layers: pageContent,
          metadata: {
            totalLayers: layerResult.allLayers.length,
            actualDimensions: this.calculatePageSize(pageContent),
            layoutBounds: this.calculateLayoutBounds(pageContent)
          }
        };

        pages.push(page);
      }

      // Step 3: Extract design system from all layers
      let designSystem: DesignSystem;
      if (this.config.analyzeDesignSystem) {
        const dsResult = await this.designSystemExtractor.extract(document, allLayers);
        designSystem = dsResult.designSystem;
        warnings.push(...dsResult.warnings);
      } else {
        designSystem = this.createEmptyDesignSystem();
      }

      // Step 4: Analyze symbol usage
      const symbolUsage = this.analyzeSymbolUsage(allLayers);

      // Build final result
      const sketchFile: SketchFile = {
        metadata: this.extractMetadata(document),
        pages,
        designSystem,
        images: fileData.images,
        symbolUsage
      };

      const parseTime = Date.now() - startTime;

      // Only file-level errors (reading, top-level parsing) are fatal.
      // Layer-level errors (unknown types, missing data) should not block the whole file.
      const fatalErrors = errors.filter(e =>
        e.stage === 'file-reading' || e.stage === 'parsing'
      );

      // Also consider it a failure if zero layers were extracted from any page that had layers
      const totalPagesWithLayers = rawPages.filter((p: any) => (p.layers || []).length > 0).length;
      const hasAnyContent = allLayers.length > 0 || pages.some(p => p.artboards.length > 0);

      const success = fatalErrors.length === 0
        && !!sketchFile
        && (totalPagesWithLayers === 0 || hasAnyContent);

      return {
        success,
        file: sketchFile,  // always return data so caller can use partial results
        errors,
        warnings,
        metadata: {
          parseTime,
          fileSize: fileData.fileSize,
          version: document.meta?.version || 'unknown'
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
   * 计算页面尺寸
   */
  private calculatePageSize(layers: Layer[]): { width: number; height: number } {
    if (layers.length === 0) return { width: 0, height: 0 };

    let maxWidth = 0;
    let maxHeight = 0;
    for (const layer of layers) {
      maxWidth = Math.max(maxWidth, layer.rect.width);
      maxHeight = Math.max(maxHeight, layer.rect.height);
    }
    return { width: maxWidth, height: maxHeight };
  }

  /**
   * 计算布局边界
   */
  private calculateLayoutBounds(layers: Layer[]): any {
    if (layers.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of layers) {
      minX = Math.min(minX, layer.rect.x);
      minY = Math.min(minY, layer.rect.y);
      maxX = Math.max(maxX, layer.rect.x + layer.rect.width);
      maxY = Math.max(maxY, layer.rect.y + layer.rect.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

    return { totalSymbols, uniqueComponents: componentMap.size, componentMap };
  }

  private extractMetadata(document: any): SketchMetadata {
    return {
      version: document.meta?.version || 'unknown',
      colorSpace: this.getColorSpaceName(document.colorSpace || 0),
      appVersion: document.app || 'unknown',
      modifiedDate: document.meta?.modifiedDate,
      commit: document.meta?.commit
    };
  }

  private createEmptyDesignSystem(): DesignSystem {
    return { colors: [], textStyles: [], layerStyles: [], gradients: [], spacing: [] };
  }

  private getColorSpaceName(space: number): 'Unmanaged' | 'sRGB' | 'P3' {
    const colorSpaces: Array<'Unmanaged' | 'sRGB' | 'P3'> = ['Unmanaged', 'sRGB', 'P3'];
    return colorSpaces[space] || 'Unmanaged';
  }

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
