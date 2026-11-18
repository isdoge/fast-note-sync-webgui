// confirm-dialog-context.tsx
import React, { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { ConfirmDialog } from "@/components/dialog/confirm-dialog";


// 定义上下文的类型
interface ConfirmDialogContextType {
  isDialogOpen: boolean
  message: string
  type: string
  openConfirmDialog: (message: string, type?: string, onConfirm?: () => void, children?: ReactNode, className?: string) => void
  closeDialog: () => void
}

// 创建上下文
const ConfirmDialogContext = createContext<ConfirmDialogContextType | undefined>(undefined)

// 提供者组件
export const ConfirmDialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [type, setType] = useState("confirm")
  const [handleConfirm, setHandleConfirm] = useState<() => void | undefined>()
  const [customChildren, setCustomChildren] = useState<ReactNode | undefined>()
  const [className, setClassName] = useState<string | undefined>()
  const dialogSeqRef = useRef(0)

  // 关闭对话框，只设置 isOpen 为 false，不重置展示文案与类型
  // 这样在关闭动画期间，对话框内容保持不变；同时清理回调与递增序号防止状态竞态
  const handleCancel = useCallback(() => {
    dialogSeqRef.current += 1
    setIsDialogOpen(false)
    setHandleConfirm(undefined)
  }, [])

  const handleConfirmClick = useCallback(() => {
    const seq = dialogSeqRef.current
    const cb = handleConfirm
    setHandleConfirm(undefined)
    if (cb) {
      cb()
    }
    if (dialogSeqRef.current === seq) {
      setIsDialogOpen(false)
    }
  }, [handleConfirm])

  const openConfirmDialog = useCallback((message: string, type?: string, onConfirm?: () => void, children?: ReactNode, className?: string) => {
    // 打开时递增序列号并设置所有状态
    dialogSeqRef.current += 1
    setMessage(message)
    setType(type || "confirm")
    setHandleConfirm(() => onConfirm)
    setCustomChildren(children)
    setClassName(className)
    setIsDialogOpen(true)
  }, [])

  return (
    <ConfirmDialogContext.Provider value={{ isDialogOpen, message, type, openConfirmDialog, closeDialog: handleCancel }}>
      {children}
      <ConfirmDialog isOpen={isDialogOpen} onCancel={handleCancel} onConfirm={handleConfirmClick} message={message} type={type} className={className}>
        {customChildren}
      </ConfirmDialog>
    </ConfirmDialogContext.Provider>
  )
}

// 自定义钩子
export const useConfirmDialog = () => {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider")
  }
  return context
}
