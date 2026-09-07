import { readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import https from 'node:https';

function getGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf-8',
    });
    const match = out.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

const token = getGithubToken();
if (!token) {
  console.error('未找到 GitHub Token，请设置 GITHUB_TOKEN 环境变量或配置 git credential');
  process.exit(1);
}

const owner = 'jiang585';
const repo = 'mdKit';
const tag = 'v1.0.0';
const releaseDir = join(process.cwd(), 'release', '1.0.0');

const releaseName = 'MD工具箱 v1.0.0 (Tauri 2 重构版)';
const releaseBody = `## 🎉 MD工具箱 v1.0.0 正式发布

MD工具箱是一款轻量、极致性能的现代 Markdown 桌面工具箱。基于 **Tauri 2 + Rust + React + CodeMirror 6 + unified** 打造，安装包仅 **4.5 MB**，冷启动瞬时响应，内存占用大幅优化。

---

### 📦 产物下载说明

本次发布提供以下三种分发形态，请根据需要下载：

| 文件名 | 类型 | 体积 | 说明 |
| :--- | :--- | :--- | :--- |
| **\`MD-Toolbox-Setup-1.0.0.exe\`** | 安装包 | ~4.5 MB | Windows NSIS 官方安装包，支持开始菜单、桌面快捷方式与干净卸载 |
| **\`MD-Toolbox-Portable-1.0.0.zip\`** | 绿色便携包 | ~5.0 MB | 解压即用，自带全部运行所需环境及 DLL，适合 U 盘随身携带 |
| **\`MD-Toolbox-1.0.0.exe\`** | 单 exe 独立版 | ~7.9 MB | 单文件可执行版，无需安装直接双击运行 |

---

### ✨ 核心功能亮点

1. **顶级编辑内核**：基于 CodeMirror 6，支持精准语法高亮、多标签会话、断电崩溃恢复草稿；
2. **专业排版渲染**：GFM 扩展语法、KaTeX 数学公式、Mermaid 图表、highlight.js 60+ 代码着色；
3. **双向滚动同步**：编辑区与预览区双向精准像素/行锚点同步，支持分屏、纯编辑与纯预览视图；
4. **AI 智能助手**：内置文档修改 Diff 对比与行内改写辅助，修复了末尾追加与行偏移越界应用异常；
5. **离线高保真导出**：支持独立 HTML 导出及离线高分辨率 PDF 打印导出（WebView2 PrintToPdf 原生集成）；
6. **精致设计质感**：提供深色/浅色多套精心调优的主题，支持自定义导入。
`;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, filePath) {
  return new Promise((resolve, reject) => {
    const fileName = basename(filePath);
    const stat = statSync(filePath);
    const uploadUrl = new URL(uploadUrlTemplate.replace(/\{.*?\}$/, ''));
    uploadUrl.searchParams.set('name', fileName);

    console.log(`正在上传: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);

    const fileContent = readFileSync(filePath);

    const req = https.request({
      protocol: uploadUrl.protocol,
      hostname: uploadUrl.hostname,
      port: uploadUrl.port || 443,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': fileName.endsWith('.zip') ? 'application/zip' : 'application/vnd.microsoft.portable-executable',
        'Content-Length': stat.size,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ ${fileName} 上传成功!`);
          resolve(JSON.parse(body));
        } else {
          console.error(`✗ ${fileName} 上传失败 (HTTP ${res.statusCode}):`, body);
          reject(new Error(`Failed to upload ${fileName}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileContent);
    req.end();
  });
}

async function main() {
  console.log(`正在检查已存在的 Release (${tag})...`);
  const existing = await request({
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases/tags/${tag}`,
    method: 'GET',
    headers: {
      'User-Agent': 'NodeJS-Uploader',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  let release;
  if (existing.status === 200 && existing.body?.id) {
    console.log(`已存在 Release id=${existing.body.id}，更新说明...`);
    release = existing.body;
    await request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/${release.id}`,
      method: 'PATCH',
      headers: {
        'User-Agent': 'NodeJS-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, JSON.stringify({
      name: releaseName,
      body: releaseBody,
    }));
  } else {
    console.log(`创建新 Release: ${tag}...`);
    const createRes = await request({
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases`,
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false,
    }));

    if (createRes.status !== 201) {
      console.error('创建 Release 失败:', createRes);
      process.exit(1);
    }
    release = createRes.body;
    console.log(`✓ Release 创建成功, id=${release.id}`);
  }

  const assetsRes = await request({
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases/${release.id}/assets`,
    method: 'GET',
    headers: {
      'User-Agent': 'NodeJS-Uploader',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  const existingAssets = (assetsRes.body || []).reduce((acc, a) => {
    acc[a.name] = a.id;
    return acc;
  }, {});

  const filesToUpload = [
    join(releaseDir, 'MD-Toolbox-Setup-1.0.0.exe'),
    join(releaseDir, 'MD-Toolbox-Portable-1.0.0.zip'),
    join(releaseDir, 'MD-Toolbox-1.0.0.exe'),
  ];

  for (const filePath of filesToUpload) {
    const fileName = basename(filePath);
    if (existingAssets[fileName]) {
      console.log(`资产 ${fileName} 已存在 (id=${existingAssets[fileName]})，重新上传...`);
      await request({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases/assets/${existingAssets[fileName]}`,
        method: 'DELETE',
        headers: {
          'User-Agent': 'NodeJS-Uploader',
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
    }
    await uploadAsset(release.upload_url, filePath);
  }

  console.log(`\n🎉 全部 Release 资产发布完成！查看链接：${release.html_url}`);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
