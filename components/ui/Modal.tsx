import { ReactNode, useEffect, useState, forwardRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UI_COLORS, UI_COMMON_STYLES } from "./ui-shared";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number | string;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ isOpen, onClose, title, children, width = 500 }, ref) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
    }, []);

    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "unset";
      }
      return () => {
        document.body.style.overflow = "unset";
      };
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    return createPortal(
      <div 
        ref={ref}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999,
          padding: 20
        }}
        onClick={onClose}
      >
        <div 
          style={{
            background: UI_COLORS.bgCard,
            borderRadius: 16,
            width: "100%",
            maxWidth: width,
            border: `1px solid ${UI_COLORS.border}`,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
            overflow: "hidden"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            padding: "20px 24px", 
            borderBottom: `1px solid ${UI_COLORS.border}` 
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary }}>{title}</h2>
            <button 
              onClick={onClose}
              style={{ 
                background: "transparent", 
                border: "none", 
                color: UI_COLORS.textMuted, 
                cursor: "pointer", 
                display: "flex", 
                padding: 4,
                transition: UI_COMMON_STYLES.transition
              }}
            >
              <X size={20} />
            </button>
          </div>
          
          <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
            {children}
          </div>
        </div>
      </div>,
      document.body
    );
  }
);

Modal.displayName = "Modal";

export default Modal;
