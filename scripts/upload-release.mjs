import { existsSync, readFileSync, statSync } from 'node:fs';
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
// 版本号取自 package.json；发布说明取自 docs/RELEASE-v<version>.md（首行 `# ` 标题作为 Release 名称）
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
const version = pkg.version;
const tag = `v${version}`;
const releaseDir = join(process.cwd(), 'release', version);

const notesPath = join(process.cwd(), 'docs', `RELEASE-${tag}.md`);
if (!existsSync(notesPath)) {
  console.error(`未找到发布说明 ${notesPath}`);
  process.exit(1);
}
const notes = readFileSync(notesPath, 'utf-8');
const titleMatch = notes.match(/^#\s+(.+)$/m);
const releaseName = titleMatch ? titleMatch[1].trim() : `MD工具箱 ${tag}`;
const releaseBody = titleMatch ? notes.replace(titleMatch[0], '').trimStart() : notes;

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
    join(releaseDir, `MD-Toolbox-Setup-${version}.exe`),
    join(releaseDir, `MD-Toolbox-Portable-${version}.zip`),
    join(releaseDir, `MD-Toolbox-${version}.exe`),
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
