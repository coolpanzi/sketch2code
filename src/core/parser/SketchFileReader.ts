/**
 * Sketch文件读取器
 * 负责读取和解压.sketch文件
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function loadJSZip(): Promise<any> {
  const mod = await import('jszip');
  return (mod as any).default || mod;
}

/**
 * 文件读取结果
 */
export interface FileReadResult {
  success: boolean;
  document: any;
  images: Record<string, Buffer>;
  fileSize: number;
  errors: Array<{ stage: string; message: string; details?: any }>;
  warnings: string[];
}

/**
 * Sketch文件读取器
 */
export class SketchFileReader {
  /**
   * 读取Sketch文件
   */
  async read(filePath: string): Promise<FileReadResult> {
    const errors: FileReadResult['errors'] = [];
    const warnings: string[] = [];

    try {
      // 读取文件
      const buffer = await fs.readFile(filePath);
      const fileSize = buffer.length;

      // 加载JSZip
      const JSZip = await loadJSZip();
      const zip = await JSZip.loadAsync(buffer);

      // 读取document.json
      const documentRaw = await zip.file('document.json')?.async('string');
      if (!documentRaw) {
        throw new Error('Invalid Sketch file: missing document.json');
      }

      const document = JSON.parse(documentRaw);

      // 修复：解析实际的页面数据（不只是引用）
      if (document.pages && Array.isArray(document.pages)) {
        const actualPages = [];

        for (const pageRef of document.pages) {
          if (pageRef._class === 'MSJSONFileReference' && pageRef._ref) {
            // 这是一个文件引用，需要读取实际文件
            // _ref可能已经包含"pages/"前缀，需要检查
            let pageFilePath = pageRef._ref;
            if (!pageFilePath.startsWith('pages/')) {
              pageFilePath = `pages/${pageFilePath}`;
            }
            if (!pageFilePath.endsWith('.json')) {
              pageFilePath = `${pageFilePath}.json`;
            }

            const pageFileData = await zip.file(pageFilePath)?.async('string');
            if (pageFileData) {
              const pageData = JSON.parse(pageFileData);
              actualPages.push(pageData);
            }
          } else if (pageRef._class === 'page') {
            // 直接的页面对象
            actualPages.push(pageRef);
          }
        }

        // 替换引用为实际数据
        document.pages = actualPages;
      }

      // 提取图像资源
      const images = await this.extractImages(zip);

      // 检查文件格式版本
      if (document.meta) {
        warnings.push(`Sketch file version: ${document.meta.version || 'unknown'}`);
      }

      return {
        success: true,
        document,
        images,
        fileSize,
        errors,
        warnings
      };

    } catch (error) {
      return {
        success: false,
        document: null,
        images: {},
        fileSize: 0,
        errors: [{
          stage: 'file-reading',
          message: error instanceof Error ? error.message : String(error),
          details: error
        }],
        warnings
      };
    }
  }

  /**
   * 提取图像资源
   */
  private async extractImages(zip: any): Promise<Record<string, Buffer>> {
    const images: Record<string, Buffer> = {};

    const imagePatterns = ['images/', 'resources/images/', 'resources/'];
    const fileNames = Object.keys(zip.files);

    for (const imgPath of fileNames) {
      if (imagePatterns.some(pattern => imgPath.startsWith(pattern)) && !imgPath.endsWith('/')) {
        try {
          const data = await zip.file(imgPath)?.async('nodebuffer');
          if (data) {
            images[imgPath] = data;
          }
        } catch (error) {
          // 跳过无法读取的图像
          console.warn(`Failed to extract image: ${imgPath}`);
        }
      }
    }

    return images;
  }

  /**
   * 验证Sketch文件格式
   */
  async validate(filePath: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 检查文件是否存在
      await fs.access(filePath);

      // 读取文件头检查ZIP格式
      const buffer = await fs.readFile(filePath, { encoding: null });

      // ZIP文件头标识
      const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      if (!buffer.slice(0, 4).equals(zipSignature)) {
        errors.push('File is not a valid ZIP archive (Sketch files are ZIP archives)');
        return { valid: false, errors, warnings };
      }

      // 尝试加载ZIP内容
      const JSZip = await loadJSZip();
      await JSZip.loadAsync(buffer);

      return { valid: true, errors, warnings };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { valid: false, errors, warnings };
    }
  }
}

/**
 * 便捷函数：读取Sketch文件
 */
export async function readSketchFile(filePath: string): Promise<FileReadResult> {
  const reader = new SketchFileReader();
  return await reader.read(filePath);
}