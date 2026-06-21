import { describe, expect, it } from 'vitest';
import { resolveBasePath } from './pagesBase';

describe('resolveBasePath', () => {
  it('uses root base when no GitHub repository is provided', () => {
    expect(resolveBasePath(undefined)).toBe('/');
  });

  it('uses the repository name for project GitHub Pages', () => {
    expect(resolveBasePath('keewai/logicool-web-driver')).toBe('/logicool-web-driver/');
  });

  it('uses root base for user or organization Pages repositories', () => {
    expect(resolveBasePath('keewai/keewai.github.io')).toBe('/');
  });
});
