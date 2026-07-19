"use client";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import PortalGuard from "@/components/layout/PortalGuard";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/cn";

const AskDarbPalette = dynamic(() => import("@/components/ai/AskDarbPalette"), {
  ssr: false,
  loading: () => null,
});

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed, open } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className={cn("transition-all duration-200", !open ? "ms-0" : collapsed ? "ms-16" : "ms-60")}>
        <Header />
        <main className="p-8">{children}</main>
      </div>
      <AskDarbPalette />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <PortalGuard />
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}
