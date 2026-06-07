import { cn } from "@/lib/cn";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  highlight?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function StatCard({ title, value, icon: Icon, trend, highlight, className, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-card border border-sand-200 dark:border-border rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]",
        highlight && "ring-1 ring-red-300/60",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-sand-600 mb-3 truncate">{title}</p>
          <p className={cn(
            "font-display leading-none tracking-tight whitespace-nowrap",
            // Step down with the length of the value so it always fits the card width
            typeof value === "string" && value.length > 12 ? "text-lg" :
            typeof value === "string" && value.length > 9 ? "text-xl" :
            typeof value === "string" && value.length > 6 ? "text-2xl" :
            "text-4xl",
            highlight ? "text-red-600" : "text-sand-900 dark:text-foreground"
          )}>
            {value}
          </p>
          {trend && <p className="text-xs text-sand-600 mt-2.5 truncate">{trend}</p>}
        </div>
        {Icon && (
          <div className="h-9 w-9 shrink-0 rounded-pill bg-sand-100 dark:bg-sand-900/40 flex items-center justify-center text-sand-700 transition-colors duration-400 ease-sierra-out group-hover:bg-primary/10 group-hover:text-primary">
            <Icon size={16} />
          </div>
        )}
      </div>
    </div>
  );
}
