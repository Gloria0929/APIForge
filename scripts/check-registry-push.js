#!/usr/bin/env node
'use strict';

/**
 * 推送前置校验：在真正 buildx build 之前，确认当前 docker 凭据对目标仓库有 push 权限。
 *
 * 背景：多架构构建耗时很长，若镜像名写错（例如漏了 registry 主机前缀，
 * `freyax/apiforge` 会被 Docker 解析成 docker.io/freyax/apiforge），
 * 只有到 push 阶段才会失败，白白浪费一轮构建。这里提前用 registry 的
 * token 接口探一次 scope，几秒内就能给出结论。
 *
 * 用法:
 *   node scripts/check-registry-push.js <镜像名> [<镜像名> ...]
 *   node scripts/check-registry-push.js crpi-xxx.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge
 *   node scripts/check-registry-push.js foehao09/apiforge
 *
 * 退出码: 0 全部可推（或无法判定但已告警）；1 存在明确无权限的目标。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DOCKER_HUB_HOSTS = ['docker.io', 'index.docker.io', 'registry-1.docker.io'];

function loadDockerConfig() {
  const dir = process.env.DOCKER_CONFIG || path.join(os.homedir(), '.docker');
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  } catch (err) {
    return { auths: {}, __error: err.message };
  }
}

/** 把镜像名拆成 registry 主机 + 仓库路径 */
function splitRef(ref) {
  const clean = String(ref).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const parts = clean.split('/');
  let host = 'docker.io';
  let rest = clean;
  // 第一段含 "." 或 ":"（或为 localhost）才认为是 registry 主机
  if (parts.length > 1 && (/[.:]/.test(parts[0]) || parts[0] === 'localhost')) {
    host = parts[0];
    rest = parts.slice(1).join('/');
  }
  if (host === 'docker.io' && !rest.includes('/')) rest = `library/${rest}`;
  return { host, repo: rest };
}

function findCredentials(config, host) {
  const auths = config.auths || {};
  const candidates =
    DOCKER_HUB_HOSTS.includes(host)
      ? ['https://index.docker.io/v1/', 'docker.io', 'index.docker.io', 'registry-1.docker.io']
      : [host, `https://${host}`, `https://${host}/v1/`];

  for (const key of candidates) {
    const entry = auths[key];
    if (!entry) continue;
    if (entry.auth) {
      const decoded = Buffer.from(entry.auth, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx > 0) return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
    }
    if (entry.identitytoken) return { identitytoken: entry.identitytoken };
  }
  return null;
}

function registryBase(host) {
  return DOCKER_HUB_HOSTS.includes(host) ? 'https://registry-1.docker.io' : `https://${host}`;
}

/** 解析 WWW-Authenticate: Bearer realm="...",service="..." */
function parseBearerChallenge(header) {
  if (!header || !/^bearer/i.test(header.trim())) return null;
  const realm = /realm="([^"]+)"/i.exec(header);
  const service = /service="([^"]+)"/i.exec(header);
  if (!realm) return null;
  return { realm: realm[1], service: service ? service[1] : '' };
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function checkTarget(ref, config) {
  const { host, repo } = splitRef(ref);
  const base = registryBase(host);
  const label = `${host}/${repo}`;

  let challengeRes;
  try {
    challengeRes = await fetch(`${base}/v2/`, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { ok: true, label, skipped: `无法连接仓库（${err.message}），跳过校验` };
  }

  const challenge = parseBearerChallenge(challengeRes.headers.get('www-authenticate'));
  if (!challenge) {
    // 少数私有仓库直接放行匿名，无法判定，交给后续 push 兜底
    return { ok: true, label, skipped: '仓库未返回 Bearer 质询，跳过校验' };
  }

  const url = new URL(challenge.realm);
  if (challenge.service) url.searchParams.set('service', challenge.service);
  url.searchParams.set('scope', `repository:${repo}:pull,push`);

  const cred = findCredentials(config, host);
  const headers = {};
  if (cred && cred.user) {
    headers.Authorization = `Basic ${Buffer.from(`${cred.user}:${cred.pass}`).toString('base64')}`;
  } else if (cred && cred.identitytoken) {
    headers.Authorization = `Bearer ${cred.identitytoken}`;
  }

  let tokenData;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        ok: false,
        label,
        reason: `换取访问令牌失败（HTTP ${res.status}），凭据可能已过期，请重新 docker login ${host}`,
      };
    }
    tokenData = await res.json();
  } catch (err) {
    return { ok: true, label, skipped: `换取令牌时网络异常（${err.message}），跳过校验` };
  }

  const token = tokenData.access_token || tokenData.token;
  if (!token) {
    return { ok: true, label, skipped: '仓库未下发令牌，跳过校验' };
  }

  const payload = decodeJwtPayload(token);
  const access = (payload && payload.access) || [];
  const granted = access.find((a) => a && a.name === repo);
  const actions = (granted && granted.actions) || [];

  if (actions.includes('push')) {
    const who = cred && cred.user ? `账号 ${cred.user}` : '匿名凭据';
    return { ok: true, label, note: `${who} 具备 push 权限` };
  }

  const who = cred && cred.user ? `账号 ${cred.user}` : '当前凭据（未找到登录信息）';
  const got = actions.length ? actions.join(',') : '无任何权限';
  return {
    ok: false,
    label,
    reason: `${who} 对该仓库的权限为「${got}」，缺少 push`,
  };
}

async function main() {
  const refs = process.argv.slice(2).filter(Boolean);
  if (refs.length === 0) {
    console.error('用法: node scripts/check-registry-push.js <镜像名> [<镜像名> ...]');
    process.exit(2);
  }

  const config = loadDockerConfig();
  if (config.__error) {
    console.warn(`[警告] 读取 docker 凭据失败（${config.__error}），跳过推送权限校验`);
    return;
  }

  const results = [];
  for (const ref of refs) {
    results.push(await checkTarget(ref, config));
  }

  let failed = false;
  for (const r of results) {
    if (!r.ok) {
      failed = true;
      console.error(`[✗] ${r.label}`);
      console.error(`    ${r.reason}`);
    } else if (r.skipped) {
      console.warn(`[?] ${r.label}  ${r.skipped}`);
    } else {
      console.log(`[✓] ${r.label}  ${r.note}`);
    }
  }

  if (failed) {
    console.error('');
    console.error('推送权限校验未通过，已中止构建（避免长时间构建后才发现失败）。');
    process.exit(1);
  }
}

main().catch((err) => {
  console.warn(`[警告] 推送权限校验异常（${err.message}），跳过校验`);
});
