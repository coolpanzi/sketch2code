/**
 * 最终验证测试：Sketch到Vue代码生成
 */

import { loadConfig } from './src/config.js';
import { parseSketchFile } from './src/core/parser/SketchFileParser.js';
import { CodeGenerator } from './src/core/codegen/CodeGenerator.js';

const TEST_FILE = '/Users/coolpanzi/Downloads/0625企康看版.sketch';

async function finalTest() {
  console.log('🚀 最终验证测试：Sketch → Vue 代码生成');
  console.log('='.repeat(70));

  try {
    // 1. 加载配置
    console.log('\n📋 步骤1: 配置检查');
    const config = await loadConfig();
    console.log(`✅ 模型: ${config.llmModel}`);
    console.log(`✅ API: ${config.llmBaseUrl}`);

    // 2. 解析Sketch文件
    console.log('\n📋 步骤2: 解析Sketch文件');
    const parseResult = await parseSketchFile(TEST_FILE);

    if (!parseResult.success || !parseResult.file) {
      console.error('❌ 解析失败');
      return;
    }

    console.log(`✅ 页面: ${parseResult.file.pages.length}`);
    console.log(`✅ Artboards: ${parseResult.file.pages.reduce((acc, p) => acc + p.artboards.length, 0)}`);
    console.log(`✅ 设计系统: ${parseResult.file.designSystem.colors.length} 颜色, ${parseResult.file.designSystem.textStyles.length} 文本样式`);

    // 3. 生成代码
    console.log('\n📋 步骤3: 生成Vue组件');
    const generator = new CodeGenerator({
      framework: 'vue',
      cssFramework: 'tailwind',
      outputFormat: 'sfc',
      componentName: '',
      enableVerification: false
    });

    // 生成第一个页面的所有artboards
    const results = [];
    for (const artboard of parseResult.file.pages[0].artboards) {
      try {
        console.log(`   生成: ${artboard.name} (${artboard.layers.length} 图层)`);
        const result = await generator.generateComponent(
          artboard.name,
          artboard.layers,
          parseResult.file.designSystem
        );
        results.push(result);
        console.log(`   ✅ 完成: ${result.fileName} (${result.template.length + result.script.length + result.style.length} 字符)`);
      } catch (error) {
        console.log(`   ❌ 失败: ${error.message}`);
      }
    }

    // 4. 保存结果
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const outputDir = './output/final-test';
    await fs.mkdir(outputDir, { recursive: true });

    for (const result of results) {
      const filePath = path.join(outputDir, result.fileName);
      await fs.writeFile(filePath, result.sfcTemplate);
      console.log(`💾 保存: ${result.fileName}`);
    }

    console.log(`\n🎉 测试完成！生成了 ${results.length} 个Vue组件`);
    console.log(`📁 输出目录: ${outputDir}`);

  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
  }
}

finalTest();