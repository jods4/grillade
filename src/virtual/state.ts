import type { Data } from "../columns";
import type { DataGroup } from "../grouping";
import { type InjectionKey, inject } from "vue";

export interface VisibleGroup<T extends Data> {
  key?: any;
  group?: DataGroup<T>;
  firstRow?: T;
  even?: boolean;
  items: IterableIterator<T>;
}

export interface VirtualState<T extends Data> {
  scroller: Element;
  scrollTop: number;
  rowHeight: number;
  groupHeight: number;
  buffer: number;
  topGap: number;
  bottomGap: number;
  index: number;
  count: number;

  allGroups?: DataGroup<T>[];
  groupFirstRow: number;
  groupLastRow: number;
  // Visible groups in viewport, for row rendering
  groups: VisibleGroup<T>[];

  dynamic?: {
    heights: number[];
    offsets: number[];
    measured: boolean[];
    measuredGroups: boolean[] | null | undefined;
  };
}

export const injectKey: InjectionKey<VirtualState<Data>> = Symbol("virt-state");

export function getState() {
  return inject(injectKey)!;
}
