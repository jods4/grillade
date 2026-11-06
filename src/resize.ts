import { ObjectDirective } from "vue";

type ElementResize = HTMLElement & {
  $resize?: ResizeObserver;
};

export const ResizeDirective = <ObjectDirective<HTMLElement, any>>{
  beforeMount(el: ElementResize, binding) {
    const size = binding.value as { width: number; height: number };
    const observer = (el.$resize = new ResizeObserver(entries => {
      for (const entry of entries) ({ blockSize: size.height, inlineSize: size.width } = entry.contentBoxSize[0]);
    }));
    observer.observe(el);
  },

  unmounted(el: ElementResize) {
    // Just for extra safety.
    // Chrome (91) collects ResizeObservers if there's no reference to their target
    // but this isn't clearly spelled out in the specs.
    const observer = el.$resize as ResizeObserver;
    observer.disconnect();
  },
};
