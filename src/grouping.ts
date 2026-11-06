import type { Data } from "./columns";
import type { VirtualState } from "./virtual/state";
import { markRaw, type Ref, shallowRef } from "vue";

export class DataGroup<T extends Data> {
  allRows: T[];
  groupKey: unknown;
  firstRowIndex: number;
  count = 1;
  selectable = 0;
  startOffset = 0; // in pixels, offset from top of list
  height = 0; // Note: for now we assume constant height for group headers
  private _selected?: Ref<boolean | null>; // when datagrid uses selection

  get selected(): boolean | null {
    this._selected ??= shallowRef(false);
    return this._selected.value;
  }

  set selected(value: boolean | null) {
    this._selected ??= shallowRef(false);
    this._selected.value = value;
  }

  constructor(key: unknown, rows: T[], index: number) {
    this.allRows = rows;
    this.groupKey = key;
    this.firstRowIndex = index;
  }

  updateSelected(selected: Set<T>) {
    let count = 0;
    const lastIndex = this.firstRowIndex + this.count;
    for (let i = this.firstRowIndex; i < lastIndex; ++i) {
      const item = this.allRows[i];
      if (selected.has(item)) ++count;
    }
    this.selected = count === this.selectable ? true : count > 0 ? null : false;
  }
}

export function groupRows<T extends Data>(
  props: { groupBy?: keyof T; selected?: Set<T>; selectable?: (row: T) => boolean },
  rows: T[],
): DataGroup<T>[] {
  const by = props.groupBy!;
  const { selected, selectable } = props;
  const groups = [];

  // It is assumed that data was sorted by group key first.
  let group,
    groupKey,
    selectableCount = 0;
  for (let i = 0; i < rows.length; ++i) {
    const rowKey = rows[i][by];
    if (rowKey !== groupKey) {
      // New group: first count how many rows where in previous group
      if (group) {
        group.count = i - group.firstRowIndex;
        group.selectable = selectableCount;
        if (selected) group.updateSelected(selected);
      }
      // Then create the new group
      groupKey = rowKey;
      group = new DataGroup(groupKey, rows, i);
      groups.push(group);
      selectableCount = 0;
    }

    if (selected && selectable?.(rows[i]) !== false) {
      ++selectableCount;
    }
  }

  // Count rows of the last group
  if (group) {
    group.count = rows.length - group.firstRowIndex;
    group.selectable = selectableCount;
    if (selected) group.updateSelected(selected);
  }

  // We assume data is not mutated in a way that would change grouping
  return markRaw(groups);
}

export function updateGroupOffsets({ allGroups, rowHeight, groupHeight }: VirtualState<any>) {
  if (!allGroups) return;
  let offset = 0;
  for (let g of allGroups) {
    g.startOffset = offset;
    g.height = groupHeight;
    offset += groupHeight + rowHeight * g.count;
  }
}
