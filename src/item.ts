import { FunctionDirective } from "vue";
import type { Data } from "./columns";

type ElementItem<T> = HTMLElement & {
  _item?: T;
};

export const ItemDirective: FunctionDirective<HTMLElement> = (el: ElementItem<any>, binding) => {
  el._item = binding.value;
};

export function getRowItem<T = Data>(el: ElementItem<T>): T | undefined {
  return el.closest<ElementItem<T>>(".dg-row")?._item as T;
}
