<template>
  <div class="dg-wrapper" @keydown="onKeyDown" :tabindex="select ? 0 : undefined">
    <virtual-scroller v-resize="size" class="dg-scroller">
      <table ref="table" class="dg">
        <colgroup>
          <col v-for="c of visibleColumns" :style="c.key !== 'fill' ? { width: c.width + 'px' } : { width: 'auto' }" />
        </colgroup>
        <thead>
          <template v-if="columnGroups">
            <tr v-for="group of columnGroups">
              <th v-for="c of group" class="dg-header" v-bind="makeColspan(columns, c[1], c[2])">
                {{ c[0] }}
                <b class="dg-separator" />
              </th>
              <!-- Accounts for added 'fill' column -->
              <th class="dg-header" />
            </tr>
          </template>
          <tr class="dg-header-main">
            <th
              v-for="c of visibleColumns"
              :key="c.key"
              v-anim-column="c.dragged ? null : c.animate"
              class="dg-header"
              :class="{
                'dg-sort': c.sortable !== false,
                'dg-header-dragged': c.dragged,
                'dg-sticky': c.sticky,
              }"
              :style="c.sticky ? { left: c.stickyX + 'px' } : null"
              @click="sortOn(c, $event.ctrlKey)"
              @pointerdown="headerPointerDown($event, c)"
            >
              <component :is="c.header" />
              <sort-indicator-typed v-if="c.sortable !== false" :sort="sort" :column="c" />
              <div
                class="dg-filter"
                v-if="filterable && c.filterable !== false"
                @click.stop="$emit('filter', c, $event.currentTarget as HTMLElement)"
              />
              <col-resizer-typed :column="c" :state @auto-size="autoSizeColumns" />
            </th>
          </tr>
          <tr v-if="loading" class="dg-loader" />
        </thead>
        <tbody
          @click="clicked($event)"
          @contextmenu="contextmenu($event)"
          @pointerdown.shift="select && $event.preventDefault()"
          @keydown.enter.up.down="navigateRow"
        >
          <tr :style="{ height: virtState.topGap + 'px' }" />
          <!-- To maintain `:nth-child` parity (CSS stripes) -->
          <tr />

          <anim-body :data>
            <template v-for="g in virtState.groups">
              <tr v-if="g.firstRow" :key="g.key" class="dg-group">
                <td v-if="selected" class="dg-cell dg-select dg-sticky left-0">
                  <input
                    type="checkbox"
                    class="dg-checkbox pointer-events-auto"
                    :checked="!!g.group!.selected"
                    :indeterminate="g.group!.selected === null"
                    @click="selectGroup!(g.group!, ($event.target as HTMLInputElement).checked)"
                  />
                </td>
                <slot
                  name="group"
                  :group="g.firstRow"
                  :items="g.items"
                  :attrs="{ colspan: visibleColumns.length - (selected ? 1 : 0), class: 'dg-cell' }"
                />
              </tr>
              <tr
                v-for="d of g.items"
                :key="d.id"
                v-item="d"
                class="dg-row"
                :class="[
                  !disabled && selected && selectable?.(d) !== false ? 'dg-selectable' : undefined,
                  !disabled && selected?.has(d) ? 'dg-selected' : undefined,
                  expandNode && 'expanded' in d ? 'dg-expandable' : undefined,
                  onRowClick && canClick?.(d) !== false ? 'dg-clickable' : undefined,
                  rowCss?.(d),
                ]"
              >
                <td
                  v-for="c of visibleColumns"
                  :key="c.key"
                  v-anim-column="c.animate"
                  class="dg-cell"
                  :class="[typeof c.css === 'function' ? c.css(d[c.data!], d) : c.css, c.sticky ? 'dg-sticky' : null]"
                  :style="[c.style?.(d[c.data!], d), c.sticky ? { left: c.stickyX + 'px' } : null]"
                  :data-empty="c.emptyText"
                >
                  <component :is="c.render" :data="d" :value="c.data! && d[c.data]" />
                </td>
              </tr>
              <!-- To ensure next group starts at even position -->
              <tr v-if="g.even" />
            </template>
          </anim-body>

          <tr :style="{ height: virtState.bottomGap + 'px' }" />
        </tbody>
        <tfoot v-if="!data.length">
          <tr style="animation: fade-in 0.8s">
            <td :colspan="visibleColumns.length" class="dg-no-data">
              <span v-text="i18n.noData" />
            </td>
          </tr>
        </tfoot>
        <tfoot v-else-if="hasPages" class="sticky bottom-0 bg-white">
          <tr>
            <td :colspan="visibleColumns.length" class="dg-page-count">
              <span v-if="odata" class="sticky left-0 w-fit flex items-center gap-2">
                <template v-if="hasPages & PageNav.Prev">
                  <i
                    @click.prevent="fetchPage('first')"
                    class="dg-page-icon dg-page-icon-first"
                    title="First results"
                  />
                  <i
                    @click.prevent="fetchPage('prev')"
                    class="dg-page-icon dg-page-icon-prev"
                    title="Previous results"
                  />
                </template>
                Showing results {{ firstIndex + 1 }} to {{ firstIndex + fetchedData.length }}
                <i
                  v-if="hasPages & PageNav.Next"
                  @click.prevent="fetchPage('next')"
                  class="dg-page-icon dg-page-icon-next"
                  title="Next results"
                />
              </span>
              <span v-else class="sticky left-0 w-fit inline-block">
                Top {{ fetchedData.length }} results loaded, refine your search to see more
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </virtual-scroller>
  </div>
</template>

<script setup lang="ts" generic="T extends Data">
  import { AnimBody, AnimColumn as vAnimColumn, useAnimations } from "./animation";
  import { autoSize, ColResizer, type Column, type ColumnDefinition, type Data, makeColspan } from "./columns";
  import type { ODataFetch, ODataRequest } from "./odata";
  import { PageNav, useData } from "./data";
  import { exportExcel, fetchAllPages } from "./excel";
  import { ItemDirective as vItem, getRowItem } from "./item";
  import i18n from "./i18n";
  import { options } from "./options";
  import { ResizeDirective as vResize } from "./resize";
  import { addSelection } from "./selection";
  import { useSorting, SortIndicator, type SortDescriptor } from "./sort";
  import { State } from "./state";
  import { addTree } from "./tree";
  import { useVirtual, VirtualScroller } from "./virtual";
  import { computed, nextTick, shallowReactive, shallowRef as sref, watch } from "vue";

  const SortIndicatorTyped = SortIndicator<T>;
  const ColResizerTyped = ColResizer<T>;

  const props = withDefaults(
    defineProps<{
      columns: ColumnDefinition<T>[];
      columnGroups?: [string, number, number][][]; // One entry per extra header row; then one per cell [label, startIndex, length]
      disabled?: boolean;
      lazy?: boolean; // Don't initially fetch data, wait for refresh() being called
      tree?: boolean; // Expects T to have a property `children: T[]`
      onExpanding?: (item: any) => Promise<any[]>; // When a tree node has `children: null`, this is called to lazily fetch its children
      // HACK: MaybePromise<T[]> already contains T[], but Vue 3.5.19+ has a regression with default values, see https://github.com/vuejs/core/issues/14401
      data?: MaybePromise<T[]> | (() => MaybePromise<T[]>) | ODataFetch<T> | T[];
      odata?: boolean | object;
      filter?: NoInfer<((item: T) => boolean) | null>;
      pageSize?: number; // -1 will fetch all data
      groupBy?: NoInfer<keyof T>;
      groupSort?: NoInfer<SortDescriptor<T>>;
      dynamicRowHeight?: boolean;
      selectable?: NoInfer<(item: T) => boolean>;
      selected?: NoInfer<Set<T>>;
      filterable?: boolean;
      search?: string;
      rowCss?: NoInfer<(item: T) => string | string[] | Record<string, any> | undefined>;
      stateful?: string | boolean;
      statefulStore?: "history";
      canClick?: NoInfer<(item: T) => boolean>;
      onRowClick?: NoInfer<(item: T, event: MouseEvent) => void>;
      onRowContextmenu?: NoInfer<(item: T, event: MouseEvent) => void>;
    }>(),
    { data: () => [], filterable: false, stateful: true },
  );

  const emit = defineEmits<{
    dataLoaded: [data: T[]];
    filter: [c: Column<T>, anchor: HTMLElement];
    refresh: [];
    restoreState: [state: any /* extends State<T> */, restored: boolean];
  }>();

  const table = sref<HTMLTableElement>(null!);
  const size = shallowReactive({ width: 0, height: 0 });

  const columns = shallowReactive(
    props.columns.map((c, i) =>
      // TS error here is real tricky. It stems from type TypedFormat<E> in column.ts.
      // It's an union between a constraint `format` and an optional one.
      // TS complains because if `columnDefaults()` has `type: 'enum'` and `c` has no `type` and an invalid `format` (or vice-versa),
      // the resulting type would not be a valid `TypedFormat`.
      shallowReactive<Column<T>>(<any>{
        header: () => c.label,
        width: 0,
        ...options.columnDefaults(c),
        ...c,
        get hidden() {
          return !!c.hidden;
        },
        key: "user-" + i,
      }),
    ),
  ) as Column<T>[];

  const state = State.create(columns, props.stateful, props.statefulStore);
  if (props.stateful !== false) emit("restoreState", state, state.restored);

  const visibleColumns = computed(() => columns.filter(c => !c.hidden));

  // It's important to pass `columns`, and not props.columns,
  // because object identity matters in sort-indicator.
  const { sort, sortOn } = useSorting<T>(columns, state);
  const preSort = computed<SortDescriptor<T>>(() => props.groupSort ?? (props.groupBy ? [[props.groupBy, "asc"]] : []));

  const { fetchedData, data, loading, hasPages, firstIndex, refresh, fetchPage, shouldScroll } = useData<T>(
    props,
    emit,
    columns as ColumnDefinition<T>[],
    preSort,
    sort,
    state,
  );

  const { expandNode } = addTree(props.tree, props.onExpanding, columns as Column<any>[], state);

  const { selected, selectable } = props;
  const { select, selectAll, selectGroup, selectRange } = addSelection(
    columns,
    fetchedData,
    data,
    props,
    () => virtState.allGroups,
  );

  columns.push({
    key: "fill",
    reorderable: false,
    sortable: false,
    searchable: false,
    exportable: false,
    header: () => "",
    render: () => "",
    width: 0,
  });

  // Handle data changes: auto-size and virtualization
  watch(data, data => {
    if (!table.value) return; // Guard against 1st call when component is not yet mounted
    if (shouldScroll()) scrollToTop();
    onDataChanged(table.value);
    autoSizeColumns();
  });

  // Auto-size columns when the data-grid changes width
  watch(
    () => size.width,
    (_, oldWidth) => {
      if (oldWidth === 0) autoSizeColumns();
    },
  );

  // Auto-size columns when a column is hidden/shown again
  watch(
    () => columns.reduce((result, c) => (result << 1) | (c.hidden ? 1 : 0), 0),
    () => table.value && autoSizeColumns(),
  );

  const { state: virtState, scrollToTop, onDataChanged } = useVirtual(data, size, columns, props);

  const headerPointerDown = useAnimations(columns, state);

  function clicked(e: MouseEvent) {
    const item = getRowItem<T>(e.target as HTMLTableSectionElement);
    if (!item) return;

    // If datagrid is not selectable, row-click happen on full row.
    // If datagrid has no row-click, selection happen on full row.
    // If datagrid is both selectable and has row-click:
    // selection happens on first (checkbox) column, row-click on all other columns.
    // Likewise for the first column of a tree-grid.
    if (
      props.onRowClick &&
      props.canClick?.(item) !== false &&
      (!select || (e.target as HTMLElement).closest(".dg-select") == null) &&
      (!expandNode || (e.target as HTMLElement).closest(".dg-expandable .dg-tree") == null)
    ) {
      props.onRowClick(item, e);
      return;
    }

    if (select) {
      if (e.shiftKey) selectRange!(item);
      else select(item);

      e.preventDefault();
      e.stopPropagation();
    }

    if (expandNode) {
      expandNode(item as any);
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function contextmenu(e: MouseEvent) {
    if (!props.onRowContextmenu) return;
    const item = getRowItem<T>(e.target as HTMLTableSectionElement);
    if (!item) return;

    props.onRowContextmenu(item, e);
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!e.ctrlKey) return;

    if (!selectAll) return;

    switch (e.key) {
      case "a":
        selectAll!(true);
        break;
      case "d":
        selectAll!(false);
        break;
      default:
        return;
    }

    e.stopPropagation();
    e.preventDefault();
  }

  function navigateRow(e: KeyboardEvent) {
    if (e.ctrlKey) return;
    const target = <HTMLInputElement>e.target;
    if (target.tagName !== "INPUT" || target.type === "checkbox" || target.type === "radio") return;

    const td = target.closest("td")!;
    const tr = td.parentElement!;

    const nextRow =
      (e.shiftKey && e.key === "Enter") || e.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling;

    e.stopPropagation();
    e.preventDefault();

    if (!nextRow) return;

    const index = Array.prototype.indexOf.call(tr.children, td);
    const input = nextRow.children[index]?.querySelector("input") as HTMLInputElement;
    if (!input) return;

    input.focus();

    if (input.type !== "date") {
      nextTick(() => {
        input.setSelectionRange(0, input.value.length);
      });
    }
  }

  function autoSizeColumns() {
    autoSize(table.value, visibleColumns.value, data.value.length > 0);
  }

  defineExpose({
    exportExcel(name?: string, exported?: T[] | AsyncGenerator<T[]>) {
      // More than one page of data with OData support -> we fetch everything page by page.
      // Otherwise export what is displayed.
      exported ??=
        hasPages.value && props.odata
          ? fetchAllPages<T>(
              props.data as Parameters<typeof fetchAllPages<T>>[0],
              props.odata as ODataRequest<T>,
              preSort.value,
              sort,
            )
          : data.value;

      return exportExcel(exported, columns, name);
    },

    refresh() {
      refresh();
      emit("refresh");
    },

    get uiData() {
      return data.value;
    },

    get data() {
      return fetchedData.value;
    },

    columns,

    state,

    addItem(item: T) {
      fetchedData.value.push(item);
      autoSize(table.value, visibleColumns.value, true);
    },

    removeItem(id: T["id"]) {
      const array = fetchedData.value;
      const i = array.findIndex(x => x.id === id);
      if (i < 0) return;
      array.splice(i, 1);
      autoSize(table.value, visibleColumns.value, fetchedData.value.length > 0);
    },

    autoSize: autoSizeColumns,
  });
</script>

<style src="./datagrid.css"></style>
