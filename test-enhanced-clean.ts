/**
 * 增强版代码生成器 - 高精度设计还原测试
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
    console.log('🎨 增强版代码生成器 - 高精度设计还原测试');
    console.log(''.padEnd(70, '='));

    const sketchFile = './test-design.sketch';

    // 1. 读取Sketch文件
    console.log('📖 步骤1: 读取Sketch文件');
    const reader = new SketchFileReader();
    const fileResult = await reader.read(sketchFile);

    if (!fileResult.success) {
      throw new Error('读取Sketch文件失败: ' + fileResult.errors.map(e => e.message).join(', '));
    }

    console.log(`✅ 成功读取文件 (${(fileResult.fileSize / 1024).toFixed(2)} KB)\n`);

    // 2. 提取图层数据
    console.log('🎯 步骤2: 提取图层数据');
    const layerExtractor = new LayerExtractor();
    const layerResult = await layerExtractor.extract(fileResult.document);
    console.log(`✅ 图层提取完成:`);
    console.log(`   - 总图层数: ${layerResult.statistics.totalLayers}`);
    console.log(`   - Artboards: ${layerResult.artboards.length}`);

    // 3. 提取设计系统
    console.log('\n🎨 步骤3: 提取设计系统');
    const designExtractor = new DesignSystemExtractor();
    const designResult = await designExtractor.extract(fileResult.document, layerResult.allLayers);
    const designSystem = designResult.designSystem;
    console.log(`✅ 设计系统信息:`);
    console.log(`   - 颜色: ${designSystem.colors.length} 个`);
    console.log(`   - 字体: ${designSystem.textStyles.length} 个`);
    console.log(`   - 间距: ${designSystem.spacing.length} 个\n`);

    // 4. 生成组件代码
    console.log('💻 步骤4: 生成Vue组件代码');
    let generatedCount = 0;
    const maxComponents = 3;

    for (const artboard of layerResult.artboards) {
      if (generatedCount >= maxComponents) break;

      console.log(`\n   🎨 处理 Artboard: ${artboard.name}`);
      console.log(`   - 图层总数: ${artboard.layers ? artboard.layers.length : 0}`);

      try {
        // 创建输出目录
        const outputDir = join(__dirname, 'output', 'enhanced-test');
        await mkdir(outputDir, { recursive: true });

        // 获取artboard的子图层
        const artboardLayers = artboard.layers || [];

        // 使用增强版生成器
        const generator = new CodeGeneratorEnhanced({
          framework: 'vue',
          cssFramework: 'tailwind',
          outputFormat: 'sfc',
          componentName: artboard.name,
          enableVerification: false
        });

        console.log('   - 调用LLM生成代码...');
        const result = await generator.generateComponent(
          artboard.name,
          artboardLayers,
          designSystem,
          { framework: 'vue', cssFramework: 'tailwind' }
        );

        console.log(`   ✅ 生成成功: ${result.fileName}`);
        console.log(`   - Template: ${result.template.length} 字符`);
        console.log(`   - Script: ${result.script.length} 字符`);
        console.log(`   - Style: ${result.style.length} 字符`);

        // 保存生成的代码
        const fs = await import('node:fs/promises');
        const outputPath = join(outputDir, result.fileName);
        await fs.writeFile(outputPath, result.sfcTemplate, 'utf-8');
        console.log(`   💾 已保存: ${outputPath}`);

        generatedCount++;

      } catch (error) {
        console.error(`   ❌ 生成失败: ${error.message}`);
        if (error.stack) {
          console.error(`   堆栈: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
        }
      }
    }

    console.log('\n' + '='.padEnd(70, '='));
    console.log(`🎉 测试完成！生成了 ${generatedCount} 个组件`);
    console.log(`📁 输出目录: output/enhanced-test/`);
    console.log(`🔍 调试信息: output/debug/`);
    console.log('\n💡 提示: 运行 npm run preview 查看生成效果');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

main().catch(console.error);
