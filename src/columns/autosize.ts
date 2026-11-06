import { queuePostFlushCb } from "vue";

import type { Data } from ".";
import type { Column } from "./column";

export function autoSize<T extends Data>(table: HTMLTableElement, columns: Column<T>[], hasData: boolean) {
  queuePostFlushCb(() => {
    // Usually everything is ok at this point, but sometimes rows are not materialized yet.
    // A specific case where it happens is when the grid is scrolled down past the length of new data.
    // Browser needs to adjust the scroll position before the VirtualScroller can react and materialize rows.
    // If we're in this situation, we simply postpone the autoSize a bit.
    if (hasData && !table.querySelector(".dg-row")) {
      setTimeout(autoSize, 50, table, columns, hasData);
      return;
    }

    const tHead = table.tHead!.querySelector<HTMLTableRowElement>(".dg-header-main")!;

    // Below we're gonna use getBoundingClientRect(), which includes any CSS transform.
    // We want the "real" untransformed size, so we need to invert any scaling that might be applied.
    // Note that we don't use offsetWidth, because it's an integer value that is often imprecise.
    // It can be truncated down from the actual, sub-pixel value. Collapsed borders are also strangely
    // counted by browsers (they're not part of cells but they need to be somehow included so that widths add up),
    // and can result in offsetWidth being 1px too small.
    const scale = invertScaling(table);

    // Let the table compute the required size of each column
    const cols = table.querySelectorAll("col");
    table.style.tableLayout = "auto";
    table.style.width = "";
    for (const col of cols) col.style.width = "auto";

    let i = 0;
    const widths = [];
    for (const header of tHead.cells) {
      if (columns[i].key === "fill") {
        widths.push("auto");
        ++i;
        continue;
      }

      // Columns that have been resized by users are not auto-sized anymore
      if (!columns[i].resized) {
        columns[i].width = Math.ceil(header.getBoundingClientRect().width) * scale;
      }

      widths.push(columns[i++].width + "px");
    }

    // Put back the correct widths into the DOM
    while (--i >= 0) cols.item(i).style.width = widths[i];

    // Once autosizing is done, put the grid in fixed-layout mode
    table.style.width = "100%";
    table.style.tableLayout = "";
  });
}

function invertScaling(el: HTMLElement | null) {
  // Finding the exact scale applied is a tricky business.
  // We walk up the DOM looking for CSS transform attributes.
  // If it's set, we try to parse the matrix(0,1,2,3,4,5) computed value.
  // The actual X-scaling factor in this 3x2 matrix is simply its first value m[0] ([0,0]).
  // These pictures can help: https://angrytools.com/css-generator/transform/
  let factor = 1;
  for (; el; el = el!.parentElement) {
    const { scale, transform } = getComputedStyle(el);
    if (scale !== "none") factor *= parseFloat(scale);
    else if (transform !== "none") {
      const match = transform.match(/^matrix\(([^,]+),/);
      if (match) factor *= parseFloat(match[1]);
    }
  }
  return 1 / factor;
}
