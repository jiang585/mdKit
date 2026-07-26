types/vendor/ —— 沙盒/离线环境的第三方库最小类型声明。

用途：在无法安装 node_modules 的环境（如离线 CI、受限沙盒）里执行
  tsc -p tsconfig.sandbox.node.json && tsc -p tsconfig.sandbox.web.json
对全部源码做类型一致性验证。

注意：正常开发/构建请使用 npm install 后的官方类型（tsconfig.node.json /
tsconfig.web.json 不包含本目录，两套声明不会冲突）。
