/**
 * 依赖重锁脚本：若 package.json 中某个精确版本在 registry 已不可得
 * （npm install 报 ETARGET/E404），运行 `npm run deps:relock`
 * 以相同主版本的最新稳定版重装并精确锁定（save-exact）。
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

function relock(deps, flag) {
  const specs = Object.entries(deps ?? {}).map(([name, version]) => {
    const major = String(version).split('.')[0];
    return `${name}@^${major}`;
  });
  if (specs.length === 0) return;
  console.log(`重锁 ${flag}：${specs.length} 个包`);
  execSync(`npm install ${flag} --save-exact ${specs.join(' ')}`, { stdio: 'inherit' });
}

relock(pkg.dependencies, '--save-prod');
relock(pkg.devDependencies, '--save-dev');
console.log('依赖已按同主版本最新稳定版精确锁定。');
