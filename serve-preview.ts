/**
 * 预览服务器 - 支持新旧两种预览模式
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8080;
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.vue': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = req.url || '/';

  // 路由规则
  let filePath: string;

  if (url === '/' || url === '/layered') {
    // 分层还原预览页面
    filePath = join(__dirname, 'preview-layered.html');
  } else if (url === '/old') {
    // 旧版预览页面
    filePath = join(__dirname, 'preview-performance.html');
  } else if (url.startsWith('/output/')) {
    // 直接访问 output 目录下的文件
    filePath = join(__dirname, url);
  } else {
    filePath = join(__dirname, url.startsWith('.') ? url : '.' + url);
  }

  const fileExt = extname(filePath);
  const contentType = mimeTypes[fileExt] || 'application/octet-stream';

  try {
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('文件未找到: ' + url);
      return;
    }
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('文件未找到');
    } else {
      res.writeHead(500);
      res.end('服务器错误: ' + error.code);
    }
  }
});

server.listen(PORT, () => {
  console.log(`🚀 预览服务器启动成功！`);
  console.log(``);
  console.log(`📱 分层还原预览: http://localhost:${PORT}/`);
  console.log(`📱 旧版预览:      http://localhost:${PORT}/old`);
  console.log(``);
  console.log(`⏹️  按 Ctrl+C 停止服务器`);
});
