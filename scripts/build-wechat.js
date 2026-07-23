#!/usr/bin/env node
'use strict';

/**
 * 打包 WeChatFormatter → WeChatFormatter/dist/
 * ES Module 仅做 minify（不做混淆，避免破坏 import/export）
 */

const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const { minify: terserMinify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'WeChatFormatter');
const DIST = path.join(SRC, 'dist');

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: false, // 保留 type="module"
  removeStyleLinkTypeAttributes: true,
  minifyCSS: true,
  minifyJS: true,
  keepClosingSlash: true
};

const JS_FILES = [
  'app.js',
  'config/apiConfig.js',
  'config/promptConfig.js',
  'utils/codeHighlight.js',
  'utils/deepseekClient.js',
  'utils/localFormatter.js',
  'utils/techBg.js',
  'utils/textProcessor.js',
  'utils/wechatCompat.js'
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFile(rel) {
  const from = path.join(SRC, rel);
  const to = path.join(DIST, rel);
  ensureDir(to);
  fs.copyFileSync(from, to);
}

function copyDir(rel) {
  const from = path.join(SRC, rel);
  const to = path.join(DIST, rel);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(path.join(rel, entry.name));
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function minifyModule(source) {
  const result = await terserMinify(source, {
    module: true,
    compress: {
      dead_code: true,
      drop_console: false,
      passes: 2
    },
    mangle: true,
    format: { comments: false }
  });
  if (result.error) throw result.error;
  return result.code;
}

/** 去掉 import / script 上的 ?v= 缓存戳，便于部署 */
function stripCacheBust(text) {
  return text
    .replace(/(['"`][^'"`]+?\.js)\?v=[^'"`]+(['"`])/g, '$1$2')
    .replace(/(src=["'][^"']+?\.js)\?v=[^"']+(["'])/g, '$1$2');
}

async function build() {
  console.log('Building WeChatFormatter production bundle...\n');

  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  const stats = [];

  for (const rel of JS_FILES) {
    const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const cleaned = stripCacheBust(source);
    const minified = await minifyModule(cleaned);
    const out = path.join(DIST, rel);
    ensureDir(out);
    fs.writeFileSync(out, minified);
    stats.push([rel, source, minified]);
  }

  copyDir('vendor');

  let htmlSource = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  htmlSource = stripCacheBust(htmlSource);
  const htmlMin = await minifyHtml(htmlSource, HTML_MINIFY_OPTIONS);
  fs.writeFileSync(path.join(DIST, 'index.html'), htmlMin);
  stats.unshift(['index.html', htmlSource, htmlMin]);

  console.log('Build complete -> WeChatFormatter/dist/\n');
  console.log('File                          Original    Built       Saved');
  console.log('------------------------------ ----------- ----------- ------');
  for (const [name, before, after] of stats) {
    const b = Buffer.byteLength(before, 'utf8');
    const a = Buffer.byteLength(after, 'utf8');
    const pct = ((1 - a / b) * 100).toFixed(1);
    console.log(
      `${name.padEnd(30)} ${formatSize(b).padStart(11)} ${formatSize(a).padStart(11)} ${pct.padStart(5)}%`
    );
  }
  console.log('\nRun: npx serve WeChatFormatter/dist');
  console.log('Or:  npm start  → http://localhost:3000/WeChatFormatter/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
