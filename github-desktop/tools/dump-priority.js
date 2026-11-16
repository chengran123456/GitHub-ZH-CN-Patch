#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const PROJECT = path.resolve(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(PROJECT, 'ref', 'missing.json'), 'utf8'));

const PRIORITY = [
  /\/ui\/app\.tsx$/,
  /\/ui\/toolbar\//,
  /\/ui\/changes\//,
  /\/ui\/history\//,
  /\/ui\/app-menu\//,
  /\/ui\/preferences\/(preferences|appearance|git|integrations|advanced|notifications|prompts|accessibility|accounts)\.tsx$/,
  /\/ui\/dialog\//,
  /\/ui\/welcome\//,
  /\/ui\/branches\//,
  /\/ui\/add-repository\//,
  /\/ui\/clone-repository\//,
  /\/ui\/push-pull\//,
  /\/ui\/lib\/(ok-cancel-button-group|button|link-button|text-box|ref-name-text-box|popover-dropdown|dialog|horizontal-rule|vertical-segmented-control|list|octicon|ahead-behind|relative-time|row|counter|progress)\.tsx$/,
  /\/ui\/banners\//,
  /\/ui\/no-repositories\//,
  /\/ui\/repository-settings\//,
  /\/ui\/worktrees\//,
  /\/ui\/multi-commit-operation\//,
  /\/ui\/stash-changes\//,
  /\/ui\/stashing\//,
  /\/ui\/delete-branch\//,
  /\/ui\/merge\//,
  /\/ui\/rebase\//,
  /\/ui\/pull-request-quick-view\.tsx$/,
  /\/ui\/open-pull-request\//,
  /\/ui\/repositories-list\//,
  /\/ui\/missing-repository\.tsx$/,
  /\/ui\/remove-repository\//,
  /\/ui\/undo\//,
  /\/ui\/create-branch\//,
  /\/ui\/create-tag\//,
  /\/ui\/diff\/(diff-options|index|binary-file|submodule-diff|image-diffs\/two-up)\.tsx$/,
];

const sel = m.pure.filter(function (e) {
  return PRIORITY.some(function (re) { return re.test(e.f.replace(/^\.\//, '')); });
});
const seen = new Set();
const uniq = [];
sel.forEach(function (e) {
  if (seen.has(e.t)) return;
  seen.add(e.t);
  uniq.push(e);
});
uniq.sort(function (a, b) { return a.t.length - b.t.length; });

console.log('高频模块缺失 = ' + uniq.length);
uniq.forEach(function (e, i) {
  console.log(String(i + 1).padStart(3, '0') + '\t' + e.t.replace(/\s+/g, ' ') + '\t[' + e.f.replace('app/src/ui/', '') + ']');
});
