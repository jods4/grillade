import type {} from "vue";

declare global {
  type MaybePromise<T> = T | Promise<T>;

  namespace CSS {
    // FIXME: Remove once TS ships Houdini definitions
    const paintWorklet: {
      addModule(url: string): void;
    };
  }

  // FIXME: Remove once TS ships Houdini definitions
  function registerPaint(name: string, worklet: Function): void;
}