import type { ColumnDefinition, Data } from "./columns";
import type { ODataFetch, ODataRequest, ODataResponse } from "./odata";
import { options } from "./options";
import { useSearching } from "./search";
import { localSort, type SortDescriptor, type SortColumn } from "./sort";
import type { State } from "./state";
import { flattenTree } from "./tree";
import { asyncComputed, awaitLast } from "./utils";
import { computed, type ComputedRef, type Ref, shallowRef as sref } from "vue";

type DataFunction<T> = () => MaybePromise<T[]>;
export type ODataFunction<T> = (query?: ODataRequest<T>) => Promise<ODataResponse<T>>;
export type FetchData<T> = DataFunction<T> | ODataFunction<T>;

export const enum PageNav {
  None = 0,
  Prev = 1,
  Next = 2,
}

export function useData<T extends Data>(
  props: {
    lazy?: boolean;
    tree?: boolean;
    data: MaybePromise<T[]> | (() => MaybePromise<T[]>) | ODataFetch<T>;
    odata?: boolean | object;
    filter?: ((item: any) => boolean) | null;
    search?: string;
    pageSize?: number;
  },
  emit: { (e: "dataLoaded", data: T[]): void },
  columns: ColumnDefinition<T>[],
  preSort: ComputedRef<SortDescriptor<T>>,
  sort: SortColumn<T>[],
  state: State<T>,
) {
  // When data changes (could be a filter, sort, paging),
  // we usually scroll to the top, unless `refresh(scroll: false)` was explicitly called.
  let shouldScroll = false;
  // Likewise, when anything changes we go back to page 1, except when explicitly fetching the next page.
  let skip = state.skip;
  const firstIndex = sref(0);
  const { loading, data: fetchedData, refresh } = fetchData();

  const data = props.odata
    ? fetchedData
    : props.tree
      ? flattenTree(fetchedData, props, columns, preSort, sort, state)
      : localSort(useSearching(fetchedData, props, columns), preSort, sort);

  let lastHasPages = PageNav.None;
  const hasPages = computed(() => {
    // OData automatically has a defaultPageSize
    if (props.pageSize == null && !props.odata) return PageNav.None;
    if (props.pageSize === -1) return PageNav.None;

    // During loading, if datagrid previously had `hasPages != 0` we assume it's still != 0 so that the UI doesn't flicker
    // when going back to first page from last page (at this point, firstIndex == 0 and fetchedData.length < pageSize).
    if (loading.value && lastHasPages && firstIndex.value == 0) return PageNav.Next;

    return (lastHasPages =
      (fetchedData.value.length >= (props.pageSize ?? options.defaultPageSize) ? PageNav.Next : PageNav.None) |
      (firstIndex.value > 0 ? PageNav.Prev : PageNav.None));
  });

  return {
    fetchedData,
    data,
    loading,
    refresh,
    hasPages,
    firstIndex,
    fetchPage(which: "first" | "next" | "prev") {
      switch (which) {
        case "first":
          skip = 0;
          break;
        case "next":
          skip = firstIndex.value + (props.pageSize ?? options.defaultPageSize);
          break;
        case "prev":
          skip = Math.max(0, firstIndex.value - (props.pageSize ?? options.defaultPageSize));
          break;
        default:
          return;
      }
      refresh();
    },
    shouldScroll() {
      if (shouldScroll) {
        shouldScroll = false;
        return true;
      }
      return false;
    },
  };

  function fetchData(): { loading: Ref<boolean>; data: Ref<T[]>; refresh(scrollToTop?: boolean): void } {
    // We assume that if data is a function, it'll always be a function.
    // Refreshing data is done by calling refresh().
    if (typeof props.data === "function" && !props.odata) {
      const {
        pending: loading,
        last: data,
        next,
      } = awaitLast(
        async () => {
          const data = await (props.data as DataFunction<T>)();
          return "value" in data ? (data["value"] as T[]) : data;
        },
        {
          immediate: !props.lazy,
          initial: [],
          onComplete(data) {
            emit("dataLoaded", data);
          },
        },
      );
      return {
        loading,
        data,
        refresh(scrollToTop: boolean = true) {
          shouldScroll ||= scrollToTop;
          next();
        },
      };
    }

    // Otherwise refresh is automatic by datagrid when anything changes
    const forceRefresh = sref(0);
    let noScrollRefresh = 0;
    let lastRequestId = 0;

    function fetch() {
      ++lastRequestId;
      if (forceRefresh.value === 0 && props.lazy) return [];

      if (noScrollRefresh !== forceRefresh.value) shouldScroll = true;

      if (!props.odata) return props.data as MaybePromise<T[]>;

      const f = props.data as ODataFunction<T>;
      const q = query(props.odata!);
      const reqId = lastRequestId;
      return f(q).then(odataFetched);

      function odataFetched({ value }: ODataResponse<T>): T[] | Promise<T[]> {
        // If we're fetching "further" results but there is none anymore
        // (server state may have changed since last fetch), we revert to
        // previous page (possibly up to page 0) and refresh UI.
        if (value.length === 0 && q.skip! > 0 && reqId === lastRequestId) {
          q.skip = Math.max(0, q.skip! - (props.pageSize ?? options.defaultPageSize));
          // Beware that modifying `firstIndex` here in this continuation is
          // a race condition as users could have triggered another fetch in the meantime
          // by modifying the query in any way. This is way we check that
          // this is still the "current" request by checking lastRequestId.
          // If it's not then we don't care about its result and don't need any action.
          firstIndex.value = q.skip;
          return f(q).then(odataFetched);
        }

        return value;
      }
    }

    const { pending: loading, current: data } = asyncComputed(fetch, [], data => emit("dataLoaded", data));

    return {
      loading,
      data,
      refresh(scrollToTop: boolean = true) {
        forceRefresh.value++;
        if (!scrollToTop) noScrollRefresh = forceRefresh.value;
      },
    };
  }

  function query(odata: boolean | ODataRequest<T>) {
    odata = typeof odata === "object" ? { ...odata } : {};

    if (sort.length) {
      odata.orderBy = <any>[
        ...preSort.value,
        ...sort.map(s => [s.column.data, s.asc > 0 ? "asc" : "desc"]),
        "id", // ensures a stable sort for pagination
      ];
    } else odata.orderBy = ["id"]; // ensures a stable sort for pagination

    if (skip) {
      odata.skip = skip;
      skip = 0; // Only this fetch, any other change should go back to page 0
    }
    firstIndex.value = state.skip = odata.skip ?? 0;

    odata.top = props.pageSize === -1 ? undefined : (props.pageSize ?? options.defaultPageSize);

    return odata;
  }
}
