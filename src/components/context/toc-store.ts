import { createContext, useContext } from "react";

/**
 * 目录项数据结构
 * 表示文档中的一个标题及其元信息
 */
export interface TocItem {
  /** 标题的唯一标识符（自动生成或从 id 属性获取） */
  id: string;
  /** 标题层级：1-6，对应 h1-h6 */
  level: number;
  /** 标题的纯文本内容（去除 Markdown 格式） */
  text: string;
  /** 标题对应的 DOM 元素引用，用于滚动定位 */
  element: HTMLElement;
}

/**
 * 目录 Context 类型定义
 * 提供标题数据管理和当前激活状态
 */
export interface TocContextType {
  /** 当前文档的所有标题列表 */
  headings: TocItem[];
  /** 当前在视口中可见的标题 ID */
  activeId: string | null;
  /** 注册一个新的标题到目录 */
  registerHeading: (item: TocItem) => void;
  /** 从目录注销一个标题 */
  unregisterHeading: (id: string) => void;
  /** 设置当前激活的标题 ID */
  setActiveId: (id: string) => void;
}

export const TocContext = createContext<TocContextType | undefined>(undefined);

/**
 * 目录数据消费 hook
 * 必须在 TocProvider 内部使用
 *
 * @returns TocContextType - 目录数据和操作方法
 * @throws 如果未包裹 TocProvider 则抛出错误
 */
export const useToc = (): TocContextType => {
  const context = useContext(TocContext);
  if (!context) {
    throw new Error("useToc must be used within a TocProvider");
  }
  return context;
};
