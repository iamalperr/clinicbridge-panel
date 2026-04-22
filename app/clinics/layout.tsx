import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default function ClinicsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Header />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
