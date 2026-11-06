import { Comment, defineComponent, Fragment, onUpdated, renderSlot, VNode, watch } from "vue";

import { fade, moveY } from "./animations";

// Flatten fragments in VDOM
function* iterateRows(nodes: VNode<HTMLElement> | VNode<HTMLElement>[]): Iterable<VNode<HTMLElement>> {
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      if (n.type === Fragment) yield* iterateRows(n.children as VNode<HTMLElement>[]);
      else if (n.type !== Comment) yield n;
    }
  } else if (nodes.type === Fragment) yield* iterateRows(nodes.children as VNode<HTMLElement>[]);
  else if (nodes.type !== Comment) yield nodes;
}

function mapRowOffsets(nodes: VNode<HTMLElement>[]) {
  const map = new Map();
  for (const n of iterateRows(nodes)) map.set(n.key, n.el!.offsetTop);
  return map;
}

export const AnimBody = defineComponent({
  props: {
    data: Array,
  },

  setup(props, { slots }) {
    let children: VNode<HTMLElement>[];
    let oldYMap = null as Map<VNode["key"], number> | null;

    // Only animate when data changes (e.g. sort), not on virtual scroll
    watch(
      // Watch when array instance changes (props.data) or reactive array is mutated (props.data.length)
      [() => props.data, () => props.data?.length],
      () => (oldYMap = mapRowOffsets(children)),
      { flush: "sync" },
    );

    onUpdated(() => {
      if (!oldYMap) return;

      const newYMap = mapRowOffsets(children);
      const fades = [] as HTMLElement[];
      const moves = [] as { el: HTMLElement; y0: number; dist: number }[];

      // Compute changes
      for (const child of iterateRows(children)) {
        const { key, el } = child;

        const y0 = oldYMap.get(key);
        if (y0 === undefined) {
          fades.push(el!);
          continue;
        }

        const y1 = newYMap.get(key)!;
        const dist = y0 - y1;
        if (Math.abs(dist) > 2) moves.push({ el: el!, y0, dist });
      }
      oldYMap = null;

      // Perform animations
      let delay = 0;
      moves.sort((a, b) => a.y0 - b.y0); // top-down animation looks nicer
      for (const m of moves) {
        moveY(m.el, m.dist, delay);
        delay += 10;
      }
      if (moves.length) delay += 350;
      for (const row of fades) {
        fade(row, delay);
        delay += 10;
      }
    });

    return () => (children = renderSlot(slots, "default") as any as VNode<HTMLElement>[]);
  },
});
