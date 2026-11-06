import { shallowReadArray } from "@vue/reactivity";
import { computed, type ComputedRef, type Ref, shallowReactive } from "vue";

import type { Column, Data } from "../columns";
import type { State } from "../state";
import type { SortColumn, SortDescriptor } from "./sort-column";

export { default as SortIndicator } from "./sort-indicator";
export type { SortColumn, SortDescriptor };

function defaultSort<T extends Data>(columns: Column<T>[]): SortColumn<T>[] {
  return columns
    .filter(c => c.sort != null)
    .map(column => ({
      column,
      asc: column.sort!,
      order: Math.abs(column.sort!),
    }))
    .sort((a, b) => a.order - b.order);
}

export function useSorting<T extends Data>(columns: Column<T>[], state: State<T>) {
  const sort = shallowReactive(state.loadSort(columns) ?? defaultSort(columns));

  return {
    sort,

    sortOn(column: Column<T>, multi: boolean) {
      if (column.sortable === false) return;

      const i = sort.findIndex(x => x.column === column);
      const asc = i >= 0 ? sort[i].asc : 0;
      // Remove column from sort order, we'll append it back at the end
      if (!multi) sort.length = 0;
      else if (asc !== 0) sort.splice(i, 1);
      // Append sort, in multi-sort do a 3-cycle: if sort is currently desc remove it
      if (!multi || asc >= 0) sort.push({ column, asc: asc <= 0 ? 1 : -1 });

      state.saveSort(sort);
    },
  };
}

const collator = new Intl.Collator();

function compare(a: any, b: any, nullsFirst = false) {
  // nulls/undefined go last. Note that they mess up sorting against non-number as both null < 'x' and null > 'x' are false
  if (a == null) return b == null ? 0 : nullsFirst ? -1 : 1;
  if (b == null) return nullsFirst ? 1 : -1;

  // Use Intl.Collator for strings, so that sort is case-insensitive
  if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);

  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return Temporal.PlainDate.compare(a, b);
  if (a instanceof Temporal.Instant && b instanceof Temporal.Instant) return Temporal.Instant.compare(a, b);

  // Regular comparison
  return a > b ? 1 : a < b ? -1 : 0;
}

// This comparer handles nulls, undefined, Temporal.{PlainDate|Instant},
// and anything that implements valueOf() properly.
// Notably this includes string, number, built-in Date and various date libs (Luxon, day.js)
export function buildComparer<T extends Data>(preSort: SortDescriptor<T>, reactiveSort: SortColumn<T>[]) {
  const sort = shallowReadArray(reactiveSort);
  if (sort.length === 0 && preSort.length === 0) return null;

  return (a: T, b: T) => {
    for (const [field, asc] of preSort) {
      const da = a[field],
        db = b[field];
      const result = compare(da, db);
      if (result !== 0) return asc === "desc" ? -result : result;
    }

    for (const { asc, column } of sort) {
      const d = column.data!;
      const da = a[d],
        db = b[d];
      const result = compare(da, db, !!column.nullsFirst);
      if (result !== 0) return asc < 0 ? -result : result;
    }
    return 0;
  };
}

export function localSort<T extends { id: string | number }>(
  data: Ref<T[]>,
  preSort: ComputedRef<SortDescriptor<T>>,
  sort: SortColumn<T>[],
) {
  return computed(() => {
    const comparer = buildComparer(preSort.value, sort);
    return comparer ? data.value.toSorted(comparer) : data.value;
  });
}
