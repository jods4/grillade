import type { Column, Data } from "./columns";
import type { DataGroup } from "./grouping";
import { computed, Ref, h, watch } from "vue";

export function addSelection<T extends Data>(
  columns: Column<T>[],
  fetchedData: Ref<T[]>,
  data: Ref<T[]>,
  props: {
    disabled?: boolean;
    groupBy?: keyof T;
    selected?: Set<T>;
    selectable?: (row: T) => boolean;
  },
  allGroups: () => DataGroup<T>[] | undefined,
) {
  // We assume the selected | selectable props can't be modified
  const { selected, selectable } = props;
  if (!selected) return {};

  // Stores the last clicked item to enable range selection (with shift-click)
  let lastSelectedItem: T | null = null;

  // Total number of items that are selectable (if there's a selectable filter),
  // used to drive the "select all" checkbox / action.
  const selectableCount = computed(() =>
    selectable ? data.value.reduce((count, item) => (selectable(item) ? count + 1 : count), 0) : data.value.length,
  );

  const allSelected = computed({
    get() {
      return selected.size === 0 ? false : selected.size === selectableCount.value ? true : null;
    },
    set(value: boolean | null) {
      if (value) {
        if (!selectable) data.value.forEach(selected.add, selected);
        else data.value.forEach(item => selectable(item) && selected.add(item));
      } else selected.clear();

      allGroups()?.forEach(x => (x.selected = value));
    },
  });

  columns.unshift({
    key: "select",
    resizable: false,
    sortable: false,
    searchable: false,
    filterable: false,
    sticky: true,
    width: 0,
    css: (_, data) => (!props.disabled && selectable?.(data) !== false ? "dg-select" : undefined),
    header: () =>
      h("input", {
        type: "checkbox",
        get key() {
          return "" + props.disabled;
        },
        checked: !props.disabled && allSelected.value,
        indeterminate: !props.disabled && allSelected.value === null,
        class: "dg-checkbox",
        disabled: !!props.disabled,
        onClick(e: Event) {
          allSelected.value = (e.target as HTMLInputElement).checked;
        },
      }),
    render: (childProps: any) =>
      selectable?.(childProps.data) !== false
        ? h("input", {
            type: "checkbox",
            get key() {
              return "" + props.disabled;
            },
            checked: selected.has(childProps.data),
            class: "dg-checkbox",
            disabled: !!props.disabled,
          })
        : null,
  });

  watch([fetchedData, data], ([fetched, data], [prevFetched]) => {
    // When the displayed data changes, we want to adjust selection to avoid having invisible items selected.
    lastSelectedItem = null;
    // When data is refreshed from server, items references have change but we keep the selection based on 'id' field.
    if (fetched !== prevFetched) {
      const ids = new Set(Array.from(selected, (x: any) => x.id));
      selected.clear();
      for (const x of fetched) if (ids.has(x.id)) selected.add(x);
    }
    // Otherwise, when local data stays the same we just narrow down the selection.
    // If there's no filtering going on, we can skip this step.
    else if (data.length !== fetched.length) {
      const available = new Set(data);
      for (const x of selected) if (!available.has(x)) selected.delete(x);
    }
  });

  return {
    select(item: T) {
      if (!!props.disabled) return;
      if (selectable?.(item) === false) return;
      lastSelectedItem = item;
      if (!selected!.delete(item)) selected!.add(item);
      if (props.groupBy) {
        const key = item[props.groupBy];
        allGroups()
          ?.find(x => x.groupKey === key)
          ?.updateSelected(selected);
      }
    },

    selectAll(select: boolean) {
      if (!!props.disabled) return;
      allSelected.value = select;
    },

    selectRange(item: T) {
      if (!!props.disabled) return;
      if (!lastSelectedItem) return;
      if (selectable?.(item) === false) return;

      const items = data.value;
      let endIndex = items.indexOf(item);
      if (endIndex < 0) return;
      let startIndex = items.indexOf(lastSelectedItem);
      if (startIndex < 0) return;

      if (startIndex > endIndex) [startIndex, endIndex] = [endIndex, startIndex];

      const toggle = selected.has(item) ? (x: T) => selected.delete(x) : (x: T) => selected.add(x);

      const groups = allGroups();
      const dirtyGroups = new Set<any>();
      for (let i = startIndex; i <= endIndex; i++) {
        const item = items[i];
        if (selectable?.(item) === false) continue;
        toggle(item);
        if (groups) dirtyGroups.add(item[props.groupBy!]);
      }

      if (groups) {
        for (const g of groups) {
          if (dirtyGroups.has(g.groupKey)) g.updateSelected(selected);
        }
      }

      lastSelectedItem = item;
    },

    selectGroup(group: DataGroup<T>, value: boolean) {
      group.selected = value;
      const toggle = value ? (x: T) => selected.add(x) : (x: T) => selected.delete(x);
      const items = data.value;
      const lastIndex = group.firstRowIndex + group.count;
      for (let i = group.firstRowIndex; i < lastIndex; ++i) {
        const item = items[i];
        if (props.selectable?.(item) !== false) toggle(item);
      }
    },
  };
}
