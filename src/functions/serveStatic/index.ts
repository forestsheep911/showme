import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as path from 'path';
import * as fs from 'fs/promises';

// MIME 类型映射
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

export async function serveStatic(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Processing request for ${request.params.path}`);

  // 规范化并清理路径
  const normalizedPath = path.normalize(request.params.path || '');
  if (normalizedPath.includes('..')) {
    return {
      status: 403,
      body: 'Forbidden'
    };
  }

  // 确定文件路径
  let filePath = path.join(__dirname, 'static', normalizedPath);
  
  // 如果路径指向目录，默认使用 index.html
  const stats = await fs.stat(filePath).catch(() => null);
  if (stats?.isDirectory() || !path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }

  try {
    // 检查文件是否存在
    await fs.access(filePath);

    // 读取文件内容
    const content = await fs.readFile(filePath);

    // 确定内容类型
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 设置缓存控制
    const cacheControl = contentType.startsWith('image/') || 
                        contentType.startsWith('font/') || 
                        contentType.startsWith('video/') || 
                        contentType.startsWith('audio/') 
      ? 'public, max-age=31536000' // 1年缓存
      : 'public, max-age=0';

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block'
      },
      body: content,
    };
  } catch (error) {
    // 如果文件未找到，返回 index.html 以支持 SPA 路由
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        const indexPath = path.join(__dirname, 'static/index.html');
        const content = await fs.readFile(indexPath);
        return {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'X-XSS-Protection': '1; mode=block'
          },
          body: content,
        };
      } catch (indexError) {
        context.error(`Index file not found: ${indexError}`);
        return {
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store'
          },
          body: 'Not Found'
        };
      }
    }
    
    context.error(`Error serving file: ${error}`);
    return {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store'
      },
      body: 'Internal Server Error'
    };
  }
}

app.http('serveStatic', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: serveStatic,
  route: '{*path}'
}); 