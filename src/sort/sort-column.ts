import type { Column, Data } from "../columns";

export interface SortColumn<T extends Data> {
  column: Column<T>;
  asc: number;
}

export type SortDescriptor<T> = (readonly [keyof T, "asc" | "desc"])[];
