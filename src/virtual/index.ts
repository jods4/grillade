import type { Column, Data } from "../columns";
import { type DataGroup, groupRows, updateGroupOffsets } from "../grouping";
import { injectKey, type VirtualState } from "./state";
import { computed, queuePostFlushCb, type MaybeRef, provide, reactive, unref, watch, watchEffect, markRaw } from "vue";

export { default as VirtualScroller } from "./scroller.vue";

const done = { value: undefined, done: true as const };

// An efficient, restartable iterator for array ranges, pratically allocation-free
// As it recycles its objects, don't hold on to them longer than one iteration step!
function rangeIterable<T>(array: T[], skip: number, take: number): IterableIterator<T> {
  // Note: this is already stripped out by Vite when building the lib,
  // it's not applied when running a dependent app, even in DEV mode.
  if (import.meta.env.DEV) {
    if (take > 0 && array.length < skip + take) throw new Error("Out of bounds array range");
  }

  const result = {
    array,
    skip,
    i: 0,
    len: skip + take,
    nextValue: { value: null as any, done: false as const },

    [Symbol.iterator]() {
      this.i = this.skip;
      return this;
    },

    next() {
      if (this.i < this.len) {
        this.nextValue.value = this.array[this.i++];
        return this.nextValue;
      }
      return done;
    },
  };

  // separate return to please TS
  return result;
}

export function useVirtual<T extends Data>(
  data: MaybeRef<T[]>,
  size: { height: number },
  columns: Column<T>[],
  props: {
    dynamicRowHeight: boolean;
    groupBy?: keyof T;
  },
) {
  const { dynamicRowHeight } = props;

  const state: VirtualState<T> = reactive({
    scroller: <any>null!, // initialized on mount // FIXME: TS error if declared as Element?
    scrollTop: 0,
    // 25px is default for relatively dense grids, but is automatically updated when data is bound.
    // It's also used as an estimate for dynamic row heights until they're measured, so it's important
    // that it's smaller than actual height. If it's larger than the average height, it's possible that
    // we don't materialize enough rows and there's a blank at the bottom of grid, where there should be rows.
    rowHeight: 25,
    // Likewise for group rows
    groupHeight: 25,
    buffer: 4,

    // Those are explicitely put in reactive state and updated with a watchEffect,
    // which is basically triggered on scroll.
    // Computing those 2 values is a relatively cheap operation.
    index: 0,
    count: 0,

    // Other properties that in turn update the DOM, sometimes expensively (such as items) are computed based on index and count.
    // As long as materialized index or count don't change, we don't update DOM and that keeps scrolling relatively efficient.
    topGap: 0,
    bottomGap: 0,

    allGroups: undefined,
    groupFirstRow: 0,
    groupLastRow: 0,
    groups: computed(() => {
      const { index, count, allGroups, groupFirstRow, groupLastRow } = state;
      const items = unref(data);

      if (allGroups) {
        return Iterator.from(rangeIterable(allGroups, index, count))
          .map(g => {
            const firstRow = Math.max(groupFirstRow, g.firstRowIndex);
            const lastRow = Math.min(groupLastRow, g.firstRowIndex + g.count - 1);
            const count = lastRow - firstRow + 1;
            return {
              key: g.groupKey,
              group: g,
              firstRow: items[g.firstRowIndex],
              items: rangeIterable(items, firstRow, count),
              // if an even number of rows is created, an extra <tr> is required
              // to ensure the next group always starts at an even position
              even: (count & 1) === 0,
            };
          })
          .toArray();
      }

      // Return one empty group when there's no grouping in grid.
      // It simplifies the rendering template
      return [
        {
          items: rangeIterable(items, index, count),
        },
      ];
    }),

    // For dynaminc row height only, keep track of each item size.
    // It's assumed that row heights do not change after being measured,
    // until either new data is loaded or column widths are modified.
    // Note 1: that this limitation forbids dynamically modified, wrapping content when using dynamic row height.
    // Note 2: we use a sub-object marked raw for Vue reactivity, so that the arrays themselves are not proxified
    //         and remain lightweight and fast. Assigning a new `dynamic` object triggers reactivity.
    //         `state` itself is not shallow for the convenience of auto unwrapping refs.
    dynamic: undefined,
  });

  // Technically, size.height is slighty too high because it's the height of the full table,
  // including thead, rather than just tbody.
  // That's not an issue though, it just means one or two extra rows will be rendered past the bottom.
  // TODO: we should a bit larger buffers and allow some scrolling before actually materializing new rows, that would be faster
  if (dynamicRowHeight) {
    watchEffect(() => {
      const { buffer, scrollTop, dynamic, allGroups } = state;

      if (!dynamic?.offsets.length) {
        state.count = state.index = 0;
        return;
      }

      if (allGroups) {
        // TODO: this is quasi duplicated code with static rows group handling, only the bottom offset calculation changes
        // TODO: buffer could be expressed in px instead of items to work better with groups
        const start = (state.index = Math.max(0, bisectGroups(allGroups, scrollTop) - 1));
        if (start >= allGroups.length) {
          state.count = state.topGap = state.bottomGap = 0;
          return;
        }
        let group = allGroups[start];
        let groupFirst = group.firstRowIndex;
        let rowIndex = Math.max(
          groupFirst,
          bisect(dynamic.offsets, scrollTop, groupFirst, groupFirst + group.count) - buffer,
        );
        // Preserve parity by taking one extra row if necessary
        rowIndex = (rowIndex & ~1) + (groupFirst & 1);
        state.groupFirstRow = rowIndex;
        state.topGap = dynamic.offsets[rowIndex] - group.height;

        const bottom = scrollTop + size.height;
        let i = start;
        while (i < allGroups.length && allGroups[i].startOffset <= bottom) ++i;
        state.count = i - start;
        group = allGroups[i - 1]; // last visible group, guaranteed to exist
        groupFirst = group.firstRowIndex;
        const groupLast = groupFirst + group.count - 1;
        state.groupLastRow = rowIndex = Math.min(
          groupLast,
          bisect(dynamic.offsets, bottom, groupFirst, groupLast + 1) + buffer,
        );
        state.bottomGap =
          rowIndex + 1 < dynamic.offsets.length
            ? dynamic.offsets.at(-1)! + dynamic.heights.at(-1)! - dynamic.offsets[rowIndex + 1]
            : 0;
      } else {
        const { offsets } = dynamic;
        // & ~1 always rounds to previous even number, so that parity of :nth-child doesn't change
        const index = (state.index = Math.max(0, bisect(offsets, scrollTop) - buffer) & ~1);
        const lastIndex = Math.min(bisect(offsets, scrollTop + size.height) + buffer, offsets.length - 1);
        state.count = lastIndex - index + 1;
        state.topGap = offsets[index];
        state.bottomGap = offsets.at(-1)! + dynamic.heights.at(-1)! - offsets[lastIndex] - dynamic.heights[lastIndex];
      }

      // Trigger measuring of row heights
      queuePostFlushCb(() => {
        const tbody = state.scroller.querySelector("tbody")!;
        const { heights, measured, measuredGroups, offsets } = state.dynamic!;
        let iGroup = state.index;
        let i = state.allGroups?.[iGroup].firstRowIndex ?? iGroup;
        let dirty = false;
        for (let tr of tbody.rows) {
          if (tr.classList.contains("dg-row")) {
            if (!measured[i]) {
              heights[i] = tr.getBoundingClientRect().height;
              measured[i] = true;
              dirty = true;
            }
            ++i;
            continue;
          }
          if (tr.classList.contains("dg-group")) {
            if (!measuredGroups![iGroup]) {
              state.allGroups![iGroup].height = tr.getBoundingClientRect().height;
              measuredGroups![iGroup] = true;
              dirty = true;
            }
            ++iGroup;
            continue;
          }
        }
        // Note: this is already stripped out by Vite when building the lib,
        // it's not applied when running a dependent app, even in DEV mode.
        if (import.meta.env.DEV) {
          if (!state.allGroups && i !== state.index + state.count)
            console.error("DOM and virtual row count are inconsistent");
        }
        if (dirty)
          state.dynamic = markRaw({
            measured,
            measuredGroups,
            heights,
            offsets: fillOffsets(state.allGroups, heights, offsets),
          });
      });
    });

    // Measure rows again after columns change width, as some the height of some rows could be driven by long wrapping text
    watch(
      () => columns.map(c => c.width),
      () => {
        state.dynamic?.measured.fill(false);
        state.dynamic?.measuredGroups?.fill(false);
      },
    );
  } else {
    watchEffect(() => {
      const { allGroups, buffer, rowHeight, scrollTop } = state;
      const { length } = unref(data);

      if (allGroups) {
        // TODO: buffer could be expressed in px instead of items
        const start = (state.index = Math.max(0, bisectGroups(allGroups, scrollTop) - 1));
        if (start >= allGroups.length) {
          state.count = state.topGap = state.bottomGap = 0;
          return;
        }
        let group = allGroups[start];
        let groupFirst = group.firstRowIndex;
        let rowIndex =
          groupFirst + Math.max(0, (((group.startOffset + group.height - scrollTop) / rowHeight) | 0) - buffer);
        // Preserve parity by taking one extra row if necessary
        rowIndex = (rowIndex & ~1) + (groupFirst & 1);
        state.groupFirstRow = rowIndex;
        state.topGap = group.startOffset + (rowIndex - groupFirst) * rowHeight;

        const bottom = scrollTop + size.height;
        let i = start;
        while (i < allGroups.length && allGroups[i].startOffset <= bottom) ++i;
        state.count = i - start;
        group = allGroups[i - 1]; // last visible group, guaranteed to exist
        groupFirst = group.firstRowIndex;
        state.groupLastRow = rowIndex =
          groupFirst +
          Math.min(group.count - 1, (((bottom - group.startOffset - group.height) / rowHeight) | 0) + buffer);
        state.bottomGap =
          rowIndex + 1 < length
            ? allGroups.at(-1)!.startOffset -
              group.startOffset +
              (allGroups.at(-1)!.count - rowIndex + group.firstRowIndex) * rowHeight
            : 0;
      } else {
        // & ~1 always rounds to previous even number, so that parity of :nth-child doesn't change
        const index = (state.index = Math.max(((scrollTop / rowHeight) | 0) - buffer, 0) & ~1);
        const count = (state.count = Math.min(((size.height / rowHeight) | 0) + 1 + buffer + buffer, length - index));
        state.topGap = index * rowHeight;
        state.bottomGap = (length - index - count) * rowHeight;
      }
    });
  }

  provide(injectKey, state);

  return {
    state,

    scrollToTop() {
      state.scroller.scrollTop = 0;
      // Will be picked up by scroller element onScroll listener,
      // but it takes a tick longer and auto-size runs before that,
      // which may result in too short columns if we're scroll down on narrow data
      // and then the new data at the top is much wider.
      state.scrollTop = 0;
    },

    onDataChanged(table: HTMLTableElement) {
      // Create the groups
      if (props.groupBy) {
        state.allGroups = groupRows(props, unref(data));
        updateGroupOffsets(state);
      }

      if (dynamicRowHeight) {
        // Initialize the row sizes
        const { length } = unref(data);
        const heights = new Array(length).fill(state.rowHeight);
        state.dynamic = markRaw({
          measured: new Array(length).fill(false),
          measuredGroups: state.allGroups && new Array(state.allGroups.length).fill(false),
          heights,
          offsets: fillOffsets(state.allGroups, heights),
        });
      } else {
        // Measure actual row height (assumed constant for all rows)
        queuePostFlushCb(() => {
          let changed = false;

          let height = table.querySelector<HTMLTableRowElement>("tbody .dg-row")?.getBoundingClientRect().height;
          if (height && state.rowHeight !== height) {
            state.rowHeight = height;
            changed = true;
          }

          if (props.groupBy) {
            height = table.querySelector<HTMLTableRowElement>("tbody .dg-group")?.getBoundingClientRect().height;
            if (height && state.groupHeight !== height) {
              state.groupHeight = height;
              changed = true;
            }
            if (changed) updateGroupOffsets(state);
          }
        });
      }
    },
  };
}

function fillOffsets(groups: DataGroup<Data>[] | undefined, heights: number[], offsets?: number[]) {
  const { length } = heights;
  offsets ??= new Array(length);
  if (length === 0) return offsets;

  if (groups) {
    let y = 0;
    let i = 0;
    for (const g of groups) {
      g.startOffset = y;
      y += g.height;
      const len = g.firstRowIndex + g.count;
      for (; i < len; ++i) {
        offsets[i] = y;
        y += heights[i];
      }
    }
  } else {
    for (let i = 0, y = 0; i < length; ++i) {
      offsets[i] = y;
      y += heights[i];
    }
  }
  return offsets;
}

// Finds index of the largest offset <= y
function bisect(offsets: number[], y: number, low = 0, high = offsets.length) {
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] < y) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Same as bisect, for groups :)
function bisectGroups(groups: DataGroup<Data>[], y: number, low = 0, high = groups.length) {
  while (low < high) {
    const mid = (low + high) >> 1;
    if (groups[mid].startOffset < y) low = mid + 1;
    else high = mid;
  }
  return low;
}
