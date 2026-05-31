/**
 * 分层还原编排引擎 - Phase 1 → 2(算法) → 3
 * 默认全程零LLM，毫秒级完成
 */

import type { Layer, CSSPropertiesMap, GenerationResult } from '../types.js';
import { PropertyToCSS } from './PropertyToCSS.js';
import { AlgorithmicStructureGenerator } from './AlgorithmicStructureGenerator.js';
import { StructureGenerator } from './StructureGenerator.js';
import { LayoutConverter } from './LayoutConverter.js';

export interface RestoreOptions {
  /** 是否启用布局转换 (Phase 3) */
  enableLayoutConversion?: boolean;
  /** 是否使用LLM增强 (Phase 2 LLM版) */
  useLLM?: boolean;
}

export class LayeredRestorationEngine {
  private phase1 = new PropertyToCSS();
  private phase2Algorithmic = new AlgorithmicStructureGenerator();
  private phase2LLM = new StructureGenerator();
  private phase3 = new LayoutConverter();

  async restore(
    componentName: string,
    artboard: Layer,
    options: RestoreOptions = {}
  ): Promise<GenerationResult> {
    const { enableLayoutConversion = true, useLLM = false } = options;
    const startTime = Date.now();

    console.log(`\n🎯 分层还原: ${componentName}`);
    console.log(`   尺寸: ${Math.round(artboard.rect.width)}×${Math.round(artboard.rect.height)}px`);
    console.log(`   模式: ${useLLM ? 'LLM增强' : '纯算法'}`);

    // Phase 1: 属性直转（算法，零LLM）
    console.log('   Phase 1: 属性直转...');
    const phase1Result = this.phase1.convert(artboard);
    console.log(`   ✅ Phase 1: ${Object.keys(phase1Result.cssMap).length} 个CSS类 (${Date.now() - startTime}ms)`);

    // Phase 2: HTML结构生成
    let phase2Result;
    let llmCalls = 0;

    if (useLLM) {
      // LLM模式（慢，但语义更好）
      console.log('   Phase 2: 结构推理 (LLM)...');
      phase2Result = await this.phase2LLM.generate(
        componentName, artboard,
        phase1Result.cssMap,
        phase1Result.layerClassMap
      );
      llmCalls = 1;
    } else {
      // 算法模式（快，零LLM）
      console.log('   Phase 2: 结构生成 (算法)...');
      phase2Result = this.phase2Algorithmic.generate(
        artboard,
        phase1Result.cssMap,
        phase1Result.layerClassMap
      );
    }
    console.log(`   ✅ Phase 2: template ${phase2Result.template.length}字符, script ${phase2Result.script.length}字符`);

    // Phase 3: 布局转换（可选）
    let finalCSSMap = phase1Result.cssMap;
    let convertedClasses: string[] = [];
    if (enableLayoutConversion) {
      console.log('   Phase 3: 布局转换...');
      const phase3Result = this.phase3.convert(phase1Result.cssMap, artboard, phase1Result.layerClassMap);
      finalCSSMap = phase3Result.cssMap;
      convertedClasses = phase3Result.convertedClasses;
      console.log(`   ✅ Phase 3: ${convertedClasses.length} 个容器转换`);
    }

    // 合并结果
    const cssText = this.cssMapToString(finalCSSMap);
    const usedColors = this.extractUsedTokens(finalCSSMap);
    const generationTime = Date.now() - startTime;

    console.log(`\n   🎉 还原完成 (${generationTime}ms)`);
    console.log(`   📊 类名: ${Object.keys(finalCSSMap).length}个 | 颜色: ${usedColors.length}个 | flex转换: ${convertedClasses.length}个`);

    return {
      componentName,
      template: phase2Result.template,
      script: phase2Result.script,
      style: cssText,
      fileName: this.sanitizeFileName(componentName) + '.vue',
      usedTokens: { colors: usedColors.filter(c => c.startsWith('#')), spacing: [], typography: [] },
      metadata: { generationTime, llmCalls, accuracy: undefined }
    };
  }

  private cssMapToString(cssMap: CSSPropertiesMap): string {
    const lines: string[] = [];
    for (const [className, props] of Object.entries(cssMap)) {
      lines.push(`.${className} {`);
      for (const [prop, value] of Object.entries(props)) {
        lines.push(`  ${prop}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }
    return lines.join('\n');
  }

  private extractUsedTokens(cssMap: CSSPropertiesMap): string[] {
    const colors = new Set<string>();
    for (const cls of Object.values(cssMap)) {
      for (const [key, val] of Object.entries(cls)) {
        if ((key.includes('color') || key.includes('background') || key.includes('border') || key.includes('shadow')) && (val.startsWith('#') || val.startsWith('rgb'))) {
          colors.add(val);
        }
      }
    }
    return Array.from(colors);
  }

  /**
   * Map of Chinese terms to English slugs, ordered longest-first for greedy matching.
   * Multiple terms are concatenated with hyphens so names stay unique.
   */
  private static readonly NAME_MAP: [RegExp, string][] = [
    // Longer/more specific patterns first
    [/业绩达成-产渠道/, 'product-channel'],
    [/业绩达成-渠道/, 'channel'],
    [/业绩达成-机构/, 'organization'],
    [/业绩达成/, 'performance'],
    [/产渠道/, 'product-channel'],
    [/看板/, 'dashboard'],
    [/报表/, 'report'],
    [/首页/, 'home'],
    [/列表/, 'list'],
    [/详情/, 'detail'],
    [/渠道/, 'channel'],
    [/机构/, 'organization'],
    [/导航/, 'nav'],
    [/登录/, 'login'],
    [/搜索/, 'search'],
    [/设置/, 'settings'],
    [/个人/, 'profile'],
    [/消息/, 'messages'],
    [/数据/, 'data'],
  ];

  private sanitizeFileName(name: string): string {
    // Strategy: concatenate ALL matching keywords (longest-first) to form a unique slug
    const parts: string[] = [];

    for (const [re, eng] of LayeredRestorationEngine.NAME_MAP) {
      if (re.test(name) && !parts.includes(eng)) {
        parts.push(eng);
      }
    }

    // If no keywords matched, try transliterating the whole name
    if (parts.length === 0) {
      // Strip leading digits/dots/spaces and transliterate
      const cleaned = name.replace(/^\d+[-.\s]*/, '').trim();
      parts.push(this.transliterateName(cleaned));
    }

    const slug = parts.join('-') || 'component';

    // Preserve the leading numeric prefix (e.g. "1-", "2-", "3-") for guaranteed uniqueness
    const idx = name.match(/^(\d+)/)?.[1];
    return (idx ? idx + '-' : '') + slug;
  }

  /**
   * Simple fallback: convert name to a safe ASCII slug.
   */
  private transliterateName(name: string): string {
    return name
      .replace(/[^\w\s-]/g, '')    // Remove non-word chars (Chinese etc)
      .replace(/\s+/g, '-')         // Spaces to hyphens
      .replace(/-+/g, '-')          // Collapse hyphens
      .replace(/^-+|-+$/g, '')      // Trim hyphens
      .toLowerCase()
      .slice(0, 30)
      || 'component';
  }
}
