/**
 * 分析Sketch文件结构
 */

import { SketchFileReader } from './src/core/parser/SketchFileReader.js';
import { LayerExtractor } from './src/core/parser/LayerExtractor.js';

async function main() {
  console.log('🔍 分析Sketch文件结构...\n');

  const reader = new SketchFileReader();
  const fileResult = await reader.read('./test-design.sketch');

  console.log('文件信息:');
  console.log(`- 文件大小: ${(fileResult.fileSize / 1024).toFixed(2)} KB`);
  console.log(`- 成功读取: ${fileResult.success}`);
  console.log(`- 错误数: ${fileResult.errors.length}`);
  console.log(`- 警告数: ${fileResult.warnings.length}\n`);

  // 检查文档结构
  const document = fileResult.document;
  console.log('文档结构:');
  console.log(`- pages: ${document.pages ? document.pages.length : 'N/A'}`);

  if (document.pages && document.pages.length > 0) {
    console.log('\n页面详情:');
    for (const page of document.pages) {
      console.log(`- 页面: ${page.name}`);
      console.log(`  - layers: ${page.layers ? page.layers.length : 'N/A'}`);

      if (page.layers && page.layers.length > 0) {
        console.log('  - 图层类型:');
        for (const layer of page.layers) {
          console.log(`    • ${layer._class || layer.type}: ${layer.name || '(unnamed)'}`);
        }
      }
    }
  }

  // 提取图层
  console.log('\n提取图层...');
  const layerExtractor = new LayerExtractor();
  const layerResult = await layerExtractor.extract(document);

  console.log('提取结果:');
  console.log(`- 总图层数: ${layerResult.statistics.totalLayers}`);
  console.log(`- Artboards: ${layerResult.artboards.length}`);
  console.log(`- 所有图层: ${layerResult.allLayers.length}`);
  console.log(`- 错误数: ${layerResult.errors.length}`);
  console.log(`- 警告数: ${layerResult.warnings.length}`);

  if (layerResult.allLayers.length > 0) {
    console.log('\n所有图层详情:');
    for (const layer of layerResult.allLayers.slice(0, 10)) {
      console.log(`- ${layer.type}: ${layer.name} (${layer.rect.width}x${layer.rect.height}px)`);
    }
  }
}

main().catch(console.error);
