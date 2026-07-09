import AgencySidebar from "@/components/agency/AgencySidebar";
import AgencyHeader from "@/components/agency/AgencyHeader";

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      <AgencySidebar />
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <AgencyHeader />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
