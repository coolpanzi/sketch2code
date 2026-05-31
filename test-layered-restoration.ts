/**
 * 分层还原引擎测试
 * 读取 Sketch 文件，执行 3-phase 还原管线，输出 Vue SFC 文件
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SketchFileReader } from './src/core/parser/SketchFileReader.js';
import { LayerExtractor } from './src/core/parser/LayerExtractor.js';
import { LayeredRestorationEngine } from './src/core/codegen/LayeredRestorationEngine.js';
import type { Layer } from './src/core/types.js';

const SKETCH_FILE = './0625企康看版.sketch';
const OUTPUT_DIR = './output/layered-test';

async function main() {
  console.log('=== 分层还原引擎测试 ===\n');

  // 1. 读取 Sketch 文件
  const sketchPath = path.resolve(SKETCH_FILE);
  console.log(`📖 读取文件: ${sketchPath}`);

  let fileExists = false;
  try {
    await fs.access(sketchPath);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    console.log(`❌ 文件不存在: ${sketchPath}`);
    console.log('   跳过测试。请放置 .sketch 文件后重试。');
    return;
  }

  const reader = new SketchFileReader();
  const fileResult = await reader.read(sketchPath);

  if (!fileResult.success) {
    console.log(`❌ 文件读取失败:`);
    for (const err of fileResult.errors) {
      console.log(`   [${err.stage}] ${err.message}`);
    }
    return;
  }

  console.log(`   文件大小: ${fileResult.fileSize} bytes`);
  console.log(`   图片数量: ${Object.keys(fileResult.images).length}`);

  // 2. 提取图层
  console.log('\n🔍 提取图层...');
  const extractor = new LayerExtractor();
  const extractResult = await extractor.extract(fileResult.document);

  console.log(`   图层总数: ${extractResult.statistics.totalLayers}`);
  console.log(`   画板数量: ${extractResult.artboards.length}`);
  console.log(`   最大深度: ${extractResult.statistics.maxDepth}`);

  if (extractResult.errors.length > 0) {
    console.log('   提取警告:');
    for (const err of extractResult.errors) {
      console.log(`     [${err.stage}] ${err.message}`);
    }
  }

  // 3. 确定要处理的画板列表
  let targets: Layer[];
  if (extractResult.artboards.length > 0) {
    targets = extractResult.artboards;
    console.log(`\n🎯 使用 ${targets.length} 个画板作为还原目标`);
  } else {
    console.log('\n⚠️  未找到画板，尝试使用 allLayers 作为后备...');
    if (extractResult.allLayers.length === 0) {
      console.log('   文件为空（0 页面，0 图层）。没有可还原的内容。');
      console.log('   请使用包含设计内容的 .sketch 文件。');
      return;
    }
    targets = extractResult.allLayers;
    console.log(`   使用 ${targets.length} 个顶层图层作为还原目标`);
  }

  // 4. 运行分层还原引擎
  console.log('\n🚀 启动分层还原引擎...\n');

  const engine = new LayeredRestorationEngine();
  const useLLM = process.argv.includes('--llm');
  const results: Array<{ name: string; fileName: string; generationTime: number; cssClasses: number }> = [];

  console.log(`\n⚙️  生成模式: ${useLLM ? 'LLM增强 (慢)' : '纯算法 (快)'}\n`);

  for (const artboard of targets) {
    const componentName = artboard.name || 'UnnamedArtboard';
    try {
      const result = await engine.restore(componentName, artboard, { useLLM });
      results.push({
        name: componentName,
        fileName: result.fileName,
        generationTime: result.metadata.generationTime,
        cssClasses: Object.keys(result.style).length,
      });

      // 5. 保存结果
      const outputPath = path.resolve(OUTPUT_DIR, result.fileName);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // 构建完整SFC
      const sfc = `<template>\n${result.template}\n</template>\n\n<script setup lang="ts">\n${result.script}\n</script>\n\n<style scoped>\n${result.style}\n</style>`;
      await fs.writeFile(outputPath, sfc, 'utf-8');

      console.log(`   💾 已保存: ${result.fileName}`);
    } catch (error) {
      console.error(`   ❌ 还原失败 "${componentName}": ${(error as Error).message}`);
    }
  }

  // 6. 打印统计
  console.log('\n=== 统计 ===');
  console.log(`处理画板/目标: ${results.length}`);
  if (results.length > 0) {
    const totalTime = results.reduce((sum, r) => sum + r.generationTime, 0);
    const avgTime = Math.round(totalTime / results.length);
    console.log(`总耗时: ${totalTime}ms (平均 ${avgTime}ms/画板)`);
    console.log(`生成文件:`);
    for (const r of results) {
      console.log(`  - ${r.fileName} (${r.generationTime}ms)`);
    }
    console.log(`\n输出目录: ${path.resolve(OUTPUT_DIR)}`);
  }
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
