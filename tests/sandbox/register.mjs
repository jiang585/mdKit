/** 沙盒测试引导：注册模块解析钩子（别名 @renderer/@shared、.ts 扩展、vitest 垫片） */
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
