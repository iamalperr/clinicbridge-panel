import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClinicBridge AI — Promo Video Preview",
  description: "9:16 vertical video animation preview for ClinicBridge AI.",
};

export default function PromoVideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="light" style={{ colorScheme: "light" }}>
      {children}
    </div>
  );
}
