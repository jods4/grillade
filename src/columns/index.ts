export { autoSize } from "./autosize";
export { type ColumnDefinition, type ColumnFormatter, type Column, makeColspan } from "./column";
export { default as ColResizer } from "./col-resizer";

export interface Data {
  id: number | string;
  rowVersion?: number;
}
