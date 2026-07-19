#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const JavaScriptObfuscator = require('javascript-obfuscator');

const { minify: terserMinify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'mdEditor');
const DIST = path.join(SRC, 'dist');

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  reservedNames: [
    'i18n', 'marked', 'DOMPurify', 'renderMathInElement', 'katex', 'mermaid', 'domtoimage',
    'indexedDB', 'localStorage', 'DOMParser', 'Blob', 'URL', 'FileReader', 'confirm', 'prompt', 'alert'
  ],
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false
};

const HTML_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  minifyCSS: true,
  minifyJS: false,
  keepClosingSlash: true
};

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function write(file, content) {
  const target = path.join(DIST, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function copyDir(src, dest) {
  const from = path.join(SRC, src);
  const to = path.join(DIST, dest);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(path.relative(SRC, srcPath), path.relative(DIST, destPath));
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function extractGlobalHandlers(html) {
  const names = new Set();
  const re = /\bon(?:click|change)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    match[1].split(';').forEach(part => {
      const call = part.trim().match(/^([a-zA-Z_$][\w$]*)\s*\(/);
      if (call) names.add(call[1]);
    });
  }
  return [...names];
}

function obfuscateJs(source, extraReserved = []) {
  const reservedNames = [...new Set([...OBFUSCATOR_OPTIONS.reservedNames, ...extraReserved])];
  const result = JavaScriptObfuscator.obfuscate(source, {
    ...OBFUSCATOR_OPTIONS,
    reservedNames
  });
  return result.getObfuscatedCode();
}

async function minifyJs(source, reserved = []) {
  const result = await terserMinify(source, {
    compress: {
      dead_code: true,
      drop_console: false,
      passes: 2
    },
    mangle: {
      reserved: [...new Set([...OBFUSCATOR_OPTIONS.reservedNames, ...reserved])]
    },
    format: { comments: false }
  });
  if (result.error) throw result.error;
  return result.code;
}

async function processAppJs(source, extraReserved = []) {
  const minified = await minifyJs(source, extraReserved);
  return obfuscateJs(minified, extraReserved);
}

async function processDataJs(source) {
  return minifyJs(source, ['i18n']);
}

function minifyCss(source) {
  const output = new CleanCSS({ level: 2 }).minify(source);
  if (output.errors.length) {
    throw new Error('CSS minify failed: ' + output.errors.join('; '));
  }
  return output.styles;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function build() {
  console.log('Building mdEditor production bundle...\n');

  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  const htmlSource = read('index.html');
  const cssSource = read('public/markdown-editor.css');
  const jsSource = read('public/markdown-editor.js');
  const i18nSource = read('i18n.js');

  const globalHandlers = extractGlobalHandlers(htmlSource);
  console.log('Reserved global handlers:', globalHandlers.length);

  const cssMin = minifyCss(cssSource);
  write('public/markdown-editor.css', cssMin);

  const jsObf = await processAppJs(jsSource, globalHandlers);
  write('public/markdown-editor.js', jsObf);

  const i18nMin = await processDataJs(i18nSource);
  write('i18n.js', i18nMin);

  copyDir('public/vendor', 'public/vendor');

  const skipPublicFiles = new Set(['markdown-editor.css', 'markdown-editor.js']);
  const otherPublicFiles = fs.readdirSync(path.join(SRC, 'public'), { withFileTypes: true })
    .filter(e => e.isFile() && !skipPublicFiles.has(e.name));
  for (const file of otherPublicFiles) {
    fs.copyFileSync(
      path.join(SRC, 'public', file.name),
      path.join(DIST, 'public', file.name)
    );
  }

  const htmlMin = await minifyHtml(htmlSource, HTML_MINIFY_OPTIONS);
  write('index.html', htmlMin);

  const stats = [
    ['index.html', htmlSource, htmlMin],
    ['public/markdown-editor.css', cssSource, cssMin],
    ['public/markdown-editor.js', jsSource, jsObf],
    ['i18n.js', i18nSource, i18nMin]
  ];

  console.log('\nBuild complete -> mdEditor/dist/\n');
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
  console.log('\nRun: npm start  (or: npx serve mdEditor/dist)');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
