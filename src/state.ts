import { toRaw } from "vue";

import type { Column, Data } from "./columns";
import { options } from "./options";
import type { SortColumn } from "./sort";

class ColumnState {
  // Note that keys are based on original indexes in grid definition, e.g. key: 'user-3'.
  // This is ok as for now we only persist state in memory, for the lifetime of browser tab.
  // If we were to persist state long-term, across app reloads, we need to account for the
  // possibility that a new app version could add/remove columns to grids.
  // This is not trivial as columns don't have unique keys (closest is `data`, but some columns
  // can have undefined or duplicate values).
  key: string;
  width: number; // >0 when resized by user
  asc: number; // sort direction (if currently sorted): 1 = asc, -1 = desc

  constructor(key: string) {
    this.key = key;
    this.width = this.asc = 0;
  }
}

const store = new Map<string, State<any>>();
let historyId = 0;

export class State<T extends Data> {
  restored = false;
  columns: ColumnState[];
  sort?: string[];
  skip: number;
  expanded?: Map<number | string, boolean>; // for tree
  // Bag for external controls wanting to persist state with grid (e.g. grid filters)
  [name: string]: any;

  constructor(columns: Column<T>[]) {
    this.columns = columns.map(c => new ColumnState(c.key));
    this.skip = 0;
  }

  static create<T extends Data>(
    columns: Column<T>[],
    stateful: string | boolean,
    statefulStore: "history" | undefined,
  ) {
    // No persistence
    if (!stateful) return new State<T>(columns);

    let stateKey: string | undefined;
    let state: State<T> = null!;

    // "history" is a special mode: grid state is persisted into browser history state, so that it's restored when going back,
    // yet doesn't impact normal navigation, and always refreshes when using a link again.
    // This is typically used when loading templates or navigating to a grid with query-based filters.
    if (statefulStore === "history") {
      // We only store a string key in history, because history state must be serialisable.
      // Real state is actually saved in global store under a unique key.
      stateKey = history.state.dataGridStateKey as string;
      if (!stateKey || !store.has(stateKey)) {
        stateKey = "$history-" + ++historyId;
        history.state.dataGridStateKey = stateKey;
      }
    }

    // App-wide, global state
    stateKey ??= typeof stateful === "string" ? stateful : options.stateKey();
    if (!stateKey) return new State<T>(columns);

    state = store.get(stateKey) as State<T>;
    if (state) {
      state.restored = true;
      state.loadColumns(columns);
    } else {
      state = new State<T>(columns);
      store.set(stateKey, state);
    }

    return state;
  }

  saveColumnsOrder(columns: Column<T>[]) {
    const source = toRaw(columns);
    const state = this.columns;

    let i;
    for (i = 0; i < source.length; ++i) {
      const { key } = source[i];

      if (i >= state.length) {
        state.push(new ColumnState(key));
        continue;
      }

      if (key === state[i].key) continue;

      const j = findKey(key, state, i);
      if (j > 0) [state[i], state[j]] = [state[j], state[i]];
      else state.splice(i, 0, new ColumnState(key));
    }

    // Remove excess columns (there should be none)
    if (i < state.length) state.length = i;
  }

  saveColumnWidth(column: Column<T>) {
    const { key } = column;
    const state = this.columns.find(c => c.key === key);
    if (state) state.width = column.resized ? column.width : 0;
  }

  loadColumns(columns: Column<T>[]) {
    const state = this.columns;
    let j = 0;
    for (let i = 0; i < state.length; ++i) {
      if (j >= columns.length) break;
      const { key, width } = state[i];
      if (key !== columns[j].key) {
        const k = findKey(key, columns, j);
        if (k < 0) continue;
        [columns[j], columns[k]] = [columns[k], columns[j]];
      }
      const col = columns[j++];
      if (width > 0) {
        col.width = width;
        col.resized = true;
      }
    }
  }

  saveSort(sort: SortColumn<T>[]) {
    this.sort = new Array(sort.length);
    let i = 0;
    for (const {
      column: { key },
      asc,
    } of sort) {
      this.sort[i++] = key;
      const column = this.columns.find(x => x.key === key);
      if (column) column.asc = asc;
    }
  }

  loadSort(columns: Column<T>[]) {
    if (!this.sort) return;
    const result = [];
    for (const key of this.sort) {
      const column = columns.find(x => x.key === key);
      if (!column) continue;
      const state = this.columns.find(x => x.key === key);
      if (!state) continue;
      result.push({ column, asc: state.asc });
    }
    return result;
  }
}

function findKey<T extends Data>(key: string, array: Column<T>[], after: number) {
  for (let i = after + 1; i < array.length; ++i) if (array[i].key === key) return i;
  return -1;
}
