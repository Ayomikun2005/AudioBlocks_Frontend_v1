import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards for the four launch-readiness performance items. Each one turns a
// rule that lived in a document into a build failure:
//
//  - PERF-01: the Lighthouse budgets exist and are the documented numbers.
//  - PERF-03: the wallets kit is imported dynamically, never in the initial chunk.
//  - PERF-04: the unreferenced megabyte-scale assets stay deleted, and every
//    `fill` image declares its rendered size.

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

describe('PERF-01: Lighthouse budgets', () => {
  it('configures LCP, CLS and TBT at the Core Web Vitals thresholds', () => {
    const config = read('.lighthouserc.js');
    expect(config).toContain("'largest-contentful-paint': ['error', { maxNumericValue: 2500 }]");
    expect(config).toContain("'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }]");
    expect(config).toContain("'total-blocking-time': ['error', { maxNumericValue: 200 }]");
  });

  it('runs the two public routes with more than one sample each', () => {
    const config = read('.lighthouserc.js');
    expect(config).toContain('http://localhost:3000/');
    expect(config).toContain('http://localhost:3000/marketPlace');
    expect(config).toMatch(/numberOfRuns: [2-9]/);
  });

  it('is wired into a pull-request workflow', () => {
    const workflow = read('.github/workflows/lighthouse.yml');
    expect(workflow).toContain('pull_request');
    expect(workflow).toContain('@lhci/cli');
  });
});

describe('PERF-03: lazy wallet SDKs', () => {
  it('loads the wallets kit with a dynamic import inside the provider', () => {
    const source = read('context/StellarWalletContext.tsx');
    // Prettier may wrap the call, so match the import expression, not a
    // single formatted line.
    expect(source).toMatch(/await import\(\s*['"]@creit\.tech\/stellar-wallets-kit['"]\s*\)/);
    // A value import would put the kit back in the initial chunk even though
    // the dynamic one exists.
    const valueImport =
      /^\s*import\s+(?!type\b)[^;]*from\s+['"]@creit\.tech\/stellar-wallets-kit['"]/m;
    expect(valueImport.test(source)).toBe(false);
  });
});

describe('PERF-04: cover art and assets', () => {
  it('keeps the unreferenced megabyte-scale assets deleted', () => {
    for (const asset of ['public/smart.svg', 'public/collective.svg', 'public/zoom.png']) {
      expect(existsSync(join(root, asset)), `${asset} is back in public/`).toBe(false);
    }
  });

  it('gives every fill image a sizes prop', () => {
    const offenders: string[] = [];

    for (const file of walk(root)) {
      if (!file.endsWith('.tsx')) continue;
      if (file.includes(join('node_modules')) || file.includes(join('tests'))) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<Image\b([\s\S]{0,400}?)\/>/g)) {
        const block = match[1];
        if (/\bfill\b/.test(block) && !/\bsizes=/.test(block)) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${file.replace(root, '')}:${line}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
