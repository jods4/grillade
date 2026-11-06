import type { Column, ColumnDefinition, Data } from "./columns";
import type { ODataFunction } from "./data";
import type { ODataRequest } from "./odata";
import type { SortDescriptor, SortColumn } from "./sort";
import type { Workbook } from "documonster/excel";

export const hooks = {
  // Maximum number of rows to fetch and include in Excel export
  maxRows: 50_000,
  // Async export starts, can be used to show a loading indicator
  start() {},
  // Export limited at first `maxRows` but there are more rows, can be used to show a warning to user
  tooManyRows() {},
  // Generated workbook before it's downloaded, can be modified
  workbook(workbook: Workbook.Handle) {},
  // Error during export (e.g. data fetching failed), can be used to show a notification
  error(e: any) {},
  // Export finished (successfully or not), can be used to hide loading indicator
  end() {},
};

export async function exportExcel<T extends Data>(
  data: T[] | AsyncGenerator<T[]>,
  columns: Column<T>[],
  name?: string,
) {
  try {
    hooks.start();

    // documonster/excel is comparatively large (in the hundreds of KB), so only load it when required
    const { Cell, Table, Workbook, Worksheet } = await import("documonster/excel");

    const workbook = Workbook.create();
    const sheet = Workbook.addWorksheet(workbook, "Export");

    const excelCols = columns
      .filter(c => (c.exportable ?? true) && typeof c.data === "string")
      .flatMap(c =>
        typeof c.data2 !== "string"
          ? c
          : [
              c,
              {
                label: c.label + " details",
                data: c.data2,
                type: "text",
                exportStyle: c.exportStyle,
              } as ColumnDefinition<T>,
            ],
      )
      .map(c => ({
        def: c as ColumnDefinition<T>,
        header: c.label,
        key: c.data as string,
        style: { numFmt: c.exportFormat },
        map: c.exportValue,
        cellStyle: c.exportStyle
          ? (value: any, data: any) =>
              typeof c.exportStyle === "function" ? c.exportStyle(value, data) : c.exportStyle
          : undefined,
      }));
    Worksheet.setColumns(sheet, excelCols);

    const pages = Array.isArray(data) ? [data] : data;
    // Holds raw entities for styling (when configured)
    const entities = excelCols.some(col => !!col.cellStyle) ? ([] as T[]) : null;
    const rows = [] as any[][];

    for await (const page of pages) {
      for (const d of page) {
        // We don't use the built-in way to extract fields from objects because
        // we want to transform some values and there's no API for that in Column.
        const values = excelCols.map(col => {
          const colValue = d[col.key as keyof T];
          return col.map ? col.map(colValue, col.def, d) : colValue;
        });
        rows.push(values);
        entities?.push(d);
      }
    }

    Table.add(sheet, {
      name: "Table1",
      ref: "A1",
      style: {
        theme: "TableStyleMedium1",
      },
      columns: excelCols.map(x => ({ name: x.header ?? "", filterButton: true })),
      rows,
    });

    // Apply data-driven styles
    let colIndex = 0;
    for (const { cellStyle } of excelCols) {
      colIndex++;
      if (!cellStyle) continue;
      
      for (let r = 2; r <= Worksheet.rowCount(sheet); r++) {
        const style = cellStyle(Cell.getValue(sheet, r, colIndex), entities![colIndex - 2]);
        if (style) Cell.setStyle(sheet, r, colIndex, style);
      }
    }

    Worksheet.autoFitColumns(sheet);
    //autofit(sheet);
    hooks.workbook(workbook);
    download(<Uint8Array<ArrayBuffer>>await Workbook.toBuffer(workbook), name);
  } catch (ex: any) {
    hooks.error(ex);
  } finally {
    hooks.end();
  }
}

function download(buffer: Uint8Array<ArrayBuffer>, name?: string) {
  name ??= document.title ?? "Export";
  const a = document.createElement("a");
  a.download = name + ".xlsx";
  a.href = URL.createObjectURL(new Blob([buffer]));
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function* fetchAllPages<T extends Data>(
  f: ODataFunction<T>,
  odata: ODataRequest<T>,
  preSort: SortDescriptor<T>,
  sort: SortColumn<T>[],
) {
  const query = {
    ...odata,
    orderBy: [
      ...preSort,
      ...sort.map(s => [s.column.data, s.asc > 0 ? "asc" : "desc"]),
      "id", // Ensure stable sort
    ] as any,
    skip: 0,
    top: 500, // More aggressive fetching to reduce round-trips during full Excel export
  };

  while (true) {
    const { value } = await f(query);
    if (value.length > 0) yield value;
    if (value.length < 500) break;
    query.skip += 500;

    if (query.skip >= hooks.maxRows) {
      hooks.tooManyRows();
      break;
    }
  }
}
