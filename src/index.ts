import type { ComponentExposed } from "vue-component-type-helpers";

import type { Data } from "./columns";
import DataGrid from "./datagrid.vue";
import "./datagrid.css";

export { DataGrid };
export { getRowItem } from "./item";
export { default as i18n } from "./i18n";
export { configure } from "./options";

export type { Column, ColumnDefinition, ColumnExtensions, ColumnFormatter, Data } from "./columns";
export type { DataFunction, ODataFunction, FetchData } from "./data";
export type { TreeNode } from "./tree";
export type { State } from "./state";

export type DataGridApi<T extends Data> = ComponentExposed<typeof DataGrid<T>>;
