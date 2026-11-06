import { computed, type ComputedRef, type Ref, shallowRef, toRaw } from "vue";

import type { Column, ColumnDefinition, Data } from "./columns";
import { buildPredicate } from "./search";
import { buildComparer, type SortDescriptor, type SortColumn } from "./sort";
import type { State } from "./state";
import workletURL from "./tree-paint?worker&url";

CSS.paintWorklet.addModule(workletURL);

export type TreeNode<T> = T & {
  children?: TreeNode<T>[] | null;
  expanded?: Ref<boolean>;
  expanding?: Ref<boolean>;
  gutter?: string;
};

interface TreeProps<T> {
  filter?: ((item: T) => boolean) | null;
  search?: string;
}

export function flattenTree<T extends Data>(
  fetched: Ref<TreeNode<T>[]>,
  props: TreeProps<T>,
  columns: ColumnDefinition<T>[],
  preSort: ComputedRef<SortDescriptor<T>>,
  sort: SortColumn<T>[],
  state: State<any>,
) {
  return computed(() => {
    const predicate = buildPredicate(props, columns as any);
    const comparer = buildComparer(preSort.value, sort);
    const hierarchy = toRaw(fetched.value);
    const result: TreeNode<T>[] = [];

    // We sort source arrays in-place (also inside `visit` below)
    // because visitGutter depends on the hierarchy order to know which node is last.
    if (comparer) hierarchy.sort(comparer);
    // Build flatten, filtered tree
    for (const node of hierarchy) visit(node);
    // Visit again to create the gutter lines. They depend on an item being the last
    // of its level, so it can only be done after searching is fully applied
    for (const node of hierarchy) if (node.gutter) visitGutter(node, "");

    return result;

    function visit(node: TreeNode<T>) {
      // Add expanded: Ref<bool> property to nodes that have (or may have, see `expanding`) children
      if (!("expanded" in node) && "children" in node) {
        // null indicates that the children collection must be lazy-loaded with onExpanding
        // Note that we condsider undefined as an empty array (no children)
        if (node.children === null) {
          node.expanding = shallowRef(false);
          node.expanded = shallowRef(false);
        }
        // undefined > 0 actually works in JS (is false)
        else if (node.children?.length! > 0) node.expanded = shallowRef(false);
      }

      // Restore last known expanded state of node.
      // We don't support this for lazy-loaded nodes (yet).
      if (node.expanded && !node.expanding) {
        const wasExpanded = state.expanded!.get(node.id);
        if (wasExpanded !== undefined) node.expanded.value = wasExpanded;
      }

      // Tentatively add current node, we'll remove it later if it doesn't match search and has no matching child
      result.push(node);

      let hasChildren = false;
      // Always expand search results
      // Note that node.expanded.value must not be short-circuited, esp. by checking node.children.length first.
      // It must be a dependency of the computed as it must trigger when lazy-loaded nodes are expanded
      // (and their children property changes but is not reactive)
      if ((node.expanded?.value || predicate) && node.children?.length! > 0) {
        if (comparer) node.children!.sort(comparer);
        for (const child of node.children!) hasChildren = visit(child) || hasChildren;
      }

      // Remove current node if it has no child and doesn't match search
      if (!hasChildren && predicate?.(node) === false) {
        result.pop();
        node.gutter = undefined;
        return false;
      }

      node.gutter = predicate ? (hasChildren ? "O" : ".") : hasChildren ? "-" : "expanded" in node ? "+" : ".";

      return true;
    }

    function visitGutter(node: TreeNode<T>, gutter: string) {
      const hasChildren = node.gutter === "-" || node.gutter === "O";
      node.gutter = gutter + node.gutter;
      if (!hasChildren) return;
      const prefix = gutter + "│";
      let isLast = true;
      for (let i = node.children!.length - 1; i >= 0; i--) {
        const child = node.children![i];
        if (!child.gutter) continue;
        visitGutter(child, isLast ? gutter + "└" : prefix);
        isLast = false;
      }
    }
  });
}

export function addTree(
  isTree: boolean,
  onExpanding: ((item: any) => Promise<any[]>) | undefined,
  columns: Column<any>[],
  state: State<any>,
) {
  if (!isTree) return { expandNode: null };

  state.expanded ??= new Map();

  const treeColumn = columns.find(c => !c.hidden)!;

  if (treeColumn.key !== "tree") {
    Object.assign(treeColumn, {
      key: "tree",
      reorderable: false,
      sticky: true,
      css: wrapCss(treeColumn.css),
      style: wrapStyle(treeColumn.style),
    });

    function wrapCss(css: Column<any>["css"]): Column<any>["css"] {
      if (typeof css === "function")
        return (val, data) => "dg-tree " + (data.expanding?.value ? "dg-tree-expanding " : "") + (css(val, data) ?? "");

      if (typeof onExpanding === "function")
        return (val, data) => "dg-tree " + (data.expanding?.value ? "dg-tree-expanding " : "") + (css ?? "");

      if (typeof css === "string") return "dg-tree " + css;
      return "dg-tree";
    }

    function wrapStyle(style: Column<any>["style"]): Column<TreeNode<any>>["style"] {
      return (val, data) => {
        const treeStyle = { "--dg-tree": data.gutter, "--dg-level": data.gutter.length };
        const userStyle = style?.(val, data);
        if (userStyle && typeof userStyle === "object") Object.assign(treeStyle, userStyle);
        return treeStyle;
      };
    }
  }

  return {
    expandNode(data: TreeNode<Data>) {
      // gutter ending with O is an indication of searching,
      // when nodes are always expanded and can't be toggled.
      if (data.expanded && !data.gutter?.endsWith("O")) {
        if (data.expanding) {
          if (!data.expanding.value) {
            data.expanding.value = true;
            onExpanding!(data).then(children => {
              delete data.expanding;
              data.children = children;
              // Always change the expanded value, even if we're going to delete it on next line.
              // It is the reactive dependency that will recompute the grid layout and repaint.
              data.expanded!.value = true;
              if (children.length === 0) delete data.expanded;
            });
          }
        } else {
          const value = !data.expanded.value;
          data.expanded.value = value;
          state.expanded!.set(data.id, value);
        }
      }
    },
  };
}
