"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { UI_COLORS } from "@/components/ui/ui-shared";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  return (
    <div className="cb-shell">
      <div className="cb-shell-sidebar">
        <Sidebar />
      </div>

      {menuOpen && (
        <div className="cb-shell-drawer-layer">
          <button type="button" className="cb-shell-backdrop" aria-label="Menüyü kapat" tabIndex={-1} onClick={closeMenu} />
          <div ref={drawerRef} id="cb-dashboard-drawer" className="cb-shell-drawer" role="dialog" aria-modal="true" aria-label="Ana menü">
            <button
              type="button"
              onClick={closeMenu}
              aria-label="Menüyü kapat"
              className="cb-shell-drawer-close"
              style={{ color: UI_COLORS.textSecondary }}
            >
              <X size={18} aria-hidden />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="cb-shell-main">
        <Header onMenuClick={() => setMenuOpen(true)} menuOpen={menuOpen} menuTriggerRef={triggerRef} />
        <div className="cb-shell-scroll">{children}</div>
      </div>
    </div>
  );
}
