import React, { useCallback, useRef, useState } from "react";
import { TocContext, type TocItem } from "./toc-store";

/**
 * 目录数据 Context Provider
 * 包裹需要目录功能的组件树，提供标题数据管理
 *
 * @param children - 子组件
 *
 * @example
 * ```tsx
 * <TocProvider>
 *   <MarkdownEditor />
 *   <TableOfContents />
 * </TocProvider>
 * ```
 */
export const TocProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 使用 ref 存储原始数据，避免不必要的重渲染
  const headingsRef = useRef<TocItem[]>([]);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * 注册一个新的标题到目录
   * 如果相同 id 已存在，则忽略重复注册
   */
  const registerHeading = useCallback((item: TocItem) => {
    const existing = headingsRef.current.find(h => h.id === item.id);
    if (!existing) {
      headingsRef.current = [...headingsRef.current, item];
      setHeadings([...headingsRef.current]);
    }
  }, []);

  /**
   * 从目录注销一个标题
   * 按 id 查找并移除
   */
  const unregisterHeading = useCallback((id: string) => {
    const nextHeadings = headingsRef.current.filter(h => h.id !== id);

    if (nextHeadings.length === headingsRef.current.length) {
      return;
    }

    headingsRef.current = nextHeadings;
    setHeadings([...headingsRef.current]);
  }, []);

  return (
    <TocContext.Provider value={{ headings, activeId, registerHeading, unregisterHeading, setActiveId }}>
      {children}
    </TocContext.Provider>
  );
};
