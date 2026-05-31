/**
 * 深度调试：查看Sketch文件的真实结构
 */

async function deepDebug() {
  console.log('🔍 深度调试Sketch文件结构');

  try {
    // 直接读取文件看看结构
    const fs = await import('node:fs/promises');
    const { default: JSZip } = await import('jszip');

    const buffer = await fs.readFile('/Users/coolpanzi/Downloads/0625企康看版.sketch');
    const zip = await JSZip.loadAsync(buffer);

    // 读取document.json
    const documentRaw = await zip.file('document.json')?.async('string');
    if (!documentRaw) {
      console.log('❌ 没有找到document.json');
      return;
    }

    const document = JSON.parse(documentRaw);

    console.log('\n📄 document.json 结构分析:');
    console.log(`- 顶层属性: ${Object.keys(document).join(', ')}`);

    if (document.pages) {
      console.log(`\n- pages属性:`);
      console.log(`  - 类型: ${typeof document.pages}`);
      console.log(`  - 是数组: ${Array.isArray(document.pages)}`);
      console.log(`  - 长度: ${document.pages.length}`);

      if (Array.isArray(document.pages) && document.pages.length > 0) {
        console.log(`\n- 第一个page对象:`);
        const firstPage = document.pages[0];
        console.log(`  - 属性: ${Object.keys(firstPage).join(', ')}`);
        console.log(`  - _class: ${firstPage._class}`);
        console.log(`  - do_objectID: ${firstPage.do_objectID}`);
        console.log(`  - name: ${firstPage.name}`);

        if (firstPage.layers) {
          console.log(`  - 有layers: true`);
          console.log(`  - layers长度: ${firstPage.layers.length}`);
        } else {
          console.log(`  - 有layers: false`);
        }
      }
    }

    // 检查是否有单独的页面文件
    console.log(`\n📁 检查单独的页面文件...`);
    const pageFiles = Object.keys(zip.files).filter(f =>
      f.startsWith('pages/') && f.endsWith('.json') && !f.endsWith('pages.json')
    );

    console.log(`- 找到${pageFiles.length}个页面文件`);
    if (pageFiles.length > 0) {
      console.log(`- 示例文件: ${pageFiles[0]}`);

      // 读取第一个页面文件
      const firstPageFile = await zip.file(pageFiles[0])?.async('string');
      if (firstPageFile) {
        const pageData = JSON.parse(firstPageFile);
        console.log(`\n📄 第一个页面文件内容:`);
        console.log(`- 属性: ${Object.keys(pageData).join(', ')}`);
        console.log(`- _class: ${pageData._class}`);
        console.log(`- name: ${pageData.name}`);
        console.log(`- do_objectID: ${pageData.do_objectID}`);

        if (pageData.layers) {
          console.log(`- 有layers: true`);
          console.log(`- layers长度: ${pageData.layers.length}`);

          // 显示第一个图层
          if (pageData.layers.length > 0) {
            const firstLayer = pageData.layers[0];
            console.log(`\n📋 第一个图层:`);
            console.log(`- 属性: ${Object.keys(firstLayer).join(', ')}`);
            console.log(`- _class: ${firstLayer._class}`);
            console.log(`- name: ${firstLayer.name}`);
          }
        } else {
          console.log(`- 有layers: false`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ 深度调试失败: ${error}`);
  }
}

deepDebug();