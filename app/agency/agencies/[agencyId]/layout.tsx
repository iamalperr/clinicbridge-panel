import AgencyWorkspaceShell from "@/components/agency/AgencyWorkspaceShell";

export default async function AgencyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agencyId: string }>;
}) {
  const { agencyId } = await params;
  return <AgencyWorkspaceShell agencyId={agencyId}>{children}</AgencyWorkspaceShell>;
}
