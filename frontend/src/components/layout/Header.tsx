"use client";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, PanelLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/contexts/SidebarContext";
import NotificationDropdown from "./NotificationDropdown";
import CompanySwitcher from "./CompanySwitcher";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { useI18n } from "@/i18n/I18nProvider";
import { formatDateLong } from "@/i18n/format";

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { open, setOpen } = useSidebar();
  const { t, locale } = useI18n();

  const now = new Date();
  const hour = now.getHours();
  const greetingKey = hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
  const greeting = t(greetingKey);
  const dateStr = formatDateLong(now, locale);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const initial = (user?.name || t("common.user")).charAt(0).toUpperCase();

  return (
    <header className="h-16 bg-sand-50/90 dark:bg-card/80 backdrop-blur-xl border-b border-sand-200 dark:border-border flex items-center justify-between px-6 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-pill hover:bg-sand-200/70 text-sand-700 hover:text-sand-900 transition-colors duration-250 ease-sierra-out"
            title={t("common.openSidebar")}
            aria-label={t("common.openSidebar")}
          >
            <PanelLeft size={18} />
          </button>
        )}
        <div>
          <h1 className="font-display text-[22px] leading-tight text-sand-900 tracking-tight">
            {greeting}, <span className="italic">{user?.name?.split(" ")[0] || t("common.user")}</span>
          </h1>
          <p className="text-xs text-sand-600 mt-0.5">{dateStr}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CompanySwitcher />
        <ThemeToggle />
        <NotificationDropdown />
        <div className="hidden md:flex items-center gap-3 ms-2 ps-3 border-s border-sand-200 dark:border-border">
          <div className="h-9 w-9 rounded-full bg-navy-800 text-white flex items-center justify-center font-display text-sm">
            {initial}
          </div>
          <div className="text-end leading-tight">
            <p className="text-[13px] font-medium text-sand-900">{user?.name}</p>
            <p className="text-[11px] text-sand-600 uppercase tracking-widest">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 rounded-pill hover:bg-sand-200/70 text-sand-700 hover:text-sand-900 transition-colors duration-250 ease-sierra-out"
          title={t("common.logout")}
          aria-label={t("common.logout")}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
