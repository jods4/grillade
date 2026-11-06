import type { Data } from ".";
import type { Column } from "./column";
import type { State } from "../state";
import { h } from "vue";

export default function render<T extends Data>(
  props: { column: Column<T>; state: State<T> },
  { emit }: { emit(event: "autoSize"): void },
) {
  const { column, state } = props;
  return h(
    "b",
    column.resizable === false
      ? { class: "dg-separator" }
      : {
          class: "dg-resizer",

          onClick(event: Event) {
            event.stopPropagation();
          },

          onDblclick(event: MouseEvent) {
            column.resized = false;
            emit("autoSize");
            state.saveColumnWidth(column);
          },

          onPointerdown(event: PointerEvent & { target: HTMLElement }) {
            if (event.button !== 0) return;
            event.stopPropagation();
            const { target, x, pointerId } = event;
            const baseWidth = column.width;
            const moveHandler = (event: PointerEvent) => (column.width = Math.max(baseWidth + event.x - x, 40));
            target.setPointerCapture(pointerId);
            target.addEventListener("pointermove", moveHandler);
            target.addEventListener(
              "pointerup",
              () => {
                target.removeEventListener("pointermove", moveHandler);
                if (baseWidth !== column.width) {
                  column.resized = true;
                  state.saveColumnWidth(column);
                }
              },
              { once: true },
            );
          },
        },
  );
}

render.props = {
  column: Object,
  state: Object,
};

render.emits = ["autoSize"];
