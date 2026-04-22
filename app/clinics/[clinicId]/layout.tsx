import ClinicShell from "@/components/clinic/ClinicShell";

export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  return <ClinicShell clinicId={clinicId}>{children}</ClinicShell>;
}
