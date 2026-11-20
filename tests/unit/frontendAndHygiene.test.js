import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapErrorToLocaleKey } from '../../public/js/api.js';
import { ACTIONS } from '../../src/knowledge/actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

const enLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/en.json'), 'utf8')
);
const hiLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/hi.json'), 'utf8')
);

describe('Frontend error mapping, locale parity, CSP budgets, and secret hygiene', () => {
  test('maps every API error code and HTTP status to friendly localized messages (never raw HTTP text)', () => {
    const cases = [
      { code: 'AIR_UPSTREAM_FAILED', status: 502 },
      { code: 'GEOCODE_FAILED', status: 502 },
      { code: 'VALIDATION_FAILED', status: 400 },
      { code: 'RATE_LIMITED', status: 429 },
      { code: 'ORIGIN_NOT_ALLOWED', status: 403 },
      { code: 'PAYLOAD_TOO_LARGE', status: 413 },
      { code: 'NOT_FOUND', status: 404 },
      { code: 'INTERNAL_ERROR', status: 500 },
      { status: 400 },
      { status: 403 },
      { status: 404 },
      { status: 413 },
      { status: 429 },
      { status: 500 },
      { status: 503 },
      { isOffline: true },
      { isTimeout: true },
    ];

    for (const input of cases) {
      const key = mapErrorToLocaleKey(input);
      expect(typeof enLocale[key]).toBe('string');
      expect(enLocale[key].trim().length).toBeGreaterThan(10);
      expect(typeof hiLocale[key]).toBe('string');
      expect(hiLocale[key].trim().length).toBeGreaterThan(10);
      expect(enLocale[key]).not.toMatch(/status\s+\d{3}|forbidden|internal server error/i);
    }
  });

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

    // No inline <script> without src attribute
    const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
    for (const tag of scriptTags) {
      expect(tag).toMatch(/\bsrc=/i);
    }

    // No inline style="..." or on*= handlers
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);

    // Zero external URLs in HTML (other than SVG xmlns namespace) or CSS
    const htmlWithoutSvgNs = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
    expect(htmlWithoutSvgNs).not.toMatch(/https?:\/\//i);
    expect(css).not.toMatch(/https?:\/\//i);

    // Zero innerHTML anywhere in public/js
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
    expect(totalJsBytes).toBeLessThan(40 * 1024);

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
        if (rel === 'public/assets/aistudio') continue;
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
      if (relPath === 'tests/unit/frontendAndHygiene.test.js') continue;
      const fullPath = path.join(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
