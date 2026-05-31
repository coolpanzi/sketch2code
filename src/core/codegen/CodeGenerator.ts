/**
 * 基于新架构的代码生成器
 * 使用重构后的数据结构和类型定义
 */

import {
  GenerationResult,
  GenerationConfig,
  SketchFile,
  Layer,
  LayerType,
  DesignSystem,
  ColorDefinition,
  TextStyleDefinition
} from '../types.js';

// 延迟加载配置模块，避免路径问题
let configModule: any;
let createLLMClient: any;

async function getConfig() {
  if (!configModule) {
    // 使用绝对路径从项目根目录导入
    const projectRoot = process.cwd();
    const configPath = `${projectRoot}/src/config.ts`;
    const fileUrl = `file://${configPath}`;
    configModule = await import(fileUrl);
    createLLMClient = configModule.createLLMClient;
  }
  return configModule;
}

/**
 * 基于新架构的代码生成器
 */
export class CodeGenerator {
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

    // 构建系统prompt
    const systemPrompt = this.buildSystemPrompt(designSystem, context);

    // 构建用户消息
    const userMessage = this.buildUserMessage(componentName, layers, designSystem);

    // 调用LLM生成代码
    const config = await getConfig();
    const loadedConfig = await config.loadConfig();

    const response = await this.llmClient.chat.completions.create({
      model: loadedConfig.llmModel,  // 使用配置中的模型
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,  // 更低的温度以获得更确定的输出
      max_tokens: 16000  // 利用大上下文窗口 (131072)，设置合理的最大输出
    });

    const content = response.choices?.[0]?.message?.content || '';

    // 循环检测 - 检查是否有重复内容
    const lines = content.split('\n');
    const uniqueLines = new Set(lines);
    if (lines.length > 50 && uniqueLines.size < lines.length * 0.1) {
      console.log('⚠️ 检测到模型循环 - 返回备用结果');
      return this.buildFallbackResult(componentName, 'Model detected in loop');
    }

    // Debug logging and save raw response
    console.log('🔍 LLM Response Debug:');
    console.log('   Has choices:', response.choices ? 'Yes' : 'No');
    console.log('   Choices length:', response.choices?.length || 0);
    console.log('   Has content:', content ? 'Yes (' + content.length + ' chars)' : 'No');
    console.log('   Lines:', lines.length, 'Unique lines:', uniqueLines.size);
    console.log('   Content preview:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));

    // Save raw response for debugging
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const debugDir = './output/debug';
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(path.join(debugDir, 'raw-llm-response.json'), content);
      console.log('   Raw response saved to:', path.join(debugDir, 'raw-llm-response.json'));
    } catch (e) {
      console.log('   Could not save debug file:', e.message);
    }

    // 解析响应
    return this.parseResponse(content, componentName);
  }

  /**
   * 批量生成多个组件
   */
  async generateComponents(
    sketchFile: SketchFile,
    config?: {
      maxComponents?: number;
      selectedPages?: string[];
    }
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    const maxComponents = config?.maxComponents || 10;

    // 遍历所有页面的artboards
    for (const page of sketchFile.pages) {
      for (const artboard of page.artboards) {
        if (results.length >= maxComponents) break;

        try {
          const result = await this.generateComponent(
            artboard.name,
            artboard.layers,
            sketchFile.designSystem,
            { framework: 'vue', cssFramework: 'tailwind' }
          );
          results.push(result);
        } catch (error) {
          console.error(`Failed to generate component for ${artboard.name}:`, error);
        }
      }
    }

    return results;
  }

  /**
   * 构建系统prompt
   */
  private buildSystemPrompt(
    designSystem: DesignSystem,
    context?: { framework?: string; cssFramework?: string }
  ): string {
    // 极简提示 - 避免触发循环
    return `JSON API only. Return this format:
{"template": "HTML", "script": "TS code", "style": "CSS", "fileName": "Name.vue", "usedTokens": {"colors": [], "spacing": [], "typography": []}}`;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(
    componentName: string,
    layers: Layer[],
    designSystem: DesignSystem
  ): string {
    // 极简用户消息 - 只提供基本信息
    const textCount = layers.filter(l => l.type === LayerType.TEXT).length;
    const groupCount = layers.filter(l => l.type === LayerType.GROUP).length;

    return `Component: ${componentName}
Text layers: ${textCount}
Group layers: ${groupCount}

Return JSON only.`;
  }

  /**
   * 分析图层结构
   */
  private analyzeLayerStructure(layers: Layer[]): string {
    const info: string[] = [];

    for (const layer of layers) {
      if (layer.type === LayerType.TEXT && (layer as any).textContent) {
        info.push(`  - Text: "${(layer as any).textContent}" (${layer.rect.width}x${layer.rect.height}px)`);
      } else if (layer.type === LayerType.SHAPE) {
        info.push(`  - Shape: ${layer.name} (${layer.rect.width}x${layer.rect.height}px)`);
      } else if (layer.type === LayerType.GROUP) {
        info.push(`  - Group: ${layer.name} (${layer.layers.length} children)`);
      } else if (layer.type === LayerType.SYMBOL) {
        info.push(`  - Symbol: ${layer.name} → ${(layer as any).symbolMasterName}`);
      }
    }

    return info.join('\n') || '  No detailed structure available';
  }

  /**
   * 检测组件类型
   */
  private detectComponentType(layers: Layer[]): string {
    const hasText = layers.some(l => l.type === LayerType.TEXT);
    const hasShape = layers.some(l => l.type === LayerType.SHAPE);
    const hasSymbol = layers.some(l => l.type === LayerType.SYMBOL);
    const hasGroup = layers.some(l => l.type === LayerType.GROUP);

    if (hasSymbol && hasGroup) return 'Complex Component with Symbols';
    if (hasText && hasShape) return 'Text + Shape Component';
    if (hasText) return 'Text-Heavy Component';
    if (hasShape) return 'Shape-Based Component';
    if (hasSymbol) return 'Symbol-Based Component';
    return 'Basic Component';
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(layers: Layer[]): string[] {
    const texts: string[] = [];

    function extractFromLayer(layer: Layer) {
      if (layer.type === LayerType.TEXT && (layer as any).textContent) {
        texts.push((layer as any).textContent);
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
   * 解析LLM响应
   */
  private parseResponse(content: string, componentName: string): GenerationResult {
    // 尝试解析JSON
    const cleaned = this.extractJsonFromResponse(content);

    console.log('🔍 Parsing Debug:');
    console.log('   Original length:', content.length);
    console.log('   Cleaned length:', cleaned.length);
    console.log('   Cleaned preview:', cleaned.substring(0, 200) + '...');

    try {
      const parsed = JSON.parse(cleaned);

      console.log('✅ JSON parsed successfully');
      console.log('   Has template:', !!parsed.template);
      console.log('   Has script:', !!parsed.script);
      console.log('   Has style:', !!parsed.style);

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
      // 如果JSON解析失败，使用备用方案
      console.log('❌ JSON parsing failed:', error.message);
      console.log('   Error position:', error.position || 'unknown');
      console.log('   Attempting to fix JSON...');

      // Try to fix common JSON issues
      try {
        const fixed = this.attemptJsonFix(cleaned);
        const parsed = JSON.parse(fixed);
        console.log('✅ JSON fixed and parsed successfully');
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
        console.log('❌ JSON fix failed:', fixError.message);
        return this.buildFallbackResult(componentName, content);
      }
    }
  }

  /**
   * 从响应中提取JSON
   */
  private extractJsonFromResponse(text: string): string {
    let cleaned = text.trim();

    // 处理 "Thinking Process" 前缀 (Qwen模型特有)
    const thinkingMatch = cleaned.match(/(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=```json)/s);
    if (thinkingMatch) {
      console.log('🔧 检测到思考过程，提取JSON部分...');
      cleaned = cleaned.substring(thinkingMatch[0].length).trim();
    }

    // 优先查找 JSON 代码块 (更精确的匹配)
    const jsonCodeBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlockMatch) {
      console.log('🔧 找到JSON代码块，提取JSON...');
      cleaned = jsonCodeBlockMatch[1].trim();
    } else {
      // 回退到普通代码块匹配
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        console.log('🔧 找到代码块，提取内容...');
        cleaned = codeBlockMatch[1].trim();
      } else {
        // 最后尝试找到JSON对象
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('🔧 找到JSON对象，提取...');
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

    // 清理可能的包装标签
    template = this.stripTagWrapper(template, 'template');
    script = this.stripTagWrapper(script, 'script');
    style = this.stripTagWrapper(style, 'style');

    return `<template>\n${template}\n</template>\n\n<script setup lang="ts">\n${script || '// Generated script'}\n</script>\n\n${style ? `<style scoped>\n${style}\n</style>` : ''}`;
  }

  /**
   * 尝试修复常见的JSON问题
   */
  private attemptJsonFix(jsonString: string): string {
    let fixed = jsonString;

    // Fix common issues: unescaped newlines in template strings
    // This is a conservative approach - only fix obvious issues
    try {
      // Try parsing first - if it works, return as-is
      JSON.parse(fixed);
      return fixed;
    } catch (e) {
      // If parsing failed, try to fix common issues
      // Fix unescaped newlines in string values (very common in LLM output)
      // This regex finds newlines inside quoted strings and escapes them
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
  private buildFallbackResult(componentName: string, content: string): GenerationResult {
    return {
      componentName,
      sfcTemplate: `<template>\n  <div class="component">\n    <!-- Fallback: LLM generation failed -->\n    ${componentName}\n  </div>\n</template>`,
      template: `<div class="component">\n  <!-- Fallback: LLM generation failed -->\n  ${componentName}\n</div>`,
      script: '// Generated script',
      style: '/* Generated styles */',
      fileName: `${this.sanitizeFileName(componentName)}.vue`,
      usedTokens: { colors: [], spacing: [], typography: [] }
    };
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
      .replace(/^[0-9]/, '_') || 'Component';
  }
}

/**
 * 便捷函数：生成组件代码
 */
export async function generateComponentCode(
  componentName: string,
  layers: Layer[],
  designSystem: DesignSystem,
  config?: GenerationConfig
): Promise<GenerationResult> {
  const generator = new CodeGenerator(config || {
    framework: 'vue',
    cssFramework: 'tailwind',
    outputFormat: 'sfc',
    componentName: '',
    enableVerification: false
  });

  return await generator.generateComponent(componentName, layers, designSystem);
}