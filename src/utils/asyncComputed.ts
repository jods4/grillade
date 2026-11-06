import { awaitLast } from "./awaitLast";
import { type Ref, watchEffect } from "vue";

export function asyncComputed<T>(f: () => MaybePromise<T>): {
  current: Ref<T | undefined>;
  pending: Ref<boolean>;
  stop(): void;
};

export function asyncComputed<T>(
  f: () => MaybePromise<T>,
  initial: T,
  onChange?: (newValue: T) => void,
): { current: Ref<T>; pending: Ref<boolean>; stop(): void };

export function asyncComputed<T>(f: () => MaybePromise<T>, initial?: T, onChange?: (newValue: T) => void) {
  const { next, last, pending } = awaitLast(f, {
    initial,
    onComplete: onChange,
  });
  const stop = watchEffect(<() => void>next, { flush: "post" });

  return {
    current: last,
    pending,
    stop,
  };
}
