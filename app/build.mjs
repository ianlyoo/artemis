import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync,
  readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, brotliDecompressSync, constants as zlib, gunzipSync, gzip } from 'node:zlib';

const APP_ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(APP_ROOT, 'src');
const DEFAULT_OUT = resolve(APP_ROOT, '../src/artemis/web/app');
const ISLAND_DIR = 'islands';
const MANIFEST_NAME = 'static-build.json';
const COMPRESS_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);
const MERMAID_PLUGIN_HELPER = 'vendor/deepseek-chat-demo/mermaid-build.js';
const STATIC_DEP_RE = /(?:^|[;\n}])\s*(?:import|export)\s*(?:[\w$*{},\s]+?\s*from\s*)?['"](\.{1,2}\/[^'"\n]+)['"]/g;
const DYNAMIC_DEP_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*\)/g;
const PRELOAD_TOKEN = /const\s+PRELOAD\s*=\s*\{\s*\}\s*;/;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function parseCli(argv) {
  let outDir = process.env.ARTEMIS_WEB_OUT ? resolve(process.env.ARTEMIS_WEB_OUT) : DEFAULT_OUT;
  let metafilePath = null;
  let checkOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--check') checkOnly = true;
    else if (flag === '--out') {
      if (!argv[i + 1]) throw Error('--out needs a path');
      outDir = resolve(argv[++i]);
    } else if (flag === '--metafile') {
      if (!argv[i + 1]) throw Error('--metafile needs a path');
      metafilePath = resolve(argv[++i]);
    } else {
      throw Error(`unexpected option: ${flag}`);
    }
  }
  return { outDir, metafilePath, checkOnly };
}

function collectModuleDirs() {
  const dirs = [];
  const local = resolve(APP_ROOT, 'node_modules');
  if (existsSync(local)) dirs.push(local);
  for (const segment of (process.env.NODE_PATH ?? '').split(delimiter)) {
    const trimmed = segment.trim();
    if (trimmed && existsSync(trimmed) && !dirs.includes(trimmed)) dirs.push(trimmed);
  }
  return dirs;
}

async function resolveEsbuild(moduleDirs) {
  const fromApp = createRequire(resolve(APP_ROOT, 'package.json'));
  try {
    return await import(pathToFileURL(fromApp.resolve('esbuild')).href);
  } catch {}
  for (const dir of moduleDirs) {
    try {
      const req = createRequire(resolve(dir, '_lookup.js'));
      return await import(pathToFileURL(req.resolve('esbuild')).href);
    } catch {}
  }
  throw Error('esbuild was not found; install dependencies with `npm ci` in app/ or provide NODE_PATH');
}

function listFiles(rootDir) {
  const found = [];
  for (const item of readdirSync(rootDir, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const full = resolve(rootDir, item.name);
    if (item.isDirectory()) found.push(...listFiles(full));
    else if (item.isFile()) found.push(full);
  }
  return found;
}

const toPosix = (base, full) => relative(base, full).split(sep).join('/');
const underVendor = rel => rel.split('/').includes('vendor');

function listIslandEntries(dir) {
  return readdirSync(dir)
    .filter(name => name.endsWith('.jsx') || name === 'island.js' || name === 'islands.css')
    .sort(cmp);
}

function linkCanonicalModules(workRoot, moduleDirs) {
  // Expose dependencies under `<workRoot>/node_modules` via symlinks and run esbuild with
  // preserveSymlinks so chunk hashes are identical whether dependencies come from `npm ci`
  // or `NODE_PATH`.
  const target = resolve(workRoot, 'node_modules');
  mkdirSync(target, { recursive: true });
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  for (const dir of moduleDirs) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const srcEntry = resolve(dir, entry.name);
      const dstEntry = resolve(target, entry.name);
      if (entry.name.startsWith('@')) {
        mkdirSync(dstEntry, { recursive: true });
        for (const sub of readdirSync(srcEntry, { withFileTypes: true })) {
          if (sub.name.startsWith('.')) continue;
          const dstSub = resolve(dstEntry, sub.name);
          if (!existsSync(dstSub)) symlinkSync(resolve(srcEntry, sub.name), dstSub, linkType);
        }
      } else if (!existsSync(dstEntry)) {
        const isDir = entry.isDirectory() || (entry.isSymbolicLink() && statSync(srcEntry).isDirectory());
        symlinkSync(srcEntry, dstEntry, isDir ? linkType : 'file');
      }
    }
  }
}

async function compileIslands({ esbuild, stageDir, workRoot, moduleDirs, metafilePath }) {
  const islandsPath = resolve(SRC_ROOT, ISLAND_DIR);
  if (!existsSync(islandsPath)) return new Set();
  const names = listIslandEntries(islandsPath);
  if (!names.length) return new Set();

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(SRC_ROOT, resolve(workRoot, 'src'), linkType);
  linkCanonicalModules(workRoot, moduleDirs);

  const helper = resolve(SRC_ROOT, MERMAID_PLUGIN_HELPER);
  const { mermaidForHome } = await import(pathToFileURL(helper).href);

  const plugins = [
    {
      name: 'scope-astryx-reset',
      setup(build) {
        const marker = '@layer reset {';
        build.onLoad({ filter: /[\\/]@astryxdesign[\\/]core[\\/]src[\\/]reset\.css$/ }, ({ path }) => {
          const css = readFileSync(path, 'utf8').trimEnd();
          const idx = css.indexOf(marker);
          if (idx < 0 || !css.endsWith('}') || css.indexOf(marker, idx + 1) >= 0) {
            throw Error(`${path}: unexpected reset layer shape`);
          }
          const body = css.slice(idx + marker.length, -1);
          return { loader: 'css', contents: `${css.slice(0, idx)}${marker}@scope ([data-astryx-island]){${body}}}` };
        });
      },
    },
    {
      name: 'katex-woff2-only',
      setup(build) {
        build.onLoad({ filter: /[\\/]katex[\\/]dist[\\/]katex\.min\.css$/ }, ({ path }) => {
          const css = readFileSync(path, 'utf8').replace(
            /src:([^;}]+)([;}])/g,
            (_, list, tail) => 'src:' + list.split(',').filter(item => item.includes('.woff2')).join(',') + tail,
          );
          return { loader: 'css', resolveDir: dirname(path), contents: `@layer astryx-base {${css}}` };
        });
      },
    },
    {
      name: 'mermaid-profile',
      setup(build) {
        build.onLoad(
          { filter: /[\\/]mermaid[\\/]dist[\\/](?:mermaid\.core|chunks[\\/]mermaid\.core[\\/]chunk-[^\\/]+)\.mjs$/ },
          ({ path }) => ({
            loader: 'js',
            resolveDir: dirname(path),
            contents: mermaidForHome(path, readFileSync(path, 'utf8')),
          }),
        );
      },
    },
  ];

  const realWork = realpathSync(workRoot);
  const relOut = 'out-islands';
  const result = await esbuild.build({
    absWorkingDir: realWork,
    preserveSymlinks: true,
    entryPoints: names.map(name => `src/${ISLAND_DIR}/${name}`),
    outdir: relOut,
    outbase: `src/${ISLAND_DIR}`,
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    jsx: 'automatic',
    charset: 'utf8',
    minify: true,
    legalComments: 'none',
    metafile: true,
    logLevel: 'error',
    plugins,
    define: { 'process.env.NODE_ENV': '"production"' },
  });

  cpSync(resolve(realWork, relOut), resolve(stageDir, ISLAND_DIR), { recursive: true });
  if (metafilePath) {
    mkdirSync(dirname(metafilePath), { recursive: true });
    writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2) + '\n');
  }
  return new Set(
    Object.keys(result.metafile.outputs).map(out => `${ISLAND_DIR}/${out.slice(relOut.length + 1)}`),
  );
}

function computePreloadTable(stageDir, islandsPath) {
  const sources = new Map();
  for (const file of listFiles(stageDir)) {
    const rel = toPosix(stageDir, file);
    if (rel.endsWith('.js') && !underVendor(rel)) sources.set(rel, readFileSync(file, 'utf8'));
  }
  const joinRel = (from, spec) => posix.normalize(posix.join(posix.dirname(from), spec));
  const staticDeps = rel =>
    [...(sources.get(rel) ?? '').matchAll(STATIC_DEP_RE)]
      .map(match => joinRel(rel, match[1]))
      .filter(dep => sources.has(dep))
      .sort(cmp);
  const collect = rootMod => {
    const visited = new Set([rootMod]);
    for (const current of visited) {
      for (const dep of staticDeps(current)) visited.add(dep);
    }
    return [...visited];
  };

  const roots = new Set(['app.js']);
  if (existsSync(islandsPath)) {
    for (const name of listIslandEntries(islandsPath)) {
      if (name.endsWith('.jsx')) roots.add(`${ISLAND_DIR}/${basename(name, '.jsx')}.js`);
    }
  }
  for (const [rel, body] of sources) {
    for (const match of body.matchAll(DYNAMIC_DEP_RE)) {
      const target = joinRel(rel, match[1]);
      if (sources.has(target)) roots.add(target);
    }
  }
  return Object.fromEntries([...roots].sort(cmp).map(item => [item, collect(item)]));
}

async function minifyAppModules(esbuild, stageDir, skipSet) {
  const opts = { charset: 'utf8', legalComments: 'none', loader: 'js', minify: true, target: 'esnext' };
  const candidates = listFiles(stageDir)
    .filter(file => {
      const rel = toPosix(stageDir, file);
      return rel.endsWith('.js') && !underVendor(rel) && !skipSet.has(rel);
    })
    .sort((a, b) => cmp(toPosix(stageDir, a), toPosix(stageDir, b)));
  for (const file of candidates) {
    const transformed = await esbuild.transform(readFileSync(file, 'utf8'), opts);
    writeFileSync(file, transformed.code);
  }
}

function stampIndexAndManifest(stageDir, indexPath, originalHtml) {
  const digest = createHash('sha256');
  const members = listFiles(stageDir)
    .filter(file => file !== indexPath)
    .sort((a, b) => cmp(toPosix(stageDir, a), toPosix(stageDir, b)));
  for (const file of members) {
    digest.update(toPosix(stageDir, file)).update('\0').update(readFileSync(file)).update('\0');
  }
  const id = digest.digest('hex').slice(0, 12);
  writeFileSync(resolve(stageDir, MANIFEST_NAME), `${JSON.stringify({ build: id })}\n`);

  const baseRewritten = originalHtml.replace(/<base href="[^"]*">/, '<base href="/">');
  const fontsRewritten = baseRewritten.replaceAll('href="./fonts/', 'href="/fonts/');
  const stamped = fontsRewritten.replace(/\b(src|href)="\.\/([^"]+)"/g, (_, key, rel) => `${key}="/static/${id}/${rel}"`);
  writeFileSync(indexPath, stamped);
  return id;
}

async function writeCompressedCopies(stageDir) {
  const brotliAsync = promisify(brotliCompress);
  const gzipAsync = promisify(gzip);
  const eligible = listFiles(stageDir)
    .filter(file => COMPRESS_EXTS.has(extname(file)) && statSync(file).size > 1024)
    .sort((a, b) => cmp(toPosix(stageDir, a), toPosix(stageDir, b)));
  await Promise.all(eligible.map(async file => {
    const raw = readFileSync(file);
    const [br, gz] = await Promise.all([
      brotliAsync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
      gzipAsync(raw, { level: 9 }),
    ]);
    if (br.length < raw.length) writeFileSync(`${file}.br`, br);
    if (gz.length < raw.length) {
      // Zero mtime and pin OS byte (Unix = 3). The deflate stream itself still varies with the zlib in the Node
      // that builds (Node 22 and 24 differ), so --check compares compressed copies by what they decompress to.
      gz.writeUInt32LE(0, 4);
      gz[9] = 3;
      writeFileSync(`${file}.gz`, gz);
    }
  }));
}

// What a browser receives from a file: a compressed copy is compared by its content, since its bytes depend on
// the compressor's build; every other file byte for byte.
function served(rel, data) {
  if (rel.endsWith('.gz')) return gunzipSync(data);
  if (rel.endsWith('.br')) return brotliDecompressSync(data);
  return data;
}

function diffDirectories(stageDir, outDir) {
  if (!existsSync(outDir)) return { match: false, issues: [`missing output directory: ${outDir}`], count: 0 };
  const built = new Map(listFiles(stageDir).map(f => [toPosix(stageDir, f), f]));
  const committed = new Map(listFiles(outDir).map(f => [toPosix(outDir, f), f]));
  const issues = [];
  const allKeys = [...new Set([...built.keys(), ...committed.keys()])].sort(cmp);
  for (const rel of allKeys) {
    if (!committed.has(rel)) issues.push(`missing in committed output: ${rel}`);
    else if (!built.has(rel)) issues.push(`stale file in committed output: ${rel}`);
    else if (!served(rel, readFileSync(built.get(rel))).equals(served(rel, readFileSync(committed.get(rel))))) {
      issues.push(`bytes differ: ${rel}`);
    }
  }
  return { match: issues.length === 0, issues, count: built.size };
}

function syncDirectory(stageDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  const keep = new Set();
  for (const file of listFiles(stageDir)) {
    const rel = toPosix(stageDir, file);
    keep.add(rel);
    const target = resolve(outDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    const data = readFileSync(file);
    if (existsSync(target) && lstatSync(target).isFile() && readFileSync(target).equals(data)) continue;
    writeFileSync(target, data);
  }
  function removeStale(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, item.name);
      if (item.isDirectory()) {
        removeStale(full);
        if (!readdirSync(full).length) rmSync(full, { recursive: true, force: true });
      } else if (!keep.has(toPosix(outDir, full))) {
        unlinkSync(full);
      }
    }
  }
  removeStale(outDir);
  return keep.size;
}

async function run() {
  const { outDir, metafilePath, checkOnly } = parseCli(process.argv.slice(2));
  const moduleDirs = collectModuleDirs();
  const esbuild = await resolveEsbuild(moduleDirs);
  const scratch = mkdtempSync(join(tmpdir(), 'artemis-web-'));
  const stageDir = resolve(scratch, 'stage');
  const workRoot = resolve(scratch, 'work');
  mkdirSync(stageDir, { recursive: true });
  mkdirSync(workRoot, { recursive: true });

  try {
    const islandsPath = resolve(SRC_ROOT, ISLAND_DIR);
    const helperPath = resolve(SRC_ROOT, MERMAID_PLUGIN_HELPER);
    cpSync(SRC_ROOT, stageDir, {
      recursive: true,
      filter: candidate => {
        if (candidate === islandsPath || candidate === helperPath) return false;
        const suffix = candidate.slice(SRC_ROOT.length);
        return !suffix.split(/[\\/]/).some(part => part.startsWith('.'));
      },
    });

    const indexPath = resolve(stageDir, 'index.html');
    const htmlSource = readFileSync(indexPath, 'utf8');
    if ((htmlSource.match(/<base href="[^"]*">/g) ?? []).length !== 1) {
      throw Error('index.html requires exactly one <base href="..."> element');
    }

    const themePath = resolve(stageDir, 'theme.css');
    writeFileSync(themePath, readFileSync(themePath, 'utf8').replaceAll('url("./fonts/', 'url("/fonts/'));

    const bundledOutputs = await compileIslands({ esbuild, stageDir, workRoot, moduleDirs, metafilePath });

    const preloadTable = computePreloadTable(stageDir, islandsPath);
    const bootPath = resolve(stageDir, 'boot.js');
    const bootSource = readFileSync(bootPath, 'utf8');
    if (!PRELOAD_TOKEN.test(bootSource)) {
      throw Error('boot.js must define `const PRELOAD = {};`');
    }
    writeFileSync(bootPath, bootSource.replace(PRELOAD_TOKEN, `const PRELOAD=${JSON.stringify(preloadTable)};`));

    await minifyAppModules(esbuild, stageDir, bundledOutputs);
    const buildId = stampIndexAndManifest(stageDir, indexPath, htmlSource);
    await writeCompressedCopies(stageDir);

    if (checkOnly) {
      const diff = diffDirectories(stageDir, outDir);
      if (!diff.match) {
        console.error(`FAIL web build differs from ${outDir} (rebuilt id ${buildId}):`);
        for (const item of diff.issues.slice(0, 40)) console.error(`  - ${item}`);
        if (diff.issues.length > 40) console.error(`  ... +${diff.issues.length - 40} more`);
        process.exitCode = 1;
        return;
      }
      console.log(`OK ${outDir} matches the rebuilt output, compressed copies by content (build ${buildId}, ${diff.count} files)`);
      return;
    }

    const total = syncDirectory(stageDir, outDir);
    console.log(`built ${outDir} (build ${buildId}, ${total} files)`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

await run();
