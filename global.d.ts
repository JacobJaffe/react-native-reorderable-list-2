declare var global: typeof globalThis;

declare var requestIdleCallback:
  | ((cb: () => void, options?: {timeout?: number}) => number)
  | undefined;

declare var cancelIdleCallback: ((handle: number) => void) | undefined;
