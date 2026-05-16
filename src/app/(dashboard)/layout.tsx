export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — UC-03에서 완전 구현 */}
      <div className="hidden md:block w-64 border-r border-border bg-sidebar shrink-0" />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
