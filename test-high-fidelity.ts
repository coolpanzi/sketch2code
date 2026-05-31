/**
 * 高精度设计还原生成器测试
 */

import { HighFidelityGenerator } from './src/core/codegen/HighFidelityGenerator.js';
import { Layer, LayerType, DesignSystem } from './src/core/types.js';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    console.log('🎯 高精度设计还原生成器测试');
    console.log(''.padEnd(70, '='));

    // 创建更复杂的测试图层
    const testLayers: Layer[] = [
      {
        id: 'page-bg',
        name: '页面背景',
        type: LayerType.SHAPE,
        visible: true,
        locked: false,
        rect: { x: 0, y: 0, width: 375, height: 812 },
        layers: [],
        style: {
          fills: [{ color: { red: 0.97, green: 0.97, blue: 0.98, alpha: 1 } }],
          borders: [],
          shadows: []
        },
        opacity: 1,
        blendMode: 0
      },
      {
        id: 'nav-bar',
        name: '导航栏',
        type: LayerType.GROUP,
        visible: true,
        locked: false,
        rect: { x: 0, y: 0, width: 375, height: 88 },
        layers: [
          {
            id: 'nav-bg',
            name: '导航背景',
            type: LayerType.SHAPE,
            visible: true,
            locked: false,
            rect: { x: 0, y: 0, width: 375, height: 88 },
            layers: [],
            style: {
              fills: [{ color: { red: 1, green: 1, blue: 1, alpha: 1 } }],
              borders: [
                { color: { red: 0.93, green: 0.93, blue: 0.95, alpha: 1 }, thickness: 1, position: 'bottom' }
              ],
              shadows: [
                { x: 0, y: 2, blur: 8, spread: 0, color: { red: 0, green: 0, blue: 0, alpha: 0.05 } }
              ]
            },
            opacity: 1,
            blendMode: 0
          },
          {
            id: 'nav-title',
            name: '导航标题',
            type: LayerType.TEXT,
            visible: true,
            locked: false,
            rect: { x: 127.5, y: 52, width: 120, height: 28 },
            layers: [],
            style: {
              fills: [{ color: { red: 0.12, green: 0.16, blue: 0.23, alpha: 1 } }],
              borders: [],
              shadows: []
            },
            opacity: 1,
            blendMode: 0,
            textContent: '业绩达成',
            textStyles: {
              fontFamily: 'PingFang SC',
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 28,
              letterSpacing: 0,
              color: '#1E293B'
            }
          }
        ]
      },
      {
        id: 'card-container',
        name: '卡片容器',
        type: LayerType.GROUP,
        visible: true,
        locked: false,
        rect: { x: 16, y: 104, width: 343, height: 500 },
        layers: [
          {
            id: 'card-1',
            name: '渠道卡片A',
            type: LayerType.GROUP,
            visible: true,
            locked: false,
            rect: { x: 16, y: 104, width: 343, height: 140 },
            layers: [
              {
                id: 'card-bg-1',
                name: '卡片背景',
                type: LayerType.SHAPE,
                visible: true,
                locked: false,
                rect: { x: 16, y: 104, width: 343, height: 140 },
                layers: [],
                style: {
                  fills: [{ color: { red: 1, green: 1, blue: 1, alpha: 1 } }],
                  borders: [],
                  shadows: [
                    { x: 0, y: 2, blur: 12, spread: 0, color: { red: 0, green: 0, blue: 0, alpha: 0.08 } }
                  ]
                },
                opacity: 1,
                blendMode: 0
              },
              {
                id: 'card-header-1',
                name: '卡片头部',
                type: LayerType.GROUP,
                visible: true,
                locked: false,
                rect: { x: 32, y: 120, width: 311, height: 44 },
                layers: [
                  {
                    id: 'channel-name-1',
                    name: '渠道名称',
                    type: LayerType.TEXT,
                    visible: true,
                    locked: false,
                    rect: { x: 32, y: 128, width: 80, height: 24 },
                    layers: [],
                    style: {
                      fills: [{ color: { red: 0.2, green: 0.24, blue: 0.32, alpha: 1 } }],
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
                      lineHeight: 24,
                      letterSpacing: 0,
                      color: '#334155'
                    }
                  },
                  {
                    id: 'trend-badge-1',
                    name: '趋势徽章',
                    type: LayerType.SHAPE,
                    visible: true,
                    locked: false,
                    rect: { x: 287, y: 128, width: 56, height: 24 },
                    layers: [],
                    style: {
                      fills: [{ color: { red: 0.94, green: 0.98, blue: 0.95, alpha: 1 } }],
                      borders: [],
                      shadows: []
                    },
                    opacity: 1,
                    blendMode: 0
                  }
                ]
              },
              {
                id: 'metrics-1',
                name: '数据指标',
                type: LayerType.GROUP,
                visible: true,
                locked: false,
                rect: { x: 32, y: 176, width: 311, height: 52 },
                layers: [
                  {
                    id: 'target-label-1',
                    name: '目标标签',
                    type: LayerType.TEXT,
                    visible: true,
                    locked: false,
                    rect: { x: 32, y: 176, width: 32, height: 20 },
                    layers: [],
                    style: {
                      fills: [{ color: { red: 0.4, green: 0.44, blue: 0.52, alpha: 1 } }],
                      borders: [],
                      shadows: []
                    },
                    opacity: 1,
                    blendMode: 0,
                    textContent: '目标',
                    textStyles: {
                      fontFamily: 'PingFang SC',
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 20,
                      letterSpacing: 0,
                      color: '#6B7280'
                    }
                  },
                  {
                    id: 'target-value-1',
                    name: '目标值',
                    type: LayerType.TEXT,
                    visible: true,
                    locked: false,
                    rect: { x: 32, y: 196, width: 60, height: 28 },
                    layers: [],
                    style: {
                      fills: [{ color: { red: 0.06, green: 0.09, blue: 0.16, alpha: 1 } }],
                      borders: [],
                      shadows: []
                    },
                    opacity: 1,
                    blendMode: 0,
                    textContent: '1000万',
                    textStyles: {
                      fontFamily: 'SF Pro Display',
                      fontSize: 18,
                      fontWeight: 600,
                      lineHeight: 28,
                      letterSpacing: -0.5,
                      color: '#0F172A'
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ];

    // 创建完整的设计系统
    const designSystem: DesignSystem = {
      colors: [
        { id: 'primary-blue', name: '主色调蓝', hex: '#3B82F6', value: 'rgba(59,130,246,1)', usage: [], source: 'document' },
        { id: 'success-green', name: '成功绿', hex: '#10B981', value: 'rgba(16,185,129,1)', usage: [], source: 'document' },
        { id: 'danger-red', name: '危险红', hex: '#EF4444', value: 'rgba(239,68,68,1)', usage: [], source: 'document' },
        { id: 'text-primary', name: '主要文本', hex: '#1E293B', value: 'rgba(30,41,59,1)', usage: [], source: 'document' },
        { id: 'text-secondary', name: '次要文本', hex: '#334155', value: 'rgba(51,65,85,1)', usage: [], source: 'document' },
        { id: 'text-tertiary', name: '第三文本', hex: '#6B7280', value: 'rgba(107,114,128,1)', usage: [], source: 'document' },
        { id: 'text-dark', name: '深色文本', hex: '#0F172A', value: 'rgba(15,23,42,1)', usage: [], source: 'document' },
        { id: 'bg-white', name: '白色背景', hex: '#FFFFFF', value: 'rgba(255,255,255,1)', usage: [], source: 'document' },
        { id: 'bg-page', name: '页面背景', hex: '#F8FAFC', value: 'rgba(248,250,252,1)', usage: [], source: 'document' },
        { id: 'bg-success-light', name: '成功浅色', hex: '#D1FAE5', value: 'rgba(209,250,229,1)', usage: [], source: 'document' },
        { id: 'border-light', name: '浅色边框', hex: '#E2E8F0', value: 'rgba(226,232,240,1)', usage: [], source: 'document' }
      ],
      textStyles: [
        {
          id: 'nav-title',
          name: '导航标题',
          fontFamily: 'PingFang SC',
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 28,
          letterSpacing: 0,
          color: '#1E293B'
        },
        {
          id: 'section-title',
          name: '区块标题',
          fontFamily: 'PingFang SC',
          fontSize: 16,
          fontWeight: 500,
          lineHeight: 24,
          letterSpacing: 0,
          color: '#334155'
        },
        {
          id: 'body-text',
          name: '正文文本',
          fontFamily: 'PingFang SC',
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 20,
          letterSpacing: 0,
          color: '#6B7280'
        },
        {
          id: 'caption-text',
          name: '说明文本',
          fontFamily: 'PingFang SC',
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 20,
          letterSpacing: 0,
          color: '#6B7280'
        },
        {
          id: 'metric-value',
          name: '数值文本',
          fontFamily: 'SF Pro Display',
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 28,
          letterSpacing: -0.5,
          color: '#0F172A'
        }
      ],
      layerStyles: [],
      gradients: [],
      spacing: [
        { id: 'space-4', name: '超小间距', value: 4, unit: 'px' },
        { id: 'space-8', name: '小间距', value: 8, unit: 'px' },
        { id: 'space-12', name: '中小间距', value: 12, unit: 'px' },
        { id: 'space-16', name: '中间距', value: 16, unit: 'px' },
        { id: 'space-20', name: '中大连距', value: 20, unit: 'px' },
        { id: 'space-24', name: '大间距', value: 24, unit: 'px' },
        { id: 'space-32', name: '大连距', value: 32, unit: 'px' }
      ]
    };

    console.log('\n📊 测试数据准备完成:');
    console.log(`- 图层数量: ${testLayers.length}`);
    console.log(`- 设计系统: ${designSystem.colors.length} 颜色, ${designSystem.textStyles.length} 字体, ${designSystem.spacing.length} 间距\n`);

    // 使用高精度生成器
    console.log('🤖 开始高精度代码生成...');
    const generator = new HighFidelityGenerator({
      framework: 'vue',
      cssFramework: 'custom',
      outputFormat: 'sfc',
      componentName: '业绩达成页面',
      enableVerification: false
    });

    const result = await generator.generateComponent(
      '业绩达成页面',
      testLayers,
      designSystem,
      { framework: 'vue', cssFramework: 'custom' }
    );

    console.log('\n✅ 高精度生成完成!');
    console.log(`📄 文件名: ${result.fileName}`);
    console.log(`📝 模板长度: ${result.template.length} 字符`);
    console.log(`🔧 脚本长度: ${result.script.length} 字符`);
    console.log(`🎨 样式长度: ${result.style.length} 字符`);

    // 保存生成的代码
    const outputDir = join(__dirname, 'output', 'high-fidelity-test');
    await mkdir(outputDir, { recursive: true });

    const fs = await import('node:fs/promises');
    const outputPath = join(outputDir, result.fileName);
    await fs.writeFile(outputPath, result.sfcTemplate, 'utf-8');

    console.log(`💾 已保存到: ${outputPath}`);

    // 显示代码质量分析
    console.log('\n📋 代码质量分析:');

    // 检查颜色精确度
    const colorMatches = (result.style.match(/#[0-9A-Fa-f]{6}/g) || []).length;
    console.log(`- 颜色使用: ${colorMatches} 个精确颜色值`);

    // 检查布局精确度
    const positionMatches = (result.style.match(/position:\s*(absolute|relative)/g) || []).length;
    console.log(`- 精确定位: ${positionMatches} 个定位元素`);

    // 检查尺寸精确度
    const sizeMatches = (result.style.match(/\d+px/g) || []).length;
    console.log(`- 精确尺寸: ${sizeMatches} 个像素值`);

    console.log('\n' + '='.padEnd(70, '='));
    console.log('🎉 高精度测试完成！');
    console.log(`📁 输出目录: output/high-fidelity-test/`);
    console.log(`🔍 调试信息: output/debug/`);

    // 显示生成的代码预览
    console.log('\n📋 代码预览:');
    console.log('--- Template (前300字符) ---');
    console.log(result.template.substring(0, Math.min(300, result.template.length)) + '...');
    console.log('\n--- Style (前300字符) ---');
    console.log(result.style.substring(0, Math.min(300, result.style.length)) + '...');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

main().catch(console.error);
