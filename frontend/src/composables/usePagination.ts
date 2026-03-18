import { computed, ref, unref, watch, type Ref } from "vue";

export function usePagination<T>(
  items: Ref<T[]> | { value: T[] },
  defaultPageSize = 10,
) {
  const currentPage = ref(1);
  const pageSize = ref(defaultPageSize);

  const source = computed<T[]>(() => {
    const value = unref(items as any);
    return Array.isArray(value) ? value : [];
  });

  const total = computed(() => source.value.length);

  const pagedItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return source.value.slice(start, start + pageSize.value);
  });

  const resetPage = () => {
    currentPage.value = 1;
  };

  const handleCurrentChange = (page: number) => {
    currentPage.value = page;
  };

  const handleSizeChange = (size: number) => {
    pageSize.value = size;
    currentPage.value = 1;
  };

  watch(total, (value) => {
    const maxPage = Math.max(1, Math.ceil((value || 0) / pageSize.value));
    if (currentPage.value > maxPage) {
      currentPage.value = maxPage;
    }
  });

  return {
    currentPage,
    pageSize,
    total,
    pagedItems,
    resetPage,
    handleCurrentChange,
    handleSizeChange,
  };
}
