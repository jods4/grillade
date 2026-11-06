import type { Data } from ".";
import type { Style } from "documonster/excel";
import type { ComponentOptions, FunctionalComponent, StyleValue } from "vue";

export type ColumnFormatter<V, T> = (props: { data: T; value: V }) => any;

export interface ColumnExtensions<V> {}

export type ColumnDefinition<TItem extends Data> = {
  [K in keyof TItem]: {
    label?: string;
    data?: K;
    data2?: keyof TItem;
    emptyText?: string;
    css?: string | ((value: TItem[K], data: TItem) => string | null | undefined);
    style?: (value: TItem[K], data: TItem) => StyleValue;
    sticky?: boolean;
    header?: FunctionalComponent;
    render?: ComponentOptions | ColumnFormatter<TItem[K], TItem>;
    resizable?: boolean;
    reorderable?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    filterOptions?: TItem[K] extends string | null
      ? "startswith" | "contains" | "salary.fulltext"
      : TItem[K] extends number | null
        ? "equals" | "range"
        : undefined;
    searchable?: boolean;
    exportable?: boolean;
    exportFormat?: string;
    exportStyle?: Partial<Style> | ((data: TItem[K], item: TItem) => Partial<Style> | undefined);
    exportValue?: (data: TItem[K], col: ColumnDefinition<TItem>, item: TItem) => any;
    sort?: number; // Initial sort order, 1-based. Negative numbers = desc.
    nullsFirst?: boolean; // Only works locally
    hidden?: boolean;
  } & ColumnExtensions<TItem[K]>;
}[keyof TItem];

export type Column<T extends Data> = ColumnDefinition<T> & {
  key: string;
  width: number;
  offsetX?: number;
  stickyX?: number;
  animationX?: Animation;
  deltaX?: number;
  animate?(el: HTMLElement): void;
  dragged?: boolean;
  resized?: boolean;
};

export function makeColspan<T extends Data>(columns: Column<T>[], start: number, length: number) {
  let colspan = 0;
  // -1 = unset, -2 = not sticky, >= 0 left position
  let sticky = -1;
  const end = start + length;
  for (let i = start; i < end; ++i) {
    const col = columns[i];
    if (col.hidden) continue;
    ++colspan;
    if (sticky === -1) {
      sticky = col.sticky ? col.stickyX! : -2;
    }
  }
  return colspan === 0
    ? { style: { display: "none" } }
    : { colspan, ...(sticky >= 0 ? { class: "dg-sticky", style: { left: sticky + "px" } } : {}) };
}
