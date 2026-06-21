export function resolveBasePath(repository: string | undefined): string {
  if (!repository) {
    return '/';
  }

  const repoName = repository.split('/').at(-1);
  if (!repoName || repoName.endsWith('.github.io')) {
    return '/';
  }

  return `/${repoName}/`;
}
