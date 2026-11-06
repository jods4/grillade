import { computed, Ref } from "vue";

import type { ColumnDefinition, Data } from "./columns";
import { options } from "./options";

function buildSearchFunc<T extends Data>(search: string, columns: ColumnDefinition<T>[]) {
  const regExps = search.split(/\s+/).map(x => options.searchRegex(x));
  const searchables = columns
    .filter(c => c.searchable !== false && (!c.hidden || c.searchable))
    .flatMap(c => (c.data2 ? [c.data!, c.data2] : c.data!));

  return (item: T) => {
    outer: for (const re of regExps) {
      for (const s of searchables) {
        const val = Array.isArray(item[s]) ? item[s] : [item[s]];

        if (val.some(x => x != null && re.test(x.toString()))) continue outer;
      }
      return false;
    }
    return true;
  };
}

export function buildPredicate<T extends Data>(
  props: {
    filter?: ((item: T) => boolean) | null;
    search?: string;
  },
  columns: ColumnDefinition<T>[],
) {
  const { filter, search } = props;
  if (!search && !filter) return null;
  const searchFunc = search ? buildSearchFunc(search, columns) : undefined;
  return filter && searchFunc ? (item: T) => filter(item) && searchFunc(item) : (searchFunc ?? filter!);
}

export function useSearching<T extends Data>(
  data: Ref<T[]>,
  props: {
    filter?: ((item: T) => boolean) | null;
    search?: string;
  },
  columns: ColumnDefinition<T>[],
) {
  return computed(() => {
    const predicate = buildPredicate(props, columns);
    return predicate ? data.value.filter(predicate) : data.value;
  });
}
