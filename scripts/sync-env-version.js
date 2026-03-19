#!/usr/bin/env node
/**
 * 从 package.json 同步 version 到 .env 的 VERSION_LATEST
 * 用法: node scripts/sync-env-version.js
 * 或在 build/docker:build 前自动执行
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version || "1.0.0";

let content;
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf8");
  if (/^VERSION_LATEST=/m.test(content)) {
    content = content.replace(/^VERSION_LATEST=.*$/m, `VERSION_LATEST=${version}`);
  } else {
    content = content.trimEnd() + `\nVERSION_LATEST=${version}\n`;
  }
} else if (fs.existsSync(examplePath)) {
  content = fs.readFileSync(examplePath, "utf8").replace(
    /^VERSION_LATEST=.*$/m,
    `VERSION_LATEST=${version}`,
  );
} else {
  content = `VERSION_LATEST=${version}\n`;
}

fs.writeFileSync(envPath, content);
console.log(`[sync-env-version] VERSION_LATEST=${version} -> .env`);
