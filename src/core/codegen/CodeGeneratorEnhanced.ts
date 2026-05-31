/**
 * 增强型代码生成器
 * 提供详细的设计信息以获得高精度还原
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
 * 增强型代码生成器
 */
export class CodeGeneratorEnhanced {
  private config: GenerationConfig;
  private llmClient: any;

  constructor(config: GenerationConfig) {
    this.config = config;
    this.llmClient = null;
  }

  /**
   * 生成单个组件的代码
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

    console.log(`🎨 开始生成组件: ${componentName}`);
    console.log(`   图层数量: ${layers.length}`);
    console.log(`   设计系统颜色: ${designSystem.colors.length}`);
    console.log(`   设计系统字体: ${designSystem.textStyles.length}`);

    // 构建详细的系统prompt
    const systemPrompt = this.buildDetailedSystemPrompt(designSystem, context);

    // 构建详细的用户消息
    const userMessage = this.buildDetailedUserMessage(componentName, layers, designSystem);

    // 调用LLM生成代码
    const config = await getConfig();
    const loadedConfig = await config.loadConfig();

    console.log('🤖 调用LLM生成代码...');
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

    // Debug logging
    console.log('📥 LLM响应长度:', content.length, '字符');

    // 保存原始响应用于调试
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const debugDir = './output/debug';
      await fs.mkdir(debugDir, { recursive: true });

      // 保存原始响应
      await fs.writeFile(path.join(debugDir, 'raw-llm-response.json'), content);

      // 保存prompt信息
      await fs.writeFile(path.join(debugDir, 'last-system-prompt.txt'), systemPrompt);
      await fs.writeFile(path.join(debugDir, 'last-user-message.txt'), userMessage);

      console.log('💾 调试信息已保存到:', debugDir);
    } catch (e) {
      console.log('⚠️ 无法保存调试文件:', e.message);
    }

    // 解析响应
    return this.parseResponse(content, componentName);
  }

  /**
   * 构建详细的系统prompt
   */
  private buildDetailedSystemPrompt(
    designSystem: DesignSystem,
    context?: { framework?: string; cssFramework?: string }
  ): string {
    const framework = context?.framework || 'vue';
    const cssFramework = context?.cssFramework || 'tailwind';

    // 构建颜色信息
    const colorInfo = designSystem.colors.map(color =>
      `  - ${color.name}: ${color.value} (hex: ${color.hex || 'N/A'})`
    ).join('\n');

    // 构建字体信息
    const fontInfo = designSystem.textStyles.map(font =>
      `  - ${font.name}: ${font.fontFamily || 'sans-serif'}, ${font.fontSize || 14}px, ${font.fontWeight || 'normal'}`
    ).join('\n');

    return `你是一个专业的前端代码生成专家，专门负责将Sketch设计文件高精度还原为${framework.toUpperCase()}组件代码。

# 核心目标
- 生成与设计稿完全一致的代码
- 严格遵循设计系统规范
- 确保布局、颜色、字体、间距都精确匹配
- 代码必须是可运行的、生产级别的质量

# 设计系统规范

## 颜色系统
${colorInfo || '  无预定义颜色'}

## 字体系统
${fontInfo || '  无预定义字体'}

## 响应式设计
- 使用现代CSS布局 (Flexbox, Grid)
- 确保组件在不同屏幕尺寸下都能正常显示
- 使用相对单位和媒体查询

# 输出格式要求
必须严格按照以下JSON格式返回代码，不要添加任何解释性文字：

\`\`\`json
{
  "template": "HTML模板代码，包含完整的组件结构",
  "script": "TypeScript脚本代码，使用Composition API",
  "style": "CSS样式代码，包含所有必要的样式定义",
  "fileName": "ComponentName.vue",
  "usedTokens": {
    "colors": ["使用的颜色名称列表"],
    "spacing": ["使用的间距值列表"],
    "typography": ["使用的字体样式列表"]
  }
}
\`\`\`

# 代码质量要求
1. 使用${framework.toUpperCase()} 3 Composition API和<script setup>语法
2. 使用TypeScript提供类型安全
3. 所有样式必须使用scoped作用域
4. 包含必要的响应式数据、计算属性和方法
5. 添加适当的注释说明关键逻辑
6. 确保代码可以直接运行，无需额外修改`;
  }

  /**
   * 构建详细的用户消息
   */
  private buildDetailedUserMessage(
    componentName: string,
    layers: Layer[],
    designSystem: DesignSystem
  ): string {
    // 提取文本内容
    const textContents = this.extractAllTextContent(layers);

    // 分析图层结构
    const structureInfo = this.analyzeDetailedStructure(layers);

    // 检测组件类型
    const componentType = this.detectComponentType(layers);

    // 提取尺寸信息
    const dimensions = this.extractDimensions(layers);

    let message = `# 组件生成任务

## 组件信息
- 名称: ${componentName}
- 类型: ${componentType}
- 图层总数: ${layers.length}

## 设计规格

### 整体尺寸
${dimensions}

### 文本内容层
${textContents.map(t => `  - "${t.text}" (${t.width}x${t.height}px at ${t.x},${t.y})`).join('\n') || '  无文本层'}

### 图层结构
${structureInfo}

### 设计系统引用
- 可用颜色: ${designSystem.colors.length}个
- 可用字体: ${designSystem.textStyles.length}个

## 生成要求
1. 严格按照上述设计规格生成代码
2. 确保每个文本内容、颜色、尺寸都精确匹配
3. 使用设计系统中的颜色和字体
4. 保持布局结构与设计稿一致
5. 添加必要的交互效果和动画

请返回JSON格式的代码。`;

    return message;
  }

  /**
   * 提取所有文本内容和位置信息
   */
  private extractAllTextContent(layers: Layer[]): Array<{text: string, width: number, height: number, x: number, y: number}> {
    const texts: Array<{text: string, width: number, height: number, x: number, y: number}> = [];

    function extractFromLayer(layer: Layer) {
      if (layer.type === LayerType.TEXT && (layer as any).textContent) {
        texts.push({
          text: (layer as any).textContent,
          width: layer.rect.width,
          height: layer.rect.height,
          x: layer.rect.x,
          y: layer.rect.y
        });
      }
      if (layer.layers && Array.isArray(layer.layers)) {
        for (const subLayer of layer.layers) {
          extractFromLayer(subLayer);
        }
      }
    }

    for (const layer of layers) {
      extractFromLayer(layer);
    }

    return texts;
  }

  /**
   * 分析详细的图层结构
   */
  private analyzeDetailedStructure(layers: Layer[]): string {
    const info: string[] = [];

    function analyzeLayer(layer: Layer, indent: string = '') {
      const basicInfo = `${indent}- ${layer.name} (${layer.type})`;
      const sizeInfo = ` [${layer.rect.width}x${layer.rect.height}px at (${layer.rect.x},${layer.rect.y})]`;

      if (layer.type === LayerType.TEXT && (layer as any).textContent) {
        info.push(`${basicInfo}${sizeInfo} Text: "${(layer as any).textContent}"`);
      } else if (layer.type === LayerType.SHAPE) {
        const shapeInfo = (layer as any).shapeType ? ` ${(layer as any).shapeType}` : '';
        info.push(`${basicInfo}${sizeInfo}${shapeInfo}`);
      } else if (layer.type === LayerType.GROUP) {
        info.push(`${basicInfo}${sizeInfo} (${layer.layers.length} children)`);
        if (layer.layers && Array.isArray(layer.layers)) {
          for (const subLayer of layer.layers) {
            analyzeLayer(subLayer, indent + '  ');
          }
        }
      } else if (layer.type === LayerType.SYMBOL) {
        const symbolInfo = (layer as any).symbolMasterName ? ` → ${(layer as any).symbolMasterName}` : '';
        info.push(`${basicInfo}${sizeInfo}${symbolInfo}`);
      } else {
        info.push(`${basicInfo}${sizeInfo}`);
      }
    }

    for (const layer of layers) {
      analyzeLayer(layer);
    }

    return info.join('\n') || '无详细结构信息';
  }

  /**
   * 提取尺寸信息
   */
  private extractDimensions(layers: Layer[]): string {
    if (layers.length === 0) return '无尺寸信息';

    // 计算总边界框
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    function calculateBounds(layer: Layer) {
      minX = Math.min(minX, layer.rect.x);
      minY = Math.min(minY, layer.rect.y);
      maxX = Math.max(maxX, layer.rect.x + layer.rect.width);
      maxY = Math.max(maxY, layer.rect.y + layer.rect.height);

      if (layer.layers && Array.isArray(layer.layers)) {
        for (const subLayer of layer.layers) {
          calculateBounds(subLayer);
        }
      }
    }

    for (const layer of layers) {
      calculateBounds(layer);
    }

    if (minX === Infinity) return '无法计算尺寸';

    const width = Math.round(maxX - minX);
    const height = Math.round(maxY - minY);

    return `总尺寸: ${width}x${height}px (边界: ${Math.round(minX)},${Math.round(minY)} 到 ${Math.round(maxX)},${Math.round(maxY)})`;
  }

  /**
   * 检测组件类型
   */
  private detectComponentType(layers: Layer[]): string {
    const hasText = layers.some(l => l.type === LayerType.TEXT);
    const hasShape = layers.some(l => l.type === LayerType.SHAPE);
    const hasSymbol = layers.some(l => l.type === LayerType.SYMBOL);
    const hasGroup = layers.some(l => l.type === LayerType.GROUP);
    const hasImage = layers.some(l => l.type === LayerType.BITMAP);

    if (hasSymbol && hasGroup) return '复杂组件(包含符号和组)';
    if (hasImage && hasText) return '图文混合组件';
    if (hasText && hasShape) return '文字+形状组件';
    if (hasText) return '文字为主组件';
    if (hasShape) return '形状为主组件';
    if (hasSymbol) return '符号为主组件';
    if (hasImage) return '图片为主组件';
    return '基础组件';
  }

  /**
   * 解析LLM响应
   */
  private parseResponse(content: string, componentName: string): GenerationResult {
    // 提取JSON
    const cleaned = this.extractJsonFromResponse(content);

    console.log('🔍 解析LLM响应...');
    console.log('   原始长度:', content.length);
    console.log('   清理后长度:', cleaned.length);

    try {
      const parsed = JSON.parse(cleaned);

      console.log('✅ JSON解析成功');
      console.log('   包含template:', !!parsed.template);
      console.log('   包含script:', !!parsed.script);
      console.log('   包含style:', !!parsed.style);

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
      console.log('❌ JSON解析失败:', error.message);

      // 尝试修复JSON
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
        console.log('❌ JSON修复失败:', fixError.message);
        return this.buildFallbackResult(componentName, 'JSON parsing failed');
      }
    }
  }

  /**
   * 从响应中提取JSON
   */
  private extractJsonFromResponse(text: string): string {
    let cleaned = text.trim();

    // 处理思考过程前缀
    const thinkingMatch = cleaned.match(/(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=```json)/s);
    if (thinkingMatch) {
      console.log('🔧 移除思考过程前缀');
      cleaned = cleaned.substring(thinkingMatch[0].length).trim();
    }

    // 优先匹配JSON代码块
    const jsonCodeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlockMatch) {
      console.log('🔧 提取JSON代码块');
      cleaned = jsonCodeBlockMatch[1].trim();
    } else {
      // 回退到普通代码块
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        console.log('🔧 提取普通代码块');
        cleaned = codeBlockMatch[1].trim();
      } else {
        // 最后尝试JSON对象
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('🔧 提取JSON对象');
          cleaned = jsonMatch[0];
        }
      }
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

    // 清理包装标签
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
      // 修复字符串中的未转义换行符
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
    console.log('⚠️ 使用备用结果:', reason);

    return {
      componentName,
      sfcTemplate: `<template>\n  <div class="component-fallback">\n    <h3>${componentName}</h3>\n    <p>代码生成失败: ${reason}</p>\n  </div>\n</template>`,
      template: `<div class="component-fallback">\n  <h3>${componentName}</h3>\n  <p>代码生成失败: ${reason}</p>\n</div>`,
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
}

/**
 * 便捷函数
 */
export async function generateEnhancedComponentCode(
  componentName: string,
  layers: Layer[],
  designSystem: DesignSystem,
  config?: GenerationConfig
): Promise<GenerationResult> {
  const generator = new CodeGeneratorEnhanced(config || {
    framework: 'vue',
    cssFramework: 'tailwind',
    outputFormat: 'sfc',
    componentName: '',
    enableVerification: false
  });

  return await generator.generateComponent(componentName, layers, designSystem);
}
