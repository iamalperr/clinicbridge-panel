"use client";

import { createContext, useContext } from "react";

interface AgencyWorkspaceContextValue {
  agencyId: string;
}

const AgencyWorkspaceContext = createContext<AgencyWorkspaceContextValue>({
  agencyId: "",
});

export function AgencyWorkspaceProvider({
  agencyId,
  children,
}: {
  agencyId: string;
  children: React.ReactNode;
}) {
  return (
    <AgencyWorkspaceContext.Provider value={{ agencyId }}>
      {children}
    </AgencyWorkspaceContext.Provider>
  );
}

export function useAgencyWorkspace() {
  const ctx = useContext(AgencyWorkspaceContext);
  if (!ctx.agencyId) {
    throw new Error("useAgencyWorkspace must be used within AgencyWorkspaceProvider");
  }
  return ctx;
}
