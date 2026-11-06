import { h } from "vue";

import type { Column, Data } from "../columns";
import type { SortColumn } from "./sort-column";

export default function render<T extends Data>(props: { sort?: SortColumn<T>[]; column?: Column<T> }) {
  const { sort, column } = props as Required<typeof props>;
  // We always render a sorting icon and number, even when the column is unsorted,
  // so that we can account for the icon width when auto-sizing the column.
  const i = sort.findIndex(x => x.column === column) + 1;
  const asc = i === 0 ? 1 : sort[i - 1].asc;
  const icon = h("span", {
    class: asc > 0 ? "dg-sort-icon-up" : "dg-sort-icon-down",
  });
  return h("span", { style: { visibility: i === 0 ? "hidden" : null } }, [
    icon,
    h(
      "span",
      {
        class: "dg-sort-count",
        style: { visibility: sort.length <= 1 ? "hidden" : null },
      },
      i,
    ),
  ]);
}

render.props = {
  sort: Array,
  column: Object,
};
