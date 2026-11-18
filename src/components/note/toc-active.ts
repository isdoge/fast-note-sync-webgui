export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * 判断滚动容器是否已接近或到达底部
 */
export function isScrollAtBottom(metrics: ScrollMetrics, threshold = 2): boolean {
  const { scrollTop, clientHeight, scrollHeight } = metrics;
  if (scrollHeight <= clientHeight + 1) {
    return false;
  }
  return scrollTop + clientHeight >= scrollHeight - threshold;
}

/**
 * 根据可见标题集合与滚动到底部状态计算应高亮的标题 ID
 */
export function resolveActiveHeadingId(params: {
  headings: ReadonlyArray<{ id: string }>;
  visibleIds: ReadonlySet<string>;
  isAtBottom: boolean;
}): string | null {
  const { headings, visibleIds, isAtBottom } = params;
  if (headings.length === 0) {
    return null;
  }

  if (isAtBottom) {
    return headings[headings.length - 1].id;
  }

  const firstVisible = headings.find((heading) => visibleIds.has(heading.id));
  return firstVisible ? firstVisible.id : null;
}
