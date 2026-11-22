import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIONS } from '../../src/knowledge/actions.js';
import { enLocale, hiLocale, rootDir } from '../helpers/domFixtures.js';

describe('Repository hygiene, locale parity, strict CSP, and performance budgets', () => {
  test('en.json and hi.json have identical key sets, non-empty values, and cover all 34 curated actions', () => {
    const enKeys = Object.keys(enLocale).sort();
    const hiKeys = Object.keys(hiLocale).sort();
    expect(hiKeys).toEqual(enKeys);

    for (const key of enKeys) {
      expect(enLocale[key].trim().length).toBeGreaterThan(0);
      expect(hiLocale[key].trim().length).toBeGreaterThan(0);
    }

    for (const action of ACTIONS) {
      expect(enLocale[action.textKey]).toBeTruthy();
      expect(hiLocale[action.textKey]).toBeTruthy();
      expect(enLocale[action.impactNoteKey]).toBeTruthy();
      expect(hiLocale[action.impactNoteKey]).toBeTruthy();
    }
  });

  test('frontend adheres to strict CSP (no inline scripts/styles, no external URLs, no innerHTML)', () => {
    const html = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(rootDir, 'public/css/styles.css'), 'utf8');

    const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\bsrc=/i);
    }

    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);

    const htmlWithoutSvgNs = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    expect(htmlWithoutSvgNs).not.toMatch(/https?:\/\//i);
    expect(css).not.toMatch(/https?:\/\//i);

    const jsDir = path.join(rootDir, 'public/js');
    for (const file of fs.readdirSync(jsDir)) {
      if (!file.endsWith('.js')) continue;
      const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
      expect(code).not.toMatch(/\.innerHTML\b|outerHTML\b|insertAdjacentHTML\b/);
    }
  });

  test('frontend assets stay strictly within performance budgets', () => {
    const cssBytes = fs.statSync(path.join(rootDir, 'public/css/styles.css')).size;
    expect(cssBytes).toBeLessThan(30 * 1024);

    const jsDir = path.join(rootDir, 'public/js');
    const totalJsBytes = fs
      .readdirSync(jsDir)
      .filter((f) => f.endsWith('.js'))
      .reduce((sum, f) => sum + fs.statSync(path.join(jsDir, f)).size, 0);
    expect(totalJsBytes).toBeLessThan(60 * 1024);

    const fontsDir = path.join(rootDir, 'public/fonts');
    const totalFontBytes = fs
      .readdirSync(fontsDir)
      .filter((f) => f.endsWith('.woff2'))
      .reduce((sum, f) => sum + fs.statSync(path.join(fontsDir, f)).size, 0);
    expect(totalFontBytes).toBeLessThan(150 * 1024);

    const html = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
    const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
    expect(svgMatch).not.toBeNull();
    expect(Buffer.byteLength(svgMatch[0], 'utf8')).toBeLessThan(12 * 1024);

    const css = fs.readFileSync(path.join(rootDir, 'public/css/styles.css'), 'utf8');
    const printBlock = css.slice(css.indexOf('@media print'));
    expect(printBlock).toContain('.why-panel[hidden]');
    expect(printBlock).toContain('#impact-formula-panel[hidden]');
    expect(printBlock).toContain('display: block !important');
  });

  test('tracked repository files contain zero secret keys or private key blocks', () => {
    const walkFiles = (dir, base = rootDir) => {
      const ignored = new Set([
        '.git',
        'node_modules',
        'coverage',
        '.aistudio',
        '.playwright-cli',
        '.env',
      ]);
      const results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(base, full);
        if (entry.isDirectory()) {
          results.push(...walkFiles(full, base));
        } else {
          results.push(rel);
        }
      }
      return results;
    };

    const filesToScan = fs.existsSync(path.join(rootDir, '.git'))
      ? execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' })
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
      : walkFiles(rootDir);

    const secretPatterns = [
      /AIza[0-9A-Za-z_-]{30,}/,
      /sk-[A-Za-z0-9]{20,}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /ghp_[A-Za-z0-9]{30,}/,
    ];

    expect(filesToScan.length).toBeGreaterThan(10);

    for (const relPath of filesToScan) {
      if (/\.(png|jpg|jpeg|woff2|ico)$/i.test(relPath)) continue;
      if (relPath === 'tests/unit/repoHygiene.test.js') continue;
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  test('public/ contains only explicitly allowlisted static assets and git tracks no leftover artifacts', () => {
    const allowedPublicEntries = ['css', 'fonts', 'index.html', 'js', 'locales'];
    const actualEntries = fs.readdirSync(path.join(rootDir, 'public')).sort();
    expect(actualEntries).toEqual(allowedPublicEntries);

    if (fs.existsSync(path.join(rootDir, '.git'))) {
      const tracked = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' })
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
      expect(tracked.some((f) => f.startsWith('public/assets/aistudio/'))).toBe(false);
      expect(tracked.some((f) => f.startsWith('.aistudio/'))).toBe(false);
      expect(tracked).not.toContain('bun.lock');
    }
  });
});
