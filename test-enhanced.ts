/**
 * 测试增强版代码生成器
 * 用于获得更高精度的设计还原
 */

import { SketchFileReader } from './src/core/parser/SketchFileReader.js';
import { LayerExtractor } from './src/core/parser/LayerExtractor.js';
import { DesignSystemExtractor } from './src/core/parser/DesignSystemExtractor.js';
import { CodeGeneratorEnhanced } from './src/core/codegen/CodeGeneratorEnhanced.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    console.log('🚀 开始增强版代码生成测试...\n');

    const sketchFile = './0625企康看版.sketch';

    // 1. 读取Sketch文件
    console.log('📖 读取Sketch文件...');
    const reader = new SketchFileReader();
    const sketchData = await reader.readFile(sketchFile);
    console.log(`✅ 成功读取: ${sketchData.pages.length} 个页面\n`);

    // 2. 提取设计系统
    console.log('🎨 提取设计系统...');
    const designExtractor = new DesignSystemExtractor();
    const designSystem = designExtractor.extractFromDocument(sketchData.document);
    console.log(`✅ 设计系统:`);
    console.log(`   - 颜色: ${designSystem.colors.length}个`);
    console.log(`   - 字体: ${designSystem.textStyles.length}个`);
    console.log(`   - 间距: ${designSystem.spacing.length}个\n`);

    // 3. 提取所有图层
    console.log('📱 提取所有图层...');
    const layerExtractor = new LayerExtractor();

    for (const page of sketchData.pages) {
      console.log(`\n处理页面: ${page.name}`);
      console.log(`   Artboards: ${page.artboards.length}`);

      for (const artboard of page.artboards) {
        console.log(`\n   生成组件: ${artboard.name}`);
        console.log(`   - 图层数: ${artboard.layers.length}`);

        try {
          // 创建输出目录
          const outputDir = join(__dirname, 'output', 'enhanced-test');
          await mkdir(outputDir, { recursive: true });

          // 使用增强版生成器
          console.log('   - 使用增强版生成器...');
          const generator = new CodeGeneratorEnhanced({
            framework: 'vue',
            cssFramework: 'tailwind',
            outputFormat: 'sfc',
            componentName: artboard.name,
            enableVerification: false
          });

          const result = await generator.generateComponent(
            artboard.name,
            artboard.layers,
            designSystem,
            { framework: 'vue', cssFramework: 'tailwind' }
          );

          console.log(`   ✅ 生成成功: ${result.fileName}`);

          // 保存生成的代码
          const fs = await import('node:fs/promises');
          const outputPath = join(outputDir, result.fileName);
          await fs.writeFile(outputPath, result.sfcTemplate, 'utf-8');
          console.log(`   💾 已保存到: ${outputPath}`);

        } catch (error) {
          console.error(`   ❌ 生成失败:`, error.message);
        }

        // 只生成第一个artboard进行测试
        break;
      }

      // 只处理第一个页面进行测试
      break;
    }

    console.log('\n✨ 增强版生成测试完成！');
    console.log('📁 输出目录: output/enhanced-test/');
    console.log('🔍 调试信息: output/debug/');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

main().catch(console.error);
