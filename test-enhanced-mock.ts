/**
 * 增强版代码生成器测试 - 使用模拟数据
 */

import { CodeGeneratorEnhanced } from './src/core/codegen/CodeGeneratorEnhanced.js';
import { Layer, LayerType, DesignSystem } from './src/core/types.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    console.log('🎨 增强版代码生成器 - 模拟数据测试');
    console.log(''.padEnd(70, '='));

    // 创建测试图层
    const testLayers: Layer[] = [
      {
        id: 'header-1',
        name: '标题栏',
        type: LayerType.TEXT,
        visible: true,
        locked: false,
        rect: { x: 20, y: 20, width: 200, height: 32 },
        layers: [],
        style: {
          fills: [{ color: { red: 0.1, green: 0.1, blue: 0.1, alpha: 1 } }],
          borders: [],
          shadows: []
        },
        opacity: 1,
        blendMode: 0,
        textContent: '业绩达成 - 产渠道',
        textStyles: {
          fontFamily: 'PingFang SC',
          fontSize: 20,
          fontWeight: 600,
          color: { red: 0.1, green: 0.1, blue: 0.1, alpha: 1 }
        }
      },
      {
        id: 'card-1',
        name: '渠道卡片',
        type: LayerType.GROUP,
        visible: true,
        locked: false,
        rect: { x: 20, y: 80, width: 320, height: 120 },
        layers: [
          {
            id: 'card-bg',
            name: '卡片背景',
            type: LayerType.SHAPE,
            visible: true,
            locked: false,
            rect: { x: 20, y: 80, width: 320, height: 120 },
            layers: [],
            style: {
              fills: [{ color: { red: 1, green: 1, blue: 1, alpha: 1 } }],
              borders: [{ color: { red: 0.9, green: 0.9, blue: 0.9, alpha: 1 }, thickness: 1 }],
              shadows: [{ x: 0, y: 2, blur: 8, spread: 0, color: { red: 0, green: 0, blue: 0, alpha: 0.1 } }]
            },
            opacity: 1,
            blendMode: 0
          },
          {
            id: 'card-title',
            name: '卡片标题',
            type: LayerType.TEXT,
            visible: true,
            locked: false,
            rect: { x: 40, y: 100, width: 100, height: 24 },
            layers: [],
            style: {
              fills: [{ color: { red: 0.2, green: 0.2, blue: 0.2, alpha: 1 } }],
              borders: [],
              shadows: []
            },
            opacity: 1,
            blendMode: 0,
            textContent: '渠道A',
            textStyles: {
              fontFamily: 'PingFang SC',
              fontSize: 16,
              fontWeight: 500,
              color: { red: 0.2, green: 0.2, blue: 0.2, alpha: 1 }
            }
          },
          {
            id: 'card-metric',
            name: '数据指标',
            type: LayerType.TEXT,
            visible: true,
            locked: false,
            rect: { x: 40, y: 140, width: 120, height: 20 },
            layers: [],
            style: {
              fills: [{ color: { red: 0.4, green: 0.4, blue: 0.4, alpha: 1 } }],
              borders: [],
              shadows: []
            },
            opacity: 1,
            blendMode: 0,
            textContent: '目标: 1000万',
            textStyles: {
              fontFamily: 'PingFang SC',
              fontSize: 14,
              fontWeight: 400,
              color: { red: 0.4, green: 0.4, blue: 0.4, alpha: 1 }
            }
          }
        ]
      },
      {
        id: 'progress-bar',
        name: '进度条',
        type: LayerType.SHAPE,
        visible: true,
        locked: false,
        rect: { x: 40, y: 170, width: 280, height: 8 },
        layers: [],
        style: {
          fills: [{ color: { red: 0.9, green: 0.9, blue: 0.9, alpha: 1 } }],
          borders: [],
          shadows: []
        },
        opacity: 1,
        blendMode: 0
      }
    ];

    // 创建测试设计系统
    const designSystem: DesignSystem = {
      colors: [
        { id: 'primary', name: '主色调', hex: '#3B82F6', value: 'rgba(59,130,246,1)', usage: [], source: 'document' },
        { id: 'success', name: '成功色', hex: '#10B981', value: 'rgba(16,185,129,1)', usage: [], source: 'document' },
        { id: 'danger', name: '危险色', hex: '#EF4444', value: 'rgba(239,68,68,1)', usage: [], source: 'document' },
        { id: 'text-main', name: '主文本', hex: '#1E293B', value: 'rgba(30,41,59,1)', usage: [], source: 'document' },
        { id: 'text-sub', name: '次文本', hex: '#64748B', value: 'rgba(100,116,139,1)', usage: [], source: 'document' },
        { id: 'bg-card', name: '卡片背景', hex: '#FFFFFF', value: 'rgba(255,255,255,1)', usage: [], source: 'document' },
        { id: 'bg-page', name: '页面背景', hex: '#F8FAFC', value: 'rgba(248,250,252,1)', usage: [], source: 'document' }
      ],
      textStyles: [
        { id: 'title-lg', name: '大标题', fontFamily: 'PingFang SC', fontSize: 20, fontWeight: 600, lineHeight: 28, letterSpacing: 0, color: '#1E293B' },
        { id: 'title-md', name: '中标题', fontFamily: 'PingFang SC', fontSize: 16, fontWeight: 500, lineHeight: 24, letterSpacing: 0, color: '#1E293B' },
        { id: 'body', name: '正文', fontFamily: 'PingFang SC', fontSize: 14, fontWeight: 400, lineHeight: 20, letterSpacing: 0, color: '#64748B' },
        { id: 'caption', name: '小字', fontFamily: 'PingFang SC', fontSize: 12, fontWeight: 400, lineHeight: 16, letterSpacing: 0, color: '#94A3B8' }
      ],
      layerStyles: [],
      gradients: [],
      spacing: [
        { id: 'spacing-xs', name: '超小间距', value: 4, unit: 'px' },
        { id: 'spacing-sm', name: '小间距', value: 8, unit: 'px' },
        { id: 'spacing-md', name: '中间距', value: 16, unit: 'px' },
        { id: 'spacing-lg', name: '大间距', value: 24, unit: 'px' },
        { id: 'spacing-xl', name: '超大间距', value: 32, unit: 'px' }
      ]
    };

    console.log('\n📊 测试数据准备完成:');
    console.log(`- 图层数量: ${testLayers.length}`);
    console.log(`- 设计系统: ${designSystem.colors.length} 颜色, ${designSystem.textStyles.length} 字体\n`);

    // 使用增强版生成器
    console.log('🤖 开始生成组件代码...');
    const generator = new CodeGeneratorEnhanced({
      framework: 'vue',
      cssFramework: 'tailwind',
      outputFormat: 'sfc',
      componentName: '业绩达成组件',
      enableVerification: false
    });

    const result = await generator.generateComponent(
      '业绩达成组件',
      testLayers,
      designSystem,
      { framework: 'vue', cssFramework: 'tailwind' }
    );

    console.log('\n✅ 生成成功!');
    console.log(`📄 文件名: ${result.fileName}`);
    console.log(`📝 模板长度: ${result.template.length} 字符`);
    console.log(`🔧 脚本长度: ${result.script.length} 字符`);
    console.log(`🎨 样式长度: ${result.style.length} 字符`);
    console.log(`📦 使用的设计标记:`);
    console.log(`   - 颜色: ${result.usedTokens.colors.length}个`);
    console.log(`   - 间距: ${result.usedTokens.spacing.length}个`);
    console.log(`   - 字体: ${result.usedTokens.typography.length}个`);

    // 保存生成的代码
    const outputDir = join(__dirname, 'output', 'enhanced-test');
    await mkdir(outputDir, { recursive: true });

    const fs = await import('node:fs/promises');
    const outputPath = join(outputDir, result.fileName);
    await fs.writeFile(outputPath, result.sfcTemplate, 'utf-8');

    console.log(`\n💾 已保存到: ${outputPath}`);

    // 显示代码预览
    console.log('\n📋 代码预览:');
    console.log('--- Template (前200字符) ---');
    console.log(result.template.substring(0, 200) + '...');
    console.log('\n--- Script (前200字符) ---');
    console.log(result.script.substring(0, 200) + '...');
    console.log('\n--- Style (前200字符) ---');
    console.log(result.style.substring(0, 200) + '...');

    console.log('\n' + '='.padEnd(70, '='));
    console.log('🎉 测试完成！');
    console.log(`📁 输出目录: output/enhanced-test/`);
    console.log(`🔍 调试信息: output/debug/`);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

main().catch(console.error);
