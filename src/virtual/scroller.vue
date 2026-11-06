<template>
  <div :ref="el => (state.scroller = el as HTMLElement)" @scroll.passive="onScroll">
    <slot />
  </div>
</template>

<script setup lang="ts">
  import { getState } from "./state";

  const state = getState();

  function onScroll() {
    state.scrollTop = state.scroller.scrollTop;
  }
</script>
