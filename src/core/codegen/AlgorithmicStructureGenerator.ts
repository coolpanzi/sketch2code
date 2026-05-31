/**
 * Phase 2 算法版: 纯算法从图层树生成 HTML 结构
 * 零LLM调用，毫秒级完成
 */

import {
  Layer, LayerType, TextLayer, ShapeLayer, GroupLayer,
  ArtboardLayer, ImageLayer, SymbolLayer, ComponentLayer,
  CSSPropertiesMap, StructureResult
} from '../types.js';

/**
 * 统计信息
 */
interface GenStats {
  textLayers: number;
  shapeLayers: number;
  groupLayers: number;
  symbolLayers: number;
  imageLayers: number;
  detectedLists: number;
}

/**
 * 纯算法 HTML 结构生成器
 */
export class AlgorithmicStructureGenerator {
  private cssMap: CSSPropertiesMap = {};
  private layerClassMap: Map<string, string> = new Map();
  private stats: GenStats = {
    textLayers: 0, shapeLayers: 0, groupLayers: 0,
    symbolLayers: 0, imageLayers: 0, detectedLists: 0
  };

  /**
   * 从图层树生成 HTML + Vue Script
   */
  generate(
    artboard: Layer,
    cssMap: CSSPropertiesMap,
    layerClassMap: Map<string, string>
  ): StructureResult {
    this.cssMap = cssMap;
    this.layerClassMap = layerClassMap;
    this.stats = { textLayers: 0, shapeLayers: 0, groupLayers: 0, symbolLayers: 0, imageLayers: 0, detectedLists: 0 };

    const layers = this.getLayers(artboard);

    // 检测重复模式（用于 v-for）
    const repeatedPatterns = this.detectRepeatedPatterns(layers);

    // 生成 HTML
    const template = this.generateTemplate(layers, repeatedPatterns);

    // 生成 Vue Script
    const script = this.generateScript(layers, repeatedPatterns);

    return { template, script };
  }

  /**
   * 获取图层的子图层
   */
  private getLayers(layer: Layer): Layer[] {
    if ('layers' in layer && Array.isArray((layer as any).layers)) {
      return (layer as any).layers;
    }
    return [];
  }

  /**
   * 获取图层的CSS类名
   */
  private getClassName(layer: Layer): string {
    return this.layerClassMap.get(layer.id) || 'unknown';
  }

  /**
   * 判断图层是否有可见样式（不是完全透明的）
   */
  private hasVisibleStyle(layer: Layer): boolean {
    const cls = this.getClassName(layer);
    const props = this.cssMap[cls];
    if (!props) return true;
    // 如果有背景色、边框、阴影，则有可见样式
    return !!(props['background-color'] || props['background'] ||
              props['border'] || props['box-shadow'] ||
              props['color'] || layer.type === LayerType.TEXT);
  }

  /**
   * 检测重复模式：相同类型的图层序列 → v-for
   * 例如：多个相似的卡片、列表项、按钮
   */
  private detectRepeatedPatterns(layers: Layer[]): Map<string, { layers: Layer[]; varName: string }> {
    const patterns = new Map<string, { layers: Layer[]; varName: string }>();

    // 按类型+大致尺寸分组
    const groups = new Map<string, Layer[]>();
    for (const layer of layers) {
      if (!layer.visible) continue;

      // 创建分组key：类型 + 宽度范围 + 高度范围
      const wBucket = Math.round(layer.rect.width / 20) * 20;
      const hBucket = Math.round(layer.rect.height / 20) * 20;
      const key = `${layer.type}-${wBucket}-${hBucket}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(layer);
    }

    // 3个以上相似图层 → 列表模式
    for (const [key, groupLayers] of groups) {
      if (groupLayers.length >= 3) {
        const varName = this.inferListVarName(groupLayers);
        patterns.set(key, { layers: groupLayers, varName });
        this.stats.detectedLists++;
      }
    }

    return patterns;
  }

  /**
   * 推断列表变量名
   */
  private inferListVarName(layers: Layer[]): string {
    // 从第一个文本图层提取名称
    for (const l of layers) {
      if (l.type === LayerType.TEXT) {
        const text = (l as TextLayer).content?.trim();
        if (text && text.length > 0 && text.length < 10) {
          return this.toVarName(text);
        }
      }
      // 检查子图层
      const children = this.getLayers(l);
      for (const child of children) {
        if (child.type === LayerType.TEXT) {
          const text = (child as TextLayer).content?.trim();
          if (text && text.length > 0 && text.length < 10) {
            return this.toVarName(text) + 'List';
          }
        }
      }
    }
    return 'items';
  }

  /**
   * 文本转变量名
   */
  private toVarName(text: string): string {
    // 简单处理：去除标点，用拼音映射常见词
    const map: Record<string, string> = {
      '渠道': 'channel', '机构': 'org', '产品': 'product',
      '数据': 'data', '指标': 'metric', '排名': 'rank',
      '同比': 'yoy', '环比': 'mom', '目标': 'target',
      '实际': 'actual', '完成': 'done', '总额': 'total',
      '菜单': 'menu', '通知': 'notification', '用户': 'user',
    };
    for (const [cn, en] of Object.entries(map)) {
      if (text.includes(cn)) return en;
    }
    // Fallback: 使用 items
    return 'item';
  }

  /**
   * 生成HTML模板
   */
  private generateTemplate(
    layers: Layer[],
    repeatedPatterns: Map<string, { layers: Layer[]; varName: string }>
  ): string {
    const html: string[] = [];
    const processedIds = new Set<string>();

    // 标记重复模式中的图层
    for (const [, pattern] of repeatedPatterns) {
      // 跳过第一个，它作为v-for模板
      for (let i = 1; i < pattern.layers.length; i++) {
        processedIds.add(pattern.layers[i].id);
      }
    }

    for (const layer of layers) {
      if (!layer.visible) continue;
      if (processedIds.has(layer.id)) continue;

      // 检查是否是重复模式的第一个
      let isRepeated = false;
      let varName = '';
      for (const [, pattern] of repeatedPatterns) {
        if (pattern.layers[0]?.id === layer.id) {
          isRepeated = true;
          varName = pattern.varName;
          break;
        }
      }

      if (isRepeated) {
        html.push(this.generateRepeatedElement(layer, varName));
      } else {
        html.push(this.generateElement(layer));
      }
    }

    return html.join('\n');
  }

  /**
   * 生成单个元素的HTML
   */
  private generateElement(layer: Layer, indent: string = '  '): string {
    const cls = this.getClassName(layer);
    const tag = this.inferTag(layer);

    switch (layer.type) {
      case LayerType.TEXT:
        this.stats.textLayers++;
        const text = (layer as TextLayer).content || '';
        return `${indent}<span class="${cls}">${this.escapeHtml(text)}</span>`;

      case LayerType.SHAPE:
        this.stats.shapeLayers++;
        // 如果没有可见样式（纯容器），不生成空div
        if (!this.hasVisibleStyle(layer)) return '';
        return `${indent}<div class="${cls}"></div>`;

      case LayerType.IMAGE:
        this.stats.imageLayers++;
        return `${indent}<div class="${cls}"></div>`;

      case LayerType.GROUP:
      case LayerType.ARTBOARD:
      case LayerType.COMPONENT:
        this.stats.groupLayers++;
        const children = this.getLayers(layer).filter(l => l.visible);
        if (children.length === 0) {
          return `${indent}<${tag} class="${cls}"></${tag}>`;
        }
        const childHtml = children
          .map(c => this.generateElement(c, indent + '  '))
          .filter(Boolean)
          .join('\n');
        return `${indent}<${tag} class="${cls}">\n${childHtml}\n${indent}</${tag}>`;

      case LayerType.SYMBOL:
        this.stats.symbolLayers++;
        return `${indent}<div class="${cls}"></div>`;

      default:
        return `${indent}<div class="${cls}"></div>`;
    }
  }

  /**
   * 生成重复列表元素的HTML（v-for）
   */
  private generateRepeatedElement(template: Layer, varName: string): string {
    const cls = this.getClassName(template);
    const tag = this.inferTag(template);

    // 提取模板内所有文本内容
    const texts = this.extractTexts(template);

    if (texts.length > 0 && this.getLayers(template).length > 0) {
      // 有子元素的列表项：生成带插值的模板
      const innerHtml = this.generateElement(template, '    ')
        .replace(/<span class="([^"]+)">([^<]*)<\/span>/g, (match, c, text) => {
          // 替换文本为插值
          if (text.trim()) {
            const field = this.textField(text.trim());
            return `<span class="${c}">{{ item.${field} }}</span>`;
          }
          return match;
        });
      return `  <${tag} v-for="(item, index) in ${varName}" :key="index" class="${cls}">\n${innerHtml}\n  </${tag}>`;
    }

    return `  <${tag} v-for="(item, index) in ${varName}" :key="index" class="${cls}">{{ item }}</${tag}>`;
  }

  /**
   * 推断语义化HTML标签
   */
  private inferTag(layer: Layer): string {
    const name = (layer.name || '').toLowerCase();

    // 通过图层名推断语义
    if (/nav|导航|菜单|menu|header|头部/.test(name)) return 'nav';
    if (/sidebar|侧栏|侧边/.test(name)) return 'aside';
    if (/footer|底部|页脚/.test(name)) return 'footer';
    if (/main|主体|内容/.test(name)) return 'main';
    if (/header|头部|顶栏/.test(name)) return 'header';
    if (/section|区域|板块/.test(name)) return 'section';
    if (/btn|按钮/.test(name)) return 'button';
    if (/input|输入|search|搜索/.test(name)) return 'input';
    if (/img|image|图片|头像|avatar/.test(name)) return 'img';

    // 通过位置推断
    if (layer.type === LayerType.GROUP || layer.type === LayerType.ARTBOARD) {
      // 顶部区域
      if (layer.rect.y < 80 && layer.rect.width > 500) return 'header';
      // 左侧区域
      if (layer.rect.x < 50 && layer.rect.height > 300) return 'aside';
    }

    return 'div';
  }

  /**
   * 提取图层中所有文本
   */
  private extractTexts(layer: Layer): string[] {
    const texts: string[] = [];
    const walk = (l: Layer) => {
      if (l.type === LayerType.TEXT && (l as TextLayer).content) {
        texts.push((l as TextLayer).content!);
      }
      const children = this.getLayers(l);
      for (const c of children) walk(c);
    };
    walk(layer);
    return texts;
  }

  /**
   * 文本内容映射到字段名
   */
  private textField(text: string): string {
    const map: Record<string, string> = {
      '名称': 'name', '标题': 'title', '数值': 'value',
      '金额': 'amount', '比率': 'rate', '百分比': 'percent',
      '日期': 'date', '时间': 'time', '状态': 'status',
      '类型': 'type', '编号': 'id', '描述': 'desc',
    };
    for (const [cn, en] of Object.entries(map)) {
      if (text.includes(cn)) return en;
    }
    return 'name';
  }

  /**
   * 生成Vue Script
   */
  private generateScript(
    layers: Layer[],
    repeatedPatterns: Map<string, { layers: Layer[]; varName: string }>
  ): string {
    const lines: string[] = [];
    lines.push("import { ref, computed } from 'vue'");
    lines.push('');

    // 为每个重复列表生成数据
    for (const [, pattern] of repeatedPatterns) {
      const varName = pattern.varName;
      const items = pattern.layers.map((l, i) => {
        const texts = this.extractTexts(l);
        if (texts.length > 0) {
          const fields: Record<string, string> = { id: String(i + 1) };
          texts.forEach((t, ti) => {
            fields[ti === 0 ? 'name' : `field${ti}`] = t;
          });
          return `    ${JSON.stringify(fields)}`;
        }
        return `    { id: ${i + 1} }`;
      });
      lines.push(`const ${varName} = ref([`);
      lines.push(items.join(',\n'));
      lines.push('])');
      lines.push('');
    }

    // 如果没有重复模式，生成基本脚本
    if (repeatedPatterns.size === 0) {
      lines.push('// 组件逻辑');
      lines.push("const loading = ref(false)");
    }

    return lines.join('\n');
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
