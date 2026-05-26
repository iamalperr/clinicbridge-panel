export default function ReelsCoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-black min-h-screen flex items-center justify-center overflow-hidden">
      {children}
    </div>
  );
}
