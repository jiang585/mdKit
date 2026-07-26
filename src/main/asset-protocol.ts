/**
 * 本地文档图片协议：mdkit-doc://local/?p=<encodeURIComponent(绝对路径)>
 * 仅放行图片扩展名；路径必须位于「已打开文档所在目录」白名单之内，防目录穿越。
 */
import { app, net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { extname, isAbsolute, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DOC_ASSET_PROTOCOL } from '@shared/constants';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);

/** 已打开文档的所在目录集合（由文件服务在打开/保存时注册） */
const allowedDirs = new Set<string>();

export function allowDocDir(dir: string): void {
  allowedDirs.add(normalize(dir + sep));
}

export function registerAssetProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DOC_ASSET_PROTOCOL, privileges: { secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function installAssetProtocol(): void {
  void app.whenReady().then(() => {
    protocol.handle(DOC_ASSET_PROTOCOL, (request) => {
      try {
        const url = new URL(request.url);
        const raw = url.searchParams.get('p') ?? '';
        const filePath = normalize(decodeURIComponent(raw));
        const okExt = IMAGE_EXT.has(extname(filePath).toLowerCase());
        const okDir = [...allowedDirs].some((dir) => filePath.startsWith(dir));
        if (!isAbsolute(filePath) || !okExt || !okDir || !existsSync(filePath)) {
          return new Response('Not allowed', { status: 403 });
        }
        return net.fetch(pathToFileURL(filePath).toString());
      } catch {
        return new Response('Bad request', { status: 400 });
      }
    });
  });
}
