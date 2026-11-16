#!/usr/bin/env node
/* 用系统凭据管理器里的 GitHub token 创建仓库（不打印 token）
 * 1. git credential fill 取 https://github.com 的凭据
 * 2. GET /user 拿登录名
 * 3. GET /repos/{owner}/{name} 判断是否已存在
 * 4. 不存在则 POST /user/repos
 * 5. PUT /repos/{owner}/{name}/topics 设置话题
 */
'use strict';

const { execFileSync } = require('child_process');

const NAME = process.env.REPO_NAME || 'github-desktop-zh-cn';
const DESC = 'GitHub Desktop 3.6.x 简体中文语言包｜不改安装包、不碰 diff 内容，装完即中文，一条命令还原';
const HOMEPAGE = '';

function getCred() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const map = {};
  out.split('\n').forEach(function (line) {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  });
  if (!map.username || !map.password) throw new Error('凭据管理器里没有 github.com 的账号');
  return { user: map.username, token: map.password };
}

async function api(method, url, token, body) {
  const res = await fetch('https://api.github.com' + url, {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ghd-zh-installer',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  return { status: res.status, json: json };
}

(async function () {
  const cred = getCred();
  console.log('账号 : ' + cred.user);

  const me = await api('GET', '/user', cred.token);
  if (me.status !== 200) { console.error('取用户信息失败：' + me.status); process.exit(1); }
  const owner = me.json.login;
  console.log('登录名 : ' + owner);

  const exist = await api('GET', '/repos/' + owner + '/' + NAME, cred.token);
  if (exist.status === 200) {
    console.log('仓库已存在，跳过创建：' + exist.json.html_url);
  } else if (exist.status === 404) {
    const created = await api('POST', '/user/repos', cred.token, {
      name: NAME,
      description: DESC,
      homepage: HOMEPAGE || undefined,
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    });
    if (created.status !== 201) {
      console.error('创建仓库失败：' + created.status + ' ' + JSON.stringify(created.json).slice(0, 400));
      process.exit(1);
    }
    console.log('仓库已创建：' + created.json.html_url);
  } else {
    console.error('查询仓库失败：' + exist.status + ' ' + JSON.stringify(exist.json).slice(0, 300));
    process.exit(1);
  }

  const topics = await api('PUT', '/repos/' + owner + '/' + NAME + '/topics', cred.token, {
    names: [
      'github-desktop',
      'chinese',
      'localization',
      'i18n',
      'zh-cn',
      'translation',
      'electron',
      'userscript',
      'windows',
      'desktop-app',
    ],
  });
  if (topics.status === 200) console.log('话题已设置：' + topics.json.names.join(', '));
  else console.log('话题设置失败（不影响使用）：' + topics.status);

  console.log('');
  console.log('OWNER=' + owner);
  console.log('REPO=' + NAME);
})().catch(function (e) {
  console.error('失败：' + e.message);
  process.exit(1);
});
