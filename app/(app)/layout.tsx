import { requireSession } from "@/lib/auth/guard";
import { Sidebar } from "@/components/app-shell/sidebar";
import { MobileNav } from "@/components/app-shell/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <div className="flex min-h-svh flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col pb-16 md:pb-0 md:pl-60">
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
