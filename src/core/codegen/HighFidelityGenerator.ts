/**
 * 高精度设计还原生成器
 * 专注于像素级精确的设计还原
 */

import {
  GenerationResult,
  GenerationConfig,
  Layer,
  LayerType,
  DesignSystem,
  ColorDefinition,
  TextStyleDefinition
} from '../types.js';

// 延迟加载配置模块
let configModule: any;
let createLLMClient: any;

async function getConfig() {
  if (!configModule) {
    const projectRoot = process.cwd();
    const configPath = `${projectRoot}/src/config.ts`;
    const fileUrl = `file://${configPath}`;
    configModule = await import(fileUrl);
    createLLMClient = configModule.createLLMClient;
  }
  return configModule;
}

/**
 * 精确颜色转换工具
 */
class ColorConverter {
  static sketchToRGBA(color: { red: number; green: number; blue: number; alpha: number }): string {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);
    const a = color.alpha.toFixed(2);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  static rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  static rgbaToHex(rgba: string): string {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return '#' + [match[1], match[2], match[3]].map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    return rgba;
  }
}

/**
 * 高精度设计还原生成器
 */
export class HighFidelityGenerator {
  private config: GenerationConfig;
  private llmClient: any;

  constructor(config: GenerationConfig) {
    this.config = config;
    this.llmClient = null;
  }

  /**
   * 生成高精度还原的组件代码
   */
  async generateComponent(
    componentName: string,
    layers: Layer[],
    designSystem: DesignSystem,
    context?: {
      framework?: string;
      cssFramework?: string;
    }
  ): Promise<GenerationResult> {
    // 动态加载配置模块
    if (!this.llmClient) {
      const config = await getConfig();
      this.llmClient = createLLMClient(await config.loadConfig());
    }

    console.log(`🎯 开始高精度还原: ${componentName}`);
    console.log(`   图层数: ${layers.length}`);
    console.log(`   设计系统: ${designSystem.colors.length} 颜色, ${designSystem.textStyles.length} 字体`);

    // 构建极致详细的系统prompt
    const systemPrompt = this.buildUltimateSystemPrompt(designSystem, context);

    // 构建极致详细的用户消息
    const userMessage = this.buildUltimateUserMessage(componentName, layers, designSystem);

    // 调用LLM生成代码
    const config = await getConfig();
    const loadedConfig = await config.loadConfig();

    console.log('🤖 调用LLM进行高精度生成...');
    const response = await this.llmClient.chat.completions.create({
      model: loadedConfig.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      max_tokens: 16000
    });

    const content = response.choices?.[0]?.message?.content || '';
    console.log(`📥 LLM响应: ${content.length} 字符`);

    // 保存调试信息
    await this.saveDebugInfo(systemPrompt, userMessage, content);

    // 解析响应
    return this.parseResponse(content, componentName);
  }

  /**
   * 构建极致详细的系统prompt
   */
  private buildUltimateSystemPrompt(
    designSystem: DesignSystem,
    context?: { framework?: string; cssFramework?: string }
  ): string {
    const framework = context?.framework || 'vue';
    const cssFramework = context?.cssFramework || 'custom';

    // 构建精确颜色映射
    const colorMapping = this.buildPreciseColorMapping(designSystem.colors);

    // 构建精确字体映射
    const fontMapping = this.buildPreciseFontMapping(designSystem.textStyles);

    // 构建间距映射
    const spacingMapping = this.buildPreciseSpacingMapping(designSystem.spacing);

    return `你是一个世界级的前端代码生成专家，专门负责像素级精确的设计还原。

# 核心使命
生成与设计稿完全一致的代码，精确到每一个像素、每一种颜色、每一个字体规格。

# 设计系统规范（必须严格遵守）

## 精确颜色系统
${colorMapping}

## 精确字体系统
${fontMapping}

## 精确间距系统
${spacingMapping}

# 还原原则

1. **像素级精确**: 所有位置、尺寸必须精确到像素，不允许四舍五入
2. **颜色精确匹配**: 使用提供的精确颜色值，不允许近似值
3. **字体精确还原**: 使用提供的字体规格，包括字号、字重、行高、字间距
4. **布局精确还原**: 保持图层层次结构，精确还原布局关系
5. **样式精确应用**: 阴影、圆角、边框等样式必须精确匹配

# 输出要求

返回严格的JSON格式，不要添加任何解释：

\`\`\`json
{
  "template": "HTML模板，精确还原设计结构",
  "script": "TypeScript脚本，包含所有必要的数据和交互",
  "style": "CSS样式，精确到每个像素和颜色值",
  "fileName": "ComponentName.vue",
  "fidelityReport": {
    "colorAccuracy": "颜色还原精度评估",
    "layoutAccuracy": "布局还原精度评估",
    "typographyAccuracy": "字体还原精度评估"
  }
}
\`\`\`

# 质量标准
- 颜色误差 < 1%
- 位置误差 < 2px
- 尺寸误差 < 1px
- 字体误差 < 1px
- 整体还原度 > 95%`;
  }

  /**
   * 构建精确颜色映射
   */
  private buildPreciseColorMapping(colors: ColorDefinition[]): string {
    if (colors.length === 0) return '  无预定义颜色';

    return colors.map(color => {
      const rgba = color.value || this.hexToRgba(color.hex || '#000000');
      return `  ${color.name}: ${color.hex} (${rgba}) - 使用 ${color.hex}`;
    }).join('\n');
  }

  /**
   * 构建精确字体映射
   */
  private buildPreciseFontMapping(textStyles: TextStyleDefinition[]): string {
    if (textStyles.length === 0) return '  无预定义字体';

    return textStyles.map(font => {
      const size = font.fontSize || 14;
      const weight = font.fontWeight || 'normal';
      const lineHeight = font.lineHeight || (size * 1.4);
      const letterSpacing = font.letterSpacing || 0;

      return `  ${font.name}: ${font.fontFamily || 'sans-serif'} ${size}px ${weight} (行高: ${lineHeight}px, 字间距: ${letterSpacing}px)`;
    }).join('\n');
  }

  /**
   * 构建精确间距映射
   */
  private buildPreciseSpacingMapping(spacing: any[]): string {
    if (spacing.length === 0) return '  无预定义间距';

    return spacing.map(space => {
      const value = space.value || 8;
      const unit = space.unit || 'px';
      return `  ${space.name}: ${value}${unit}`;
    }).join('\n');
  }

  /**
   * 构建极致详细的用户消息
   */
  private buildUltimateUserMessage(
    componentName: string,
    layers: Layer[],
    designSystem: DesignSystem
  ): string {
    const layersDetail = this.extractPreciseLayerInfo(layers);
    const designSpecs = this.generateDesignSpecifications(layers, designSystem);
    const visualHierarchy = this.analyzeVisualHierarchy(layers);

    return `# 高精度还原任务

## 组件信息
- **名称**: ${componentName}
- **图层数量**: ${layers.length}
- **复杂度**: ${this.assessComplexity(layers)}

## 设计规格详情

### 精确图层信息
${layersDetail}

### 设计规格
${designSpecs}

### 视觉层次分析
${visualHierarchy}

## 还原要求

1. **严格按照上述规格生成代码**
2. **使用设计系统中定义的精确颜色值**
3. **保持图层层次结构**
4. **精确还原位置、尺寸、样式**
5. **确保代码可直接运行**

请返回JSON格式的代码。`;
  }

  /**
   * 提取精确图层信息
   */
  private extractPreciseLayerInfo(layers: Layer[]): string {
    const info: string[] = [];

    function extractLayer(layer: Layer, indent: string = '') {
      const baseInfo = `${indent}- **${layer.name}** (${layer.type})`;

      // 精确位置和尺寸
      const posInfo = ` [x:${layer.rect.x}, y:${layer.rect.y}, w:${layer.rect.width}, h:${layer.rect.height}px]`;

      let styleInfo = '';
      if (layer.style) {
        // 精确颜色信息
        if (layer.style.fills && layer.style.fills.length > 0) {
          const fill = layer.style.fills[0];
          if (fill.color) {
            const rgba = ColorConverter.sketchToRGBA(fill.color);
            const hex = ColorConverter.rgbToHex(fill.color.red, fill.color.green, fill.color.blue);
            styleInfo = ` fill:${hex}(${rgba})`;
          }
        }
        // 边框信息
        if (layer.style.borders && layer.style.borders.length > 0) {
          const border = layer.style.borders[0];
          if (border.color) {
            const rgba = ColorConverter.sketchToRGBA(border.color);
            const hex = ColorConverter.rgbToHex(border.color.red, border.color.green, border.color.blue);
            styleInfo += ` border:${border.thickness}px ${hex}(${rgba})`;
          }
        }
        // 阴影信息
        if (layer.style.shadows && layer.style.shadows.length > 0) {
          const shadow = layer.style.shadows[0];
          if (shadow.color) {
            const rgba = ColorConverter.sketchToRGBA(shadow.color);
            styleInfo += ` shadow:${shadow.x}px ${shadow.y}px ${shadow.blur}px ${rgba}`;
          }
        }
      }

      // 文本内容
      let textInfo = '';
      if (layer.type === LayerType.TEXT && (layer as any).textContent) {
        const textStyles = (layer as any).textStyles;
        textInfo = ` text:"${ (layer as any).textContent}"`;
        if (textStyles) {
          textInfo += ` [${textStyles.fontFamily || 'sans-serif'} ${textStyles.fontSize || 14}px ${textStyles.fontWeight || 'normal'}]`;
        }
      }

      info.push(`${baseInfo}${posInfo}${styleInfo}${textInfo}`);

      // 递归处理子图层
      if (layer.layers && Array.isArray(layer.layers)) {
        for (const subLayer of layer.layers) {
          extractLayer(subLayer, indent + '  ');
        }
      }
    }

    for (const layer of layers) {
      extractLayer(layer);
    }

    return info.join('\n') || '无图层信息';
  }

  /**
   * 生成设计规格
   */
  private generateDesignSpecifications(layers: Layer[], designSystem: DesignSystem): string {
    const specs: string[] = [];

    // 计算总体尺寸
    let totalWidth = 0, totalHeight = 0;
    for (const layer of layers) {
      totalWidth = Math.max(totalWidth, layer.rect.x + layer.rect.width);
      totalHeight = Math.max(totalHeight, layer.rect.y + layer.rect.height);
    }

    specs.push(`**总尺寸**: ${totalWidth}x${totalHeight}px`);
    specs.push(`**设计颜色**: ${designSystem.colors.length}个`);
    specs.push(`**设计字体**: ${designSystem.textStyles.length}个`);
    specs.push(`**设计间距**: ${designSystem.spacing.length}个`);

    return specs.join('\n');
  }

  /**
   * 分析视觉层次
   */
  private analyzeVisualHierarchy(layers: Layer[]): string {
    const hierarchy: string[] = [];

    // 按z-index排序（基于图层层级）
    const sortedLayers = [...layers].sort((a, b) => {
      const aDepth = this.calculateLayerDepth(a);
      const bDepth = this.calculateLayerDepth(b);
      return aDepth - bDepth;
    });

    hierarchy.push('**视觉层级** (从底到顶):');
    sortedLayers.forEach((layer, index) => {
      const depth = this.calculateLayerDepth(layer);
      hierarchy.push(`${index + 1}. ${layer.name} (深度:${depth})`);
    });

    return hierarchy.join('\n');
  }

  /**
   * 计算图层深度
   */
  private calculateLayerDepth(layer: Layer): number {
    let maxChildDepth = 0;
    if (layer.layers && Array.isArray(layer.layers)) {
      for (const child of layer.layers) {
        maxChildDepth = Math.max(maxChildDepth, this.calculateLayerDepth(child));
      }
    }
    return maxChildDepth + 1;
  }

  /**
   * 评估复杂度
   */
  private assessComplexity(layers: Layer[]): string {
    let complexity = '简单';
    let score = 0;

    for (const layer of layers) {
      score += this.calculateLayerComplexity(layer);
    }

    if (score > 50) complexity = '复杂';
    else if (score > 20) complexity = '中等';

    return `${complexity} (评分: ${score})`;
  }

  /**
   * 计算图层复杂度
   */
  private calculateLayerComplexity(layer: Layer): number {
    let score = 1;

    if (layer.layers && layer.layers.length > 0) {
      score += layer.layers.length;
      for (const child of layer.layers) {
        score += this.calculateLayerComplexity(child);
      }
    }

    if (layer.type === LayerType.GROUP) score += 2;
    if (layer.type === LayerType.SYMBOL) score += 3;
    if (layer.type === LayerType.TEXT && (layer as any).textContent) score += 1;

    return score;
  }

  /**
   * 解析响应
   */
  private parseResponse(content: string, componentName: string): GenerationResult {
    const cleaned = this.extractJsonFromResponse(content);

    try {
      const parsed = JSON.parse(cleaned);
      console.log('✅ JSON解析成功');

      return {
        componentName,
        sfcTemplate: this.buildSFCTemplate(parsed, componentName),
        template: parsed.template || '',
        script: parsed.script || '',
        style: parsed.style || '',
        fileName: parsed.fileName || `${this.sanitizeFileName(componentName)}.vue`,
        usedTokens: parsed.usedTokens || { colors: [], spacing: [], typography: [] }
      };
    } catch (error) {
      console.log('❌ JSON解析失败，尝试修复...');
      try {
        const fixed = this.attemptJsonFix(cleaned);
        const parsed = JSON.parse(fixed);
        console.log('✅ JSON修复成功');
        return {
          componentName,
          sfcTemplate: this.buildSFCTemplate(parsed, componentName),
          template: parsed.template || '',
          script: parsed.script || '',
          style: parsed.style || '',
          fileName: parsed.fileName || `${this.sanitizeFileName(componentName)}.vue`,
          usedTokens: parsed.usedTokens || { colors: [], spacing: [], typography: [] }
        };
      } catch (fixError) {
        console.log('❌ JSON修复失败');
        return this.buildFallbackResult(componentName, 'JSON parsing failed');
      }
    }
  }

  /**
   * 从响应中提取JSON
   */
  private extractJsonFromResponse(text: string): string {
    let cleaned = text.trim();

    // 移除思考过程
    const thinkingMatch = cleaned.match(/(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=```json)/s);
    if (thinkingMatch) {
      cleaned = cleaned.substring(thinkingMatch[0].length).trim();
    }

    // 提取JSON代码块
    const jsonCodeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlockMatch) {
      return jsonCodeBlockMatch[1].trim();
    }

    // 回退提取
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // 最后尝试JSON对象
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return cleaned;
  }

  /**
   * 构建SFC模板
   */
  private buildSFCTemplate(parsed: any, componentName: string): string {
    let template = parsed.template || '';
    let script = parsed.script || '';
    let style = parsed.style || '';

    template = this.stripTagWrapper(template, 'template');
    script = this.stripTagWrapper(script, 'script');
    style = this.stripTagWrapper(style, 'style');

    return `<template>\n${template}\n</template>\n\n<script setup lang="ts">\n${script || '// 组件逻辑'}\n</script>\n\n${style ? `<style scoped>\n${style}\n</style>` : ''}`;
  }

  /**
   * 尝试修复JSON
   */
  private attemptJsonFix(jsonString: string): string {
    let fixed = jsonString;

    try {
      JSON.parse(fixed);
      return fixed;
    } catch (e) {
      fixed = fixed.replace(/"((?:[^"\\]|\\.)*)\n((?:[^"\\]|\\.)*)"/g, (match, p1, p2) => {
        return `"${p1}\\n${p2}"`;
      });
    }

    return fixed;
  }

  /**
   * 移除标签包装
   */
  private stripTagWrapper(html: string, tagName: string): string {
    let t = html.trim();
    const re = new RegExp(`^<${tagName}[^>]*>([\\s\\S]*)<\\/${tagName}>$`, 'i');
    let prev: string;
    do {
      prev = t;
      const match = t.match(re);
      if (match) {
        t = match[1].trim();
      }
    } while (t !== prev);
    return t;
  }

  /**
   * 构建备用结果
   */
  private buildFallbackResult(componentName: string, reason: string): GenerationResult {
    return {
      componentName,
      sfcTemplate: `<template>\n  <div class="component-fallback">\n    <h3>${componentName}</h3>\n    <p>生成失败: ${reason}</p>\n  </div>\n</template>`,
      template: `<div class="component-fallback"><h3>${componentName}</h3><p>生成失败: ${reason}</p></div>`,
      script: '// 组件脚本生成失败',
      style: '.component-fallback { padding: 20px; background: #fee; border: 1px solid #f99; }',
      fileName: `${this.sanitizeFileName(componentName)}.vue`,
      usedTokens: { colors: [], spacing: [], typography: [] }
    };
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9一-龥-]/g, '')
      .replace(/^-+|-+$/g, '')
      .replace(/^[0-9]/, '_') || 'Component';
  }

  /**
   * Hex转RGBA
   */
  private hexToRgba(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ?
      `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, 1)` :
      'rgba(0,0,0,1)';
  }

  /**
   * 保存调试信息
   */
  private async saveDebugInfo(systemPrompt: string, userMessage: string, response: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const debugDir = './output/debug';
      await fs.mkdir(debugDir, { recursive: true });

      await fs.writeFile(path.join(debugDir, 'highfi-system-prompt.txt'), systemPrompt);
      await fs.writeFile(path.join(debugDir, 'highfi-user-message.txt'), userMessage);
      await fs.writeFile(path.join(debugDir, 'highfi-llm-response.json'), response);

      console.log('💾 调试信息已保存到:', debugDir);
    } catch (e) {
      console.log('⚠️ 无法保存调试信息:', e.message);
    }
  }
}

/**
 * 便捷函数
 */
export async function generateHighFidelityComponent(
  componentName: string,
  layers: Layer[],
  designSystem: DesignSystem,
  config?: GenerationConfig
): Promise<GenerationResult> {
  const generator = new HighFidelityGenerator(config || {
    framework: 'vue',
    cssFramework: 'custom',
    outputFormat: 'sfc',
    componentName: '',
    enableVerification: false
  });

  return await generator.generateComponent(componentName, layers, designSystem);
}
