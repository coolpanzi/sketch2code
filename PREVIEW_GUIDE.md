# 🎨 组件预览指南

## 快速开始

### 1. 生成组件
```bash
npm run generate
```
这将从Sketch文件生成Vue组件到 `output/final-test/` 目录。

### 2. 启动预览服务器
```bash
npm run preview
```

### 3. 打开浏览器
访问 `http://localhost:8080` 查看生成的组件。

## 预览功能

### 实时预览
- ✅ 查看生成的Vue组件
- ✅ 交互式UI演示
- ✅ Canvas图表渲染
- ✅ 响应式设计测试

### 组件特性
- Vue 3 Composition API
- TypeScript类型支持
- 现代CSS样式
- Canvas图表集成
- 交互效果演示

## 手动预览

如果你想直接在浏览器中打开预览文件：

1. 打开 `preview-performance.html`
2. 组件会自动加载并显示

## 技术细节

预览页面使用：
- Vue 3 (CDN版本)
- 纯HTML单文件
- 无需构建工具
- 支持所有现代浏览器

## 故障排除

### 组件不显示
1. 确保先生成了组件：`npm run generate`
2. 检查控制台是否有错误
3. 确认Vue CDN可访问

### 样式问题
1. 检查浏览器兼容性
2. 清除浏览器缓存
3. 尝试刷新页面

### Canvas图表不显示
1. 确保浏览器支持Canvas
2. 检查组件数据是否正确
3. 查看浏览器控制台错误

## 下一步

- 📱 测试移动端响应式
- 🎨 调整设计系统颜色
- ⚡ 优化性能
- 🔧 自定义组件行为

---

**提示**: 预览服务器默认运行在端口8080，如果端口被占用，可以修改 `serve-preview.ts` 中的PORT变量。