export const desktopQueryRoot = ['desktop'] as const;

export const createDesktopQueryKey = <const T extends readonly unknown[]>(
  scope: string,
  ...parts: T
) => [...desktopQueryRoot, scope, ...parts] as const;
