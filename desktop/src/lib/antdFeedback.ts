import type { ReactNode } from "react";
import type { ModalFuncProps } from "antd";

type Confirm = (config: ModalFuncProps) => unknown;

export function confirmAction(
  confirm: Confirm,
  content: ReactNode,
  options: Omit<ModalFuncProps, "content" | "onOk" | "onCancel"> = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    confirm({
      centered: true,
      ...options,
      content,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
