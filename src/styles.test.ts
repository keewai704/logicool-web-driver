/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

describe('styles', () => {
  it('uses a navy accent color token', () => {
    expect(styles).toContain('--color-accent: #1e3a8a;');
  });

  it('defines a dark theme from the system color scheme', () => {
    expect(styles).toContain('@media (prefers-color-scheme: dark)');
    expect(styles).toContain('color-scheme: dark;');
  });
});
