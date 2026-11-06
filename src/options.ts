import type { ColumnDefinition, Data } from "./columns";
import { hooks } from "./excel";

const columnDef: Partial<ColumnDefinition<any>> = {
  render: ({ value }: any) => (value == null ? null : value + ""),
};

export const options = {
  defaultPageSize: 200,
  columnDefaults<T extends Data>(c: ColumnDefinition<T>) {
    return columnDef as Partial<ColumnDefinition<T>>;
  },
  excel: {} as Partial<typeof hooks>,
  searchRegex: (word: string) => new RegExp(RegExp.escape(word), "i"),
  // Handy to provide a default key when there's only one table instance on page.
  // `useRoute().name` is a good default but this library doesn't take a hard dependency on vue-router.
  stateKey(): string | undefined {
    return;
  },
};

export function configure(config: Partial<typeof options>) {
  Object.assign(options, config);
  if ("excel" in config) Object.assign(hooks, config.excel);
}
