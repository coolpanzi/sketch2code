# 分层还原引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用算法直转替代LLM猜测视觉属性，实现像素级精确的Sketch→Vue代码还原。

**Architecture:** 三阶段管线：Phase 1 算法将Sketch图层属性直接映射为CSS（零LLM），Phase 2 LLM根据图层树+CSS类名生成HTML结构（不写样式），Phase 3 算法将绝对定位智能转为flex/grid布局。

**Tech Stack:** TypeScript, Vue 3 SFC, OpenAI SDK (local omlx), Node.js

**Spec:** `docs/superpowers/specs/2026-05-30-layered-restoration-design.md`

---

## 文件结构

```
src/core/codegen/
├── PropertyToCSS.ts              # Phase 1: Sketch属性→CSS属性映射
├── StructureGenerator.ts         # Phase 2: LLM结构推理（仅HTML+script）
├── LayoutConverter.ts            # Phase 3: absolute→flex/grid转换
└── LayeredRestorationEngine.ts   # 编排三阶段的引擎入口

src/core/
└── types.ts                      # 修改：添加CSSMap相关类型

test-layered-restoration.ts      # 端到端集成测试
```

---

### Task 1: 添加CSSMap类型定义

**Files:**
- Modify: `src/core/types.ts:434-466`

- [ ] **Step 1: 在types.ts末尾添加CSS映射相关类型**

在 `src/core/types.ts` 文件末尾（`DeepReadonly` 类型之前，约第510行）添加：

```typescript
// ─── 分层还原类型 ───────────────────────────────────────────────────────────

/**
 * 单个CSS属性值（字符串形式，如 "375px", "rgba(59,130,246,1)"）
 */
export type CSSValue = string;

/**
 * CSS属性集合（class名 → CSS属性字典）
 */
export interface CSSPropertiesMap {
  [className: string]: {
    [property: string]: CSSValue;
  };
}

/**
 * BEM类名生成结果
 */
export interface BEMName {
  block: string;      // e.g. "nav-bar"
  element?: string;   // e.g. "title"
  modifier?: string;  // e.g. "active"
  full: string;       // e.g. "nav-bar__title--active"
}

/**
 * Phase 1输出：CSS映射 + 图层→类名映射
 */
export interface PropertyToCSSResult {
  cssMap: CSSPropertiesMap;
  layerClassMap: Map<string, string>;  // layerId → className
}

/**
 * Phase 2输出：HTML模板 + Vue脚本
 */
export interface StructureResult {
  template: string;
  script: string;
}

/**
 * Phase 3输出：转换后的CSS映射
 */
export interface LayoutConvertResult {
  cssMap: CSSPropertiesMap;
  convertedClasses: string[];  // 被转换的class列表
}
```

- [ ] **Step 2: 验证编译通过**

Run: `node --import tsx -e "import './src/core/types.ts'; console.log('OK')"`
Expected: 输出 `OK`，无报错

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add CSSMap types for layered restoration engine"
```

---

### Task 2: 实现 Phase 1 — PropertyToCSS 属性直转引擎

**Files:**
- Create: `src/core/codegen/PropertyToCSS.ts`

- [ ] **Step 1: 创建PropertyToCSS.ts**

```typescript
/**
 * Phase 1: Sketch属性→CSS属性直转引擎
 * 纯算法转换，零LLM调用，保证像素级精确
 */

import {
  Layer, LayerType, BaseLayer, TextLayer, ShapeLayer,
  GroupLayer, ArtboardLayer, ImageLayer, SymbolLayer,
  FillStyle, BorderStyle, ShadowStyle, GradientInfo,
  CSSPropertiesMap, PropertyToCSSResult, BEMName
} from '../types.js';

/**
 * BEM类名生成器
 */
export class BEMGenerator {
  /**
   * 从图层名生成安全的BEM类名
   * "导航栏" → "nav-bar"
   * "卡片背景" → "card-container__bg"（在父级为card-container时）
   */
  static toClassName(name: string): string {
    return name
      .replace(/[\s\/\\]+/g, '-')
      .replace(/[^\w一-鿿-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'layer';
  }

  /**
   * 生成BEM类名
   */
  static create(block: string, element?: string, modifier?: string): BEMName {
    const cleanBlock = BEMGenerator.toClassName(block);
    let full = cleanBlock;

    if (element) {
      const cleanElement = BEMGenerator.toClassName(element);
      full = `${cleanBlock}__${cleanElement}`;
    }

    if (modifier) {
      const cleanModifier = BEMGenerator.toClassName(modifier);
      full += `--${cleanModifier}`;
    }

    return { block: cleanBlock, element, modifier, full };
  }
}

/**
 * Sketch颜色转CSS颜色字符串
 * Sketch使用0-1范围，CSS使用0-255范围
 */
export function sketchColorToCSS(color: any): string {
  if (!color) return 'transparent';

  // 已经是hex格式
  if (typeof color === 'string') {
    if (color.startsWith('#')) return color;
    if (color.startsWith('rgba') || color.startsWith('rgb')) return color;
  }

  const red = Math.round((color.red ?? 0) * 255);
  const green = Math.round((color.green ?? 0) * 255);
  const blue = Math.round((color.blue ?? 0) * 255);
  const alpha = color.alpha ?? 1;

  if (alpha < 1) {
    return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`;
  }
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Hex颜色转CSS（已经是hex的直接返回）
 */
export function hexToCSS(hex: string): string {
  if (!hex || !hex.startsWith('#')) return 'transparent';
  // hex已经是CSS可用的格式
  return hex;
}

/**
 * Phase 1: 属性直转引擎
 */
export class PropertyToCSS {
  private cssMap: CSSPropertiesMap = {};
  private layerClassMap: Map<string, string> = new Map();
  private classCounter: Map<string, number> = new Map();

  /**
   * 转换整个图层树
   */
  convert(artboard: Layer): PropertyToCSSResult {
    this.cssMap = {};
    this.layerClassMap = new Map();
    this.classCounter = new Map();

    // artboard本身作为根容器
    const rootClass = this.getOrCreateClass(artboard);
    this.convertBaseProps(artboard, rootClass);
    if ((artboard as ArtboardLayer).backgroundColor) {
      this.cssMap[rootClass]['background-color'] = hexToCSS((artboard as ArtboardLayer).backgroundColor!);
    }

    // 递归转换子图层
    if (this.hasLayers(artboard)) {
      this.convertChildren(artboard.layers!, rootClass);
    }

    return { cssMap: this.cssMap, layerClassMap: this.layerClassMap };
  }

  /**
   * 递归转换子图层
   */
  private convertChildren(layers: Layer[], parentBlock: string): void {
    for (const layer of layers) {
      if (!layer.visible) continue;

      const className = this.getOrCreateClass(layer);
      const bem = BEMGenerator.create(parentBlock, layer.name);

      // 使用BEM全名
      const cssClass = bem.full;
      this.layerClassMap.set(layer.id, cssClass);

      // 生成CSS属性
      switch (layer.type) {
        case LayerType.TEXT:
          this.convertTextLayer(layer as TextLayer, cssClass);
          break;
        case LayerType.SHAPE:
          this.convertShapeLayer(layer as ShapeLayer, cssClass);
          break;
        case LayerType.IMAGE:
          this.convertImageLayer(layer as ImageLayer, cssClass);
          break;
        case LayerType.GROUP:
        case LayerType.ARTBOARD:
        case LayerType.COMPONENT:
          this.convertBaseProps(layer, cssClass);
          if (this.hasLayers(layer)) {
            this.convertChildren(layer.layers!, layer.name);
          }
          break;
        case LayerType.SYMBOL:
          this.convertBaseProps(layer as SymbolLayer, cssClass);
          break;
        default:
          this.convertBaseProps(layer, cssClass);
      }
    }
  }

  /**
   * 转换基础属性（位置、尺寸、透明度、旋转、圆角、裁剪）
   */
  private convertBaseProps(layer: Layer, className: string): void {
    if (!this.cssMap[className]) this.cssMap[className] = {};

    const props = this.cssMap[className];
    const { rect } = layer;

    // 绝对定位 + 精确位置尺寸
    props['position'] = 'absolute';
    props['left'] = `${Math.round(rect.x)}px`;
    props['top'] = `${Math.round(rect.y)}px`;
    props['width'] = `${Math.round(rect.width)}px`;
    props['height'] = `${Math.round(rect.height)}px`;

    // 透明度（非1时才设置）
    if (layer.opacity !== undefined && layer.opacity < 1) {
      props['opacity'] = layer.opacity.toFixed(2);
    }

    // 旋转
    if (layer.rotation && layer.rotation !== 0) {
      props['transform'] = `rotate(${layer.rotation}deg)`;
    }

    // 圆角
    if (layer.cornerRadius && layer.cornerRadius > 0) {
      props['border-radius'] = `${Math.round(layer.cornerRadius)}px`;
    }

    // 裁剪蒙版
    if (layer.clipsContent) {
      props['overflow'] = 'hidden';
    }

    // 混合模式（非normal时）
    if (layer.blendMode && layer.blendMode !== 0) {
      const blendModes: Record<number, string> = {
        1: 'darken', 2: 'multiply', 3: 'color-burn',
        4: 'lighten', 5: 'screen', 6: 'color-dodge',
        7: 'overlay', 8: 'soft-light', 9: 'hard-light',
        10: 'difference', 11: 'exclusion',
        12: 'hue', 13: 'saturation', 14: 'color', 15: 'luminosity'
      };
      const blendName = blendModes[layer.blendMode];
      if (blendName) props['mix-blend-mode'] = blendName;
    }
  }

  /**
   * 转换文本图层
   */
  private convertTextLayer(layer: TextLayer, className: string): void {
    this.convertBaseProps(layer, className);

    const props = this.cssMap[className];
    const textStyle = (layer as any).textStyle;

    if (textStyle) {
      if (textStyle.fontFamily) {
        props['font-family'] = `'${textStyle.fontFamily}', sans-serif`;
      }
      if (textStyle.fontSize) {
        props['font-size'] = `${Math.round(textStyle.fontSize)}px`;
      }
      if (textStyle.fontWeight) {
        props['font-weight'] = String(textStyle.fontWeight);
      }
      if (textStyle.lineHeight) {
        props['line-height'] = `${Math.round(textStyle.lineHeight)}px`;
      }
      if (textStyle.letterSpacing !== undefined && textStyle.letterSpacing !== 0) {
        props['letter-spacing'] = `${textStyle.letterSpacing}px`;
      }
      if (textStyle.textAlign) {
        props['text-align'] = textStyle.textAlign;
      }
      if (textStyle.color) {
        props['color'] = hexToCSS(textStyle.color);
      }
    }

    // 如果没有从textStyle获取到颜色，尝试从style.fills获取
    if (!props['color'] && (layer as any).style?.fills?.[0]?.color) {
      props['color'] = sketchColorToCSS((layer as any).style.fills[0].color);
    }
  }

  /**
   * 转换形状图层
   */
  private convertShapeLayer(layer: ShapeLayer, className: string): void {
    this.convertBaseProps(layer, className);

    const props = this.cssMap[className];

    // 填充
    this.applyFills(layer.fills, props);

    // 边框
    this.applyBorders(layer.borders, props);

    // 阴影
    this.applyShadows(layer.shadows, props);

    // 特殊形状处理
    if (layer.shapeType === 'oval') {
      props['border-radius'] = '50%';
    }
  }

  /**
   * 转换图像图层
   */
  private convertImageLayer(layer: ImageLayer, className: string): void {
    this.convertBaseProps(layer, className);

    const props = this.cssMap[className];
    props['background-size'] = 'cover';
    props['background-position'] = 'center';
    props['background-repeat'] = 'no-repeat';
  }

  /**
   * 应用填充样式
   */
  private applyFills(fills: FillStyle[], props: Record<string, string>): void {
    for (const fill of fills) {
      if (!fill.isEnabled) continue;

      if (fill.type === 'color' && fill.color) {
        props['background-color'] = hexToCSS(fill.color);
        if (fill.opacity < 1) {
          props['opacity'] = fill.opacity.toFixed(2);
        }
      } else if (fill.type === 'gradient' && fill.gradient) {
        props['background'] = this.gradientToCSS(fill.gradient);
        if (fill.opacity < 1) {
          props['opacity'] = fill.opacity.toFixed(2);
        }
      }
    }
  }

  /**
   * 渐变转CSS
   */
  private gradientToCSS(gradient: GradientInfo): string {
    const stops = gradient.stops
      .sort((a, b) => a.position - b.position)
      .map(stop => `${hexToCSS(stop.color)} ${(stop.position * 100).toFixed(0)}%`)
      .join(', ');

    if (gradient.type === 'radial') {
      return `radial-gradient(circle, ${stops})`;
    }
    // 线性渐变：根据from/to计算角度
    const dx = (gradient.to.x ?? 0.5) - (gradient.from.x ?? 0.5);
    const dy = (gradient.to.y ?? 0) - (gradient.from.y ?? 1);
    const angle = Math.round(Math.atan2(dx, -dy) * (180 / Math.PI));

    return `linear-gradient(${angle}deg, ${stops})`;
  }

  /**
   * 应用边框样式
   */
  private applyBorders(borders: BorderStyle[], props: Record<string, string>): void {
    for (const border of borders) {
      if (!border.isEnabled) continue;

      const color = hexToCSS(border.color);
      const thickness = Math.round(border.thickness);

      // Sketch的border position可能影响box-sizing
      if (border.position === 'inside') {
        props['box-sizing'] = 'border-box';
      }

      // 如果只有一条边框，用简写
      if (borders.length === 1) {
        props['border'] = `${thickness}px solid ${color}`;
      } else {
        // 多条边框，需要具体指定每条
        // 简化处理：合并为一条
        props['border'] = `${thickness}px solid ${color}`;
      }
    }
  }

  /**
   * 应用阴影样式
   */
  private applyShadows(shadows: ShadowStyle[], props: Record<string, string>): void {
    const shadowParts: string[] = [];

    for (const shadow of shadows) {
      if (!shadow.isEnabled) continue;

      const x = Math.round(shadow.offsetX);
      const y = Math.round(shadow.offsetY);
      const blur = Math.round(shadow.blurRadius);
      const spread = Math.round(shadow.spread);
      const color = hexToCSS(shadow.color);

      const prefix = shadow.isInner ? 'inset ' : '';
      shadowParts.push(`${prefix}${x}px ${y}px ${blur}px ${spread}px ${color}`);
    }

    if (shadowParts.length > 0) {
      props['box-shadow'] = shadowParts.join(', ');
    }
  }

  /**
   * 获取或创建类名
   */
  private getOrCreateClass(layer: Layer): string {
    const existing = this.layerClassMap.get(layer.id);
    if (existing) return existing;

    const name = BEMGenerator.toClassName(layer.name);
    const className = name;

    this.layerClassMap.set(layer.id, className);
    return className;
  }

  /**
   * 检查图层是否有子图层
   */
  private hasLayers(layer: Layer): layer is Layer & { layers: Layer[] } {
    return 'layers' in layer && Array.isArray((layer as any).layers);
  }
}

/**
 * 便捷函数：转换图层树为CSS映射
 */
export function convertPropertyToCSS(artboard: Layer): PropertyToCSSResult {
  const converter = new PropertyToCSS();
  return converter.convert(artboard);
}
```

- [ ] **Step 2: 验证编译通过**

Run: `node --import tsx -e "import { PropertyToCSS, BEMGenerator, sketchColorToCSS } from './src/core/codegen/PropertyToCSS.js'; console.log('PropertyToCSS OK'); console.log(BEMGenerator.toClassName('导航栏')); console.log(sketchColorToCSS({red:0.23,green:0.51,blue:0.96,alpha:1}));"`
Expected: 输出 `PropertyToCSS OK` + 生成的类名 + 颜色值

- [ ] **Step 3: Commit**

```bash
git add src/core/codegen/PropertyToCSS.ts
git commit -m "feat: add Phase 1 PropertyToCSS engine for pixel-perfect CSS conversion"
```

---

### Task 3: 实现 Phase 2 — StructureGenerator 结构推理引擎

**Files:**
- Create: `src/core/codegen/StructureGenerator.ts`

- [ ] **Step 1: 创建StructureGenerator.ts**

```typescript
/**
 * Phase 2: LLM结构推理引擎
 * LLM只负责生成HTML结构和交互逻辑，不写任何CSS
 */

import {
  Layer, LayerType, TextLayer, ShapeLayer, GroupLayer,
  ArtboardLayer, ImageLayer, CSSPropertiesMap, StructureResult
} from '../types.js';

// 延迟加载配置
let configModule: any;
let createLLMClient: any;

async function getConfig() {
  if (!configModule) {
    const projectRoot = process.cwd();
    configModule = await import(`${projectRoot}/src/config.ts`);
    createLLMClient = configModule.createLLMClient;
  }
  return configModule;
}

/**
 * 构建图层树的文本摘要（给LLM看的）
 */
export function buildLayerTreeSummary(
  layers: Layer[],
  cssMap: CSSPropertiesMap,
  layerClassMap: Map<string, string>,
  indent: string = ''
): string {
  const lines: string[] = [];

  for (const layer of layers) {
    if (!layer.visible) continue;

    const className = layerClassMap.get(layer.id) || 'unknown';
    const css = cssMap[className];
    const size = `${Math.round(layer.rect.width)}×${Math.round(layer.rect.height)}`;

    let info = `${indent}- "${layer.name}" (${layer.type}, ${size}px) → .${className}`;

    // 文本内容
    if (layer.type === LayerType.TEXT) {
      const textLayer = layer as TextLayer;
      if (textLayer.content) {
        const preview = textLayer.content.length > 30
          ? textLayer.content.substring(0, 30) + '...'
          : textLayer.content;
        info += ` text:"${preview}"`;
      }
    }

    // 形状信息
    if (layer.type === LayerType.SHAPE) {
      const shapeLayer = layer as ShapeLayer;
      if (shapeLayer.fills?.length > 0) {
        info += ` [${shapeLayer.fills.length} fill(s)]`;
      }
    }

    lines.push(info);

    // 递归子图层
    if ('layers' in layer && Array.isArray((layer as any).layers)) {
      const childLines = buildLayerTreeSummary(
        (layer as any).layers, cssMap, layerClassMap, indent + '  '
      );
      lines.push(childLines);
    }
  }

  return lines.join('\n');
}

/**
 * Phase 2: 结构推理引擎
 */
export class StructureGenerator {
  private llmClient: any = null;

  /**
   * 生成HTML结构
   */
  async generate(
    componentName: string,
    artboard: Layer,
    cssMap: CSSPropertiesMap,
    layerClassMap: Map<string, string>
  ): Promise<StructureResult> {
    // 初始化LLM
    if (!this.llmClient) {
      const config = await getConfig();
      const loadedConfig = await config.loadConfig();
      this.llmClient = createLLMClient(loadedConfig);
    }

    // 构建输入
    const systemPrompt = this.buildSystemPrompt(componentName);
    const userMessage = this.buildUserMessage(
      componentName, artboard, cssMap, layerClassMap
    );

    // 调用LLM
    const config = await getConfig();
    const loadedConfig = await config.loadConfig();

    const response = await this.llmClient.chat.completions.create({
      model: loadedConfig.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      max_tokens: 8000
    });

    const content = response.choices?.[0]?.message?.content || '';

    // 解析响应
    return this.parseResponse(content);
  }

  /**
   * 构建系统prompt — 告诉LLM只需要生成HTML结构
   */
  private buildSystemPrompt(componentName: string): string {
    return `你是一个前端HTML结构专家。你的任务是：根据图层树结构和预生成的CSS类名，生成Vue 3组件的HTML模板和交互脚本。

# 核心规则
1. **只生成HTML结构和script**，绝对不要写任何<style>或CSS
2. **必须使用提供的CSS类名**，不要创建新的类名
3. **使用Vue 3 Composition API**（<script setup>语法）
4. **保持图层树的结构层次**

# 输出格式
严格返回JSON：
\`\`\`json
{
  "template": "HTML模板代码（使用提供的CSS类名）",
  "script": "TypeScript脚本代码（交互逻辑、响应式数据）"
}
\`\`\`

# HTML结构规则
- 使用div作为默认容器
- 文本图层使用span或适当的语义标签
- Group/Artboard使用div
- 保持与图层树一致的嵌套结构
- 使用提供的CSS类名作为class属性`;
  }

  /**
   * 构建用户消息 — 图层树摘要 + CSS类映射
   */
  private buildUserMessage(
    componentName: string,
    artboard: Layer,
    cssMap: CSSPropertiesMap,
    layerClassMap: Map<string, string>
  ): string {
    // 获取子图层
    const children = ('layers' in artboard && Array.isArray(artboard.layers))
      ? artboard.layers
      : [];

    const treeSummary = buildLayerTreeSummary(children, cssMap, layerClassMap);

    // CSS类名概要（不需要全部列出，只列出类名即可）
    const classNames = Object.keys(cssMap).map(c => `.${c}`).join(', ');

    return `# 组件: ${componentName}
尺寸: ${Math.round(artboard.rect.width)}×${Math.round(artboard.rect.height)}px

## 可用的CSS类名（已预生成，直接使用）
${classNames}

## 图层结构（按此结构生成HTML）
${treeSummary}

请生成使用上述CSS类名的HTML模板和Vue脚本。不要写CSS。返回JSON。`;
  }

  /**
   * 解析LLM响应
   */
  private parseResponse(content: string): StructureResult {
    let cleaned = content.trim();

    // 移除思考过程
    const thinkingMatch = cleaned.match(/(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=```json)/s);
    if (thinkingMatch) {
      cleaned = cleaned.substring(thinkingMatch[0].length).trim();
    }

    // 提取JSON
    const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    } else {
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      } else {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleaned = jsonMatch[0];
      }
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        template: this.stripTagWrapper(parsed.template || '', 'template'),
        script: this.stripTagWrapper(parsed.script || '', 'script')
      };
    } catch {
      // JSON解析失败，返回简单结构
      return {
        template: `<div class="component"><!-- JSON解析失败，需要手动检查 --></div>`,
        script: '// 结构生成失败'
      };
    }
  }

  private stripTagWrapper(html: string, tagName: string): string {
    let t = html.trim();
    const re = new RegExp(`^<${tagName}[^>]*>([\\s\\S]*)<\\/${tagName}>$`, 'i');
    let prev: string;
    do {
      prev = t;
      const match = t.match(re);
      if (match) t = match[1].trim();
    } while (t !== prev);
    return t;
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `node --import tsx -e "import { StructureGenerator, buildLayerTreeSummary } from './src/core/codegen/StructureGenerator.js'; console.log('StructureGenerator OK');"`
Expected: 输出 `StructureGenerator OK`

- [ ] **Step 3: Commit**

```bash
git add src/core/codegen/StructureGenerator.ts
git commit -m "feat: add Phase 2 StructureGenerator for LLM-based HTML structure"
```

---

### Task 4: 实现 Phase 3 — LayoutConverter 布局转换引擎

**Files:**
- Create: `src/core/codegen/LayoutConverter.ts`

- [ ] **Step 1: 创建LayoutConverter.ts**

```typescript
/**
 * Phase 3: 布局智能转换引擎
 * 将绝对定位转为flex/grid布局
 */

import {
  Layer, LayerType,
  CSSPropertiesMap, LayoutConvertResult
} from '../types.js';

/**
 * 检测同级子元素的空间关系模式
 */
interface LayoutPattern {
  type: 'row' | 'column' | 'grid' | 'center' | 'space-between' | 'unknown';
  confidence: number; // 0-1
  gap: number;       // 元素间距(px)
  columns?: number;   // 网格列数
}

/**
 * Phase 3: 布局转换引擎
 */
export class LayoutConverter {
  /**
   * 分析并转换CSS映射中的绝对定位为flex/grid
   */
  convert(
    cssMap: CSSPropertiesMap,
    artboard: Layer
  ): LayoutConvertResult {
    const converted = { ...cssMap };
    const convertedClasses: string[] = [];

    // 分析每个有子元素的容器
    const containers = this.findContainers(artboard, cssMap);

    for (const { className, children } of containers) {
      if (children.length < 2) continue;

      const pattern = this.detectPattern(children);

      if (pattern.type !== 'unknown' && pattern.confidence > 0.7) {
        this.applyLayout(converted, className, pattern, children);
        convertedClasses.push(className);
      }
    }

    return { cssMap: converted, convertedClasses };
  }

  /**
   * 查找所有有子元素的容器
   */
  private findContainers(
    layer: Layer,
    cssMap: CSSPropertiesMap
  ): Array<{ className: string; children: Layer[] }> {
    const results: Array<{ className: string; children: Layer[] }> = [];

    const walk = (l: Layer) => {
      if ('layers' in l && Array.isArray((l as any).layers)) {
        const children = (l as any).layers as Layer[];
        if (children.length >= 2) {
          // 找到这个容器的CSS类名
          const className = Object.keys(cssMap).find(c =>
            cssMap[c]['width'] === `${Math.round(l.rect.width)}px` &&
            cssMap[c]['height'] === `${Math.round(l.rect.height)}px` &&
            cssMap[c]['left'] === `${Math.round(l.rect.x)}px` &&
            cssMap[c]['top'] === `${Math.round(l.rect.y)}px`
          );
          if (className) {
            results.push({ className, children });
          }
        }
        children.forEach(walk);
      }
    };

    walk(layer);
    return results;
  }

  /**
   * 检测布局模式
   */
  private detectPattern(children: Layer[]): LayoutPattern {
    if (children.length < 2) {
      return { type: 'unknown', confidence: 0, gap: 0 };
    }

    const rects = children.map(c => c.rect);

    // 检测水平列表：y坐标相近，x递增
    const yValues = rects.map(r => Math.round(r.y));
    const yRange = Math.max(...yValues) - Math.min(...yValues);
    const avgHeight = rects.reduce((s, r) => s + r.height, 0) / rects.length;

    if (yRange < avgHeight * 0.2) {
      // Y坐标相近 → 水平排列
      const sorted = [...rects].sort((a, b) => a.x - b.x);
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width));
      }
      const avgGap = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
      const gapConsistency = gaps.length > 0
        ? 1 - (Math.max(...gaps) - Math.min(...gaps)) / (avgGap || 1)
        : 0;

      // 检查是否是两端对齐
      const parentWidth = Math.max(...rects.map(r => r.x + r.width)) - Math.min(...rects.map(r => r.x));
      const totalChildWidth = rects.reduce((s, r) => s + r.width, 0);
      const isSpaceBetween = Math.abs(parentWidth - totalChildWidth) > avgGap * 2 && gaps.every(g => Math.abs(g - avgGap) < 5);

      if (isSpaceBetween && rects.length === 2) {
        return { type: 'space-between', confidence: Math.min(gapConsistency + 0.3, 1), gap: Math.round(avgGap) };
      }

      return {
        type: 'row',
        confidence: Math.min(gapConsistency + 0.3, 1),
        gap: Math.round(avgGap)
      };
    }

    // 检测垂直堆叠：x坐标相近，y递增
    const xValues = rects.map(r => Math.round(r.x));
    const xRange = Math.max(...xValues) - Math.min(...xValues);
    const avgWidth = rects.reduce((s, r) => s + r.width, 0) / rects.length;

    if (xRange < avgWidth * 0.2) {
      const sorted = [...rects].sort((a, b) => a.y - b.y);
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height));
      }
      const avgGap = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
      const gapConsistency = gaps.length > 0
        ? 1 - (Math.max(...gaps) - Math.min(...gaps)) / (avgGap || 1)
        : 0;

      return {
        type: 'column',
        confidence: Math.min(gapConsistency + 0.3, 1),
        gap: Math.round(avgGap)
      };
    }

    // 检测网格：多行多列，规则排列
    if (children.length >= 4) {
      const columns = this.detectGridColumns(rects);
      if (columns > 1) {
        return { type: 'grid', confidence: 0.7, gap: 0, columns };
      }
    }

    return { type: 'unknown', confidence: 0, gap: 0 };
  }

  /**
   * 检测网格列数
   */
  private detectGridColumns(rects: Array<{ x: number; y: number }>): number {
    const yGroups = new Map<number, number[]>();
    for (const r of rects) {
      const y = Math.round(r.y / 10) * 10; // 10px容差
      if (!yGroups.has(y)) yGroups.set(y, []);
      yGroups.get(y)!.push(Math.round(r.x));
    }

    const colCounts = Array.from(yGroups.values()).map(cols =>
      new Set(cols).size
    );

    if (colCounts.length < 2) return 0;

    // 所有行有相同列数
    const allSame = colCounts.every(c => c === colCounts[0]);
    return allSame ? colCounts[0] : 0;
  }

  /**
   * 将检测到的布局模式应用到CSS
   */
  private applyLayout(
    cssMap: CSSPropertiesMap,
    containerClass: string,
    pattern: LayoutPattern,
    children: Layer[]
  ): void {
    if (!cssMap[containerClass]) return;

    const props = cssMap[containerClass];

    switch (pattern.type) {
      case 'row':
        props['display'] = 'flex';
        props['flex-direction'] = 'row';
        props['align-items'] = 'center';
        if (pattern.gap > 0) props['gap'] = `${pattern.gap}px`;
        // 容器自身不再需要绝对定位的宽高，但保留位置
        delete props['width'];
        delete props['height'];
        break;

      case 'column':
        props['display'] = 'flex';
        props['flex-direction'] = 'column';
        if (pattern.gap > 0) props['gap'] = `${pattern.gap}px`;
        delete props['width'];
        delete props['height'];
        break;

      case 'grid':
        props['display'] = 'grid';
        if (pattern.columns) {
          props['grid-template-columns'] = `repeat(${pattern.columns}, 1fr)`;
        }
        if (pattern.gap > 0) props['gap'] = `${pattern.gap}px`;
        delete props['width'];
        delete props['height'];
        break;

      case 'space-between':
        props['display'] = 'flex';
        props['justify-content'] = 'space-between';
        props['align-items'] = 'center';
        delete props['width'];
        delete props['height'];
        break;

      case 'center':
        props['display'] = 'flex';
        props['justify-content'] = 'center';
        props['align-items'] = 'center';
        delete props['width'];
        delete props['height'];
        break;
    }

    // 子元素移除绝对定位
    // （注意：这里简化处理，实际需要根据layerClassMap找到子元素的CSS类）
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `node --import tsx -e "import { LayoutConverter } from './src/core/codegen/LayoutConverter.js'; console.log('LayoutConverter OK');"`
Expected: 输出 `LayoutConverter OK`

- [ ] **Step 3: Commit**

```bash
git add src/core/codegen/LayoutConverter.ts
git commit -m "feat: add Phase 3 LayoutConverter for absolute-to-flex/grid conversion"
```

---

### Task 5: 实现编排引擎 — LayeredRestorationEngine

**Files:**
- Create: `src/core/codegen/LayeredRestorationEngine.ts`

- [ ] **Step 1: 创建编排引擎**

```typescript
/**
 * 分层还原编排引擎
 * 串联 Phase 1 → Phase 2 → Phase 3
 */

import {
  Layer, CSSPropertiesMap, PropertyToCSSResult,
  StructureResult, LayoutConvertResult, GenerationResult
} from '../types.js';
import { PropertyToCSS } from './PropertyToCSS.js';
import { StructureGenerator } from './StructureGenerator.js';
import { LayoutConverter } from './LayoutConverter.js';

/**
 * 分层还原引擎
 */
export class LayeredRestorationEngine {
  private phase1 = new PropertyToCSS();
  private phase2 = new StructureGenerator();
  private phase3 = new LayoutConverter();

  /**
   * 完整的三阶段还原
   */
  async restore(
    componentName: string,
    artboard: Layer,
    enableLayoutConversion: boolean = true
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    console.log(`\n🎯 分层还原: ${componentName}`);
    console.log(`   尺寸: ${Math.round(artboard.rect.width)}×${Math.round(artboard.rect.height)}px`);

    // ─── Phase 1: 属性直转（算法，零LLM）───
    console.log('   Phase 1: 属性直转...');
    const phase1Result = this.phase1.convert(artboard);
    console.log(`   ✅ Phase 1: ${Object.keys(phase1Result.cssMap).length} 个CSS类生成`);

    // ─── Phase 2: 结构推理（LLM）───
    console.log('   Phase 2: 结构推理...');
    const phase2Result = await this.phase2.generate(
      componentName,
      artboard,
      phase1Result.cssMap,
      phase1Result.layerClassMap
    );
    console.log(`   ✅ Phase 2: HTML ${phase2Result.template.length}字符, Script ${phase2Result.script.length}字符`);

    // ─── Phase 3: 布局转换（可选）───
    let finalCSSMap = phase1Result.cssMap;
    let convertedClasses: string[] = [];

    if (enableLayoutConversion) {
      console.log('   Phase 3: 布局转换...');
      const phase3Result = this.phase3.convert(phase1Result.cssMap, artboard);
      finalCSSMap = phase3Result.cssMap;
      convertedClasses = phase3Result.convertedClasses;
      console.log(`   ✅ Phase 3: ${convertedClasses.length} 个容器转换为flex/grid`);
    }

    // ─── 合并结果 ───
    const cssText = this.cssMapToString(finalCSSMap);
    const sfc = this.buildSFC(componentName, phase2Result.template, phase2Result.script, cssText);

    // 收集使用的设计标记
    const usedColors = this.extractUsedTokens(finalCSSMap, 'color', 'background', 'border');

    const generationTime = Date.now() - startTime;

    console.log(`\n   🎉 还原完成 (${generationTime}ms)`);
    console.log(`   - CSS类数: ${Object.keys(finalCSSMap).length}`);
    console.log(`   - 颜色值: ${usedColors.length}个`);
    console.log(`   - 布局转换: ${convertedClasses.length}个`);

    return {
      componentName,
      template: phase2Result.template,
      script: phase2Result.script,
      style: cssText,
      fileName: this.sanitizeFileName(componentName) + '.vue',
      usedTokens: {
        colors: usedColors,
        spacing: [],
        typography: []
      },
      metadata: {
        generationTime,
        llmCalls: 1,  // 只有Phase 2调用了LLM
        accuracy: undefined
      }
    };
  }

  /**
   * CSS Map转CSS字符串
   */
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

  /**
   * 构建SFC
   */
  private buildSFC(name: string, template: string, script: string, style: string): string {
    return `<template>
${template}
</template>

<script setup lang="ts">
${script}
</script>

<style scoped>
${style}
</style>`;
  }

  /**
   * 从CSS中提取使用的颜色token
   */
  private extractUsedTokens(cssMap: CSSPropertiesMap, ...props: string[]): string[] {
    const colors = new Set<string>();
    for (const cls of Object.values(cssMap)) {
      for (const prop of props) {
        for (const key of Object.keys(cls)) {
          if (key.includes(prop)) {
            const val = cls[key];
            if (val.startsWith('#') || val.startsWith('rgb')) {
              colors.add(val);
            }
          }
        }
      }
    }
    return Array.from(colors);
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[\/\\]/g, '-')
      .replace(/[^\w一-鿿-]/g, '')
      .replace(/^-+|-+$/g, '')
      .replace(/^[0-9]/, '_') || 'Component';
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `node --import tsx -e "import { LayeredRestorationEngine } from './src/core/codegen/LayeredRestorationEngine.js'; console.log('LayeredRestorationEngine OK');"`
Expected: 输出 `LayeredRestorationEngine OK`

- [ ] **Step 3: Commit**

```bash
git add src/core/codegen/LayeredRestorationEngine.ts
git commit -m "feat: add LayeredRestorationEngine to orchestrate 3-phase pipeline"
```

---

### Task 6: 端到端集成测试

**Files:**
- Create: `test-layered-restoration.ts`

- [ ] **Step 1: 创建端到端测试**

```typescript
/**
 * 分层还原引擎端到端测试
 */

import { LayeredRestorationEngine } from './src/core/codegen/LayeredRestorationEngine.js';
import { SketchFileReader } from './src/core/parser/SketchFileReader.js';
import { LayerExtractor } from './src/core/parser/LayerExtractor.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🚀 分层还原引擎 - 端到端测试');
  console.log('='.repeat(60));

  // 1. 读取Sketch文件
  console.log('\n📖 步骤1: 读取Sketch文件');
  const reader = new SketchFileReader();
  const fileResult = await reader.read('./test-design.sketch');

  if (!fileResult.success) {
    throw new Error('读取失败: ' + fileResult.errors.map(e => e.message).join(', '));
  }
  console.log(`✅ 文件大小: ${(fileResult.fileSize / 1024).toFixed(2)}KB`);

  // 2. 提取图层
  console.log('\n🎯 步骤2: 提取图层');
  const layerExtractor = new LayerExtractor();
  const layerResult = await layerExtractor.extract(fileResult.document);
  console.log(`✅ 图层: ${layerResult.statistics.totalLayers}个, Artboard: ${layerResult.artboards.length}个`);

  if (layerResult.artboards.length === 0) {
    console.log('⚠️ 无Artboard，使用所有图层作为输入');
    // 如果没有artboard，尝试用allLayers
    if (layerResult.allLayers.length === 0) {
      throw new Error('文件中没有可用的图层');
    }
  }

  // 3. 执行分层还原
  console.log('\n🎨 步骤3: 执行分层还原');
  const engine = new LayeredRestorationEngine();

  const outputDir = join(__dirname, 'output', 'layered-test');
  await mkdir(outputDir, { recursive: true });

  // 处理每个artboard
  const artboards = layerResult.artboards.length > 0
    ? layerResult.artboards
    : layerResult.allLayers.slice(0, 3);

  for (const artboard of artboards) {
    try {
      console.log(`\n--- 处理: ${artboard.name} ---`);
      const result = await engine.restore(artboard.name, artboard, true);

      // 保存结果
      const outputPath = join(outputDir, result.fileName);
      await writeFile(outputPath, result.sfcTemplate, 'utf-8');
      console.log(`💾 保存: ${outputPath}`);

      // 输出统计
      console.log(`   模板: ${result.template.length}字符`);
      console.log(`   样式: ${result.style.length}字符`);
      console.log(`   耗时: ${result.metadata.generationTime}ms`);
    } catch (error: any) {
      console.error(`❌ ${artboard.name} 失败: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✨ 测试完成！输出: ${outputDir}`);
  console.log(`\n💡 运行 npm run preview 查看效果`);
}

main().catch(console.error);
```

- [ ] **Step 2: 运行端到端测试**

Run: `node --import tsx test-layered-restoration.ts`
Expected: 三阶段依次执行，Phase 1快速完成，Phase 2调用LLM，Phase 3转换布局。输出文件到 `output/layered-test/`。

- [ ] **Step 3: 检查生成结果**

Run: `ls -la output/layered-test/ && head -50 output/layered-test/*.vue`
Expected: 生成的.vue文件包含精确CSS（绝对定位+真实颜色值）和合理的HTML结构。

- [ ] **Step 4: Commit**

```bash
git add test-layered-restoration.ts
git commit -m "test: add end-to-end test for layered restoration engine"
```

---

### Task 7: 更新 package.json 脚本

**Files:**
- Modify: `package.json:17-19`

- [ ] **Step 1: 添加layered脚本**

在 `package.json` 的 `scripts` 中添加：

```json
"layered": "node --import tsx test-layered-restoration.ts"
```

放在 `"preview"` 行之后。

- [ ] **Step 2: 验证**

Run: `npm run layered`
Expected: 与Task 6相同的结果

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add npm run layered script"
```
