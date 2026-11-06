import { shallowRef } from "vue";

export function awaitLast<T, A extends Array<T>, R>(
  input: (...args: A) => MaybePromise<R>,
  options?: Partial<{
    onComplete: (x: R) => void;
    initial: R;
    immediate: boolean;
  }>,
) {
  const pending = shallowRef(false);
  const last = shallowRef(options?.initial!);
  const onComplete = options?.onComplete;
  let lastPromise;

  async function next(...args: A) {
    pending.value = true;
    const promise = (lastPromise = input(...args));
    let result;
    try {
      result = await lastPromise;
    } finally {
      if (promise !== lastPromise) return;
      pending.value = false;
    }
    last.value = result;
    onComplete?.(result);
  }

  // @ts-expect-error `immediate` is only correct when input() has no parameter.
  if (options?.immediate) next();

  return { pending, last, next };
}
