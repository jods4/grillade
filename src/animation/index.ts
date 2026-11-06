import { moveX } from "./animations";
import type { Column, Data } from "../columns";
import type { State } from "../state";
import { toRaw, watchEffect } from "vue";
import { pauseTracking, reactiveReadArray, resetTracking } from "@vue/reactivity";

export { AnimBody } from "./body";
export { AnimColumn } from "./column";

export function useAnimations<T extends Data>(columns: Column<T>[], state: State<T>) {
  // Update columns offsets whenever widths change (resize, autosize)
  watchEffect(() => {
    let offset = 0,
      sticky = 0;
    // toRaw so that we don't take dependency on column order,
    // as this is animated by the second watchEffect below
    for (const c of toRaw(columns)) {
      c.offsetX = offset;
      c.stickyX = sticky;
      if (!c.hidden) {
        offset += c.width;
        sticky += c.sticky ? c.width : 0;
      }
    }
  });

  // Compute columns offset from left
  watchEffect(() => {
    // take dependency on column order
    const rawCols = reactiveReadArray(columns);

    // don't take dependency on column widths:
    // we only want to animate if columns are reordered or shown/hidden, not when resizing.
    pauseTracking();
    let offset = 0,
      sticky = 0;
    for (const c of rawCols) {
      const old = c.offsetX;
      c.offsetX = offset;
      c.stickyX = sticky;
      if (c.hidden) continue;
      offset += c.width;
      sticky += c.sticky ? c.width : 0;

      // create animation if column moved
      // TODO: dragging stuck columns is a bit off because the delta is computed from offsetX,
      // when their real position is at stickyX. Fixing this would require knowning whether the column is stuck or not...
      if (old !== undefined) {
        let delta = old - c.offsetX;
        if (Math.abs(delta) > 3) {
          const anim = c.animationX;
          if (anim?.playState === "running") {
            const progress = anim.effect!.getComputedTiming().progress!;
            delta += (1 - progress) * c.deltaX!;
          }

          const effect = moveX(delta);
          c.deltaX = delta;
          c.animate = el => (c.animationX = el.animate(...effect));
        }
      }
    }
    resetTracking();
  });

  // Note that it's possible to skip pointerup events in some edge cases (at least happens in Chromium 82).
  // Examples include stressing the thing like a madman (not sure what triggers the bug then)
  // or judicious use of Alt-Tab when dragging.
  return function headerPointerDown({ currentTarget, x: x0, button }: PointerEvent, column: Column<T>) {
    if (button !== 0) return;
    // The "filling" column on the right is not re-orderable,
    // Nor are the expand/collapse icons in tree-grid mode.
    if (column.reorderable === false) return;

    let i = columns.indexOf(column);
    // We missed a pointerup but nevermind, the old listeners are still in place
    if (column.dragged) return;

    function thresholds() {
      // Find first visible column before/after i
      let prev = i - 1,
        next = i + 1;
      while (prev >= 0 && columns[prev].hidden) --prev;
      while (next < columns.length && columns[next].hidden) ++next;

      return [
        prev >= 0 ? -columns[prev].width / 2 : -Infinity,
        prev,
        next < columns.length ? columns[next].width / 2 : Infinity,
        next,
      ];
    }

    let [left, prevIndex, right, nextIndex] = thresholds();
    let translateX: CSSUnitValue;
    let transform: CSSTransformValue;
    const th = currentTarget as HTMLTableCellElement;

    const listeners = {
      handleEvent(e: PointerEvent) {
        switch (e.type) {
          case "click":
            e.stopImmediatePropagation();
            break;
          case "pointermove":
            this.move(e);
            break;
          case "pointerup":
            if (e.button === 0) this.up();
            break;
        }
      },

      move({ x, buttons }: PointerEvent) {
        let delta = x - x0;

        // start dragging after a significant amount of movement
        if (!column.dragged) {
          if (Math.abs(delta) < 4) return;
          column.dragged = true;
          window.addEventListener("click", this, { once: true, capture: true });
          transform = new CSSTransformValue([new CSSTranslate((translateX = CSS.px(0)), CSS.px(0))]);
        } else if ((buttons & 1) === 0) {
          // button was released without us noticing. This is bad :(
          this.up();
          return;
        }

        // swap columns if required
        if (delta < left) {
          const other = columns[prevIndex];
          // Don't swap with the first "tree expand" column
          if (other.reorderable !== false) {
            [columns[prevIndex], columns[i]] = [columns[i], columns[prevIndex]];
            i = prevIndex;
            x0 -= other.width;
            delta = x - x0;
            [left, prevIndex, right, nextIndex] = thresholds();
          }
        } else if (delta > right) {
          const other = columns[nextIndex];
          // Don't swap with the last "filling" columns
          if (other.reorderable !== false) {
            [columns[i], columns[nextIndex]] = [columns[nextIndex], columns[i]];
            i = nextIndex;
            x0 += other.width;
            delta = x - x0;
            [left, prevIndex, right, nextIndex] = thresholds();
          }
        }

        translateX.value = delta;
        th.attributeStyleMap.set("transform", transform);
      },

      up() {
        ["pointermove", "pointerup"].forEach(name => window.removeEventListener(name, this, true));
        if (!column.dragged) return;
        column.dragged = false;
        th.attributeStyleMap.delete("transform");
        setTimeout(() => window.removeEventListener("click", this, true), 0);
        state.saveColumnsOrder(columns);
      },
    };

    ["pointermove", "pointerup"].forEach(name => window.addEventListener(name, listeners, true));
  };
}
