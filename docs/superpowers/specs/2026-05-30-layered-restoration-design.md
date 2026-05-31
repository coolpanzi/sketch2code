# 分层还原引擎设计文档

**日期**: 2026-05-30
**状态**: 已批准

## 问题

当前系统将视觉还原的全部任务交给LLM，但LLM只能看到文字描述而非实际画面，导致生成的代码与设计稿差距大。

## 方案：分层还原引擎

将还原任务分为三层，每层由最合适的引擎负责：

### Phase 1: 属性直转引擎（算法，无LLM）

将Sketch图层属性**直接映射**为CSS属性，精度100%。

**映射规则**：

| Sketch属性 | CSS属性 |
|-----------|---------|
| `rect.x/y/width/height` | `position:absolute; left/top/width/height` |
| `fills[0].color` (r,g,b,a 0-1) | `background-color: rgba(R,G,B,A)` (R,G,B 0-255) |
| `borders[0]` (color, thickness) | `border: Npx solid rgba(R,G,B,A)` |
| `borders[0].position` | 映射到 border-top/right/bottom/left |
| `shadows[0]` (x,y,blur,spread,color) | `box-shadow: Xpx Ypx Blurpx Spreadpx rgba(R,G,B,A)` |
| `opacity` (0-1) | `opacity` |
| `cornerRadius` / `fixedRadius` | `border-radius` |
| `textContent` | innerHTML / textContent |
| `textStyles.fontFamily` | `font-family` |
| `textStyles.fontSize` | `font-size` |
| `textStyles.fontWeight` | `font-weight` |
| `textStyles.lineHeight` | `line-height` |
| `textStyles.letterSpacing` | `letter-spacing` |
| `textStyles.color` 或 fills[0].color | `color` |
| `textStyles.textAlign` | `text-align` |
| `rotation` | `transform: rotate(Ndeg)` |
| `blendMode` | `mix-blend-mode` |
| `clippingMask` | `overflow: hidden` |
| `style.borders` (多条) | 每条border生成独立CSS属性 |
| `style.fills` (渐变) | `background: linear-gradient(...)` |

**输入**：Layer[]
**输出**：Map<string, CSSProperties>（className → CSS属性字典）

**命名规则**：BEM风格
- Group: `.block-name`
- 子图层: `.block-name__element-name`
- 修饰: `.block-name--modifier`

**处理流程**：
1. 深度优先遍历图层树
2. 对每个图层生成CSS类名和属性
3. 处理渐变填充（multiple stops → linear-gradient）
4. 处理多层边框
5. 合并到统一的CSS Map中

### Phase 2: 结构推理引擎（LLM）

LLM**只负责**生成HTML结构，不写任何CSS。

**输入**：图层树摘要 + CSS类名映射

**输入格式**：
```
组件: "业绩达成页面" (375x812px)

图层结构 + CSS类:
- "导航栏" (Group, 375x88) → .nav-bar
  - "导航背景" (Shape, 375x88) → .nav-bar__bg [CSS已生成]
  - "标题" (Text, "业绩达成", 20px/600) → .nav-bar__title [CSS已生成]
- "卡片容器" (Group, 343x500) → .card-container
  - "卡片A" (Group, 343x140) → .card--a
    - "背景" (Shape) → .card__bg [CSS已生成]
    - "渠道名" (Text, "渠道A") → .card__name [CSS已生成]
    - "趋势徽章" (Shape) → .card__badge [CSS已生成]
    ...

要求:
1. 使用上面标注的CSS类名
2. 不要写任何<style>标签
3. 生成语义化的HTML结构
4. 添加必要的Vue响应式逻辑（v-for、v-if等）
5. 添加交互逻辑（点击、筛选等）
```

**输出**：JSON `{ template: "HTML", script: "TS" }`

**优势**：LLM不需要猜测任何视觉属性，只需理解结构语义。

### Phase 3: 布局智能转换（算法 + 规则）

将绝对定位转为flex/grid布局，提高响应式。

**检测规则**：

| 模式 | 检测条件 | 转换结果 |
|------|---------|---------|
| 水平列表 | N个子元素y坐标相同，等宽等高 | `display:flex; flex-direction:row; gap:Xpx` |
| 垂直堆叠 | N个子元素x坐标相同，等宽 | `display:flex; flex-direction:column; gap:Xpx` |
| 网格 | M×N子元素规则排列 | `display:grid; grid-template-columns:repeat(N, 1fr)` |
| 居中 | 子元素x = (父width - 子width)/2 | `justify-content:center` |
| 两端对齐 | 两子元素分别在左右两端 | `display:flex; justify-content:space-between` |

**转换策略**：
1. 检测同级子元素的空间关系
2. 识别重复模式（列表、网格）
3. 将父容器转为flex/grid
4. 移除子元素的绝对定位
5. 用gap替代手动间距计算

### 文件结构

```
src/core/codegen/
├── PropertyToCSS.ts          # Phase 1: Sketch属性→CSS转换器
├── StructureGenerator.ts      # Phase 2: LLM结构推理（HTML骨架）
├── LayoutConverter.ts        # Phase 3: 绝对定位→flex/grid转换
└── LayeredRestorationEngine.ts  # 编排三阶段的引擎入口
```

### 输出格式

生成标准Vue 3 SFC：

```vue
<template>
  <div class="page-业绩达成">
    <!-- Phase 2 生成的HTML结构，使用 Phase 1 的CSS类名 -->
    <nav class="nav-bar">
      <div class="nav-bar__bg"></div>
      <h2 class="nav-bar__title">业绩达成</h2>
    </nav>
    <div class="card-container">
      <div v-for="card in cards" :key="card.id" class="card" :class="'card--' + card.id">
        <div class="card__bg"></div>
        <span class="card__name">{{ card.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Phase 2 LLM生成的交互逻辑
</script>

<style scoped>
/* Phase 1 算法生成的精确CSS */
/* Phase 3 转换后的响应式布局 */
</style>
```

### 关键约束

1. **Phase 1不调用LLM**：纯算法，速度极快，精度100%
2. **Phase 2 LLM不写CSS**：只需要输出HTML模板和script
3. **Phase 3是可选的**：如果用户需要像素级精确，可以跳过flex转换
4. **颜色转换精度**：Sketch使用0-1范围，CSS使用0-255范围，必须精确转换
5. **保持向后兼容**：旧的生成器仍然可用，新增LayeredRestorationEngine作为默认

### 技术决策

- **CSS命名**：BEM风格（block__element--modifier），清晰且可预测
- **Vue版本**：Vue 3 Composition API + `<script setup>`
- **优先级**：精度 > 响应式 > 代码简洁
