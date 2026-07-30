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
  // A clickable card must be a real button: it is reachable by keyboard, it
  // announces itself, and the drill-downs on /finance depend on it.
  const Root = onClick ? "button" : "div";
  return (
    <Root
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "group bg-card border border-sand-200 dark:border-border rounded-2xl p-5 shadow-soft transition-all duration-400 ease-sierra-out hover:shadow-lift hover:-translate-y-[1px]",
        highlight && "ring-1 ring-red-300/60",
        onClick && "cursor-pointer w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Titles wrap to two lines instead of truncating: "DRIVERS ON…" and
              "CASH IN THE…" were unreadable in the founder cockpit (revision
              #24). The title attribute still gives the full text on hover. */}
          {/* Revision 11 (#3). Two lines at 0.14em tracking was not enough room
              for "AVG PREPARATION TIME" in a five-across row, so the client got
              "AVG PREPARATIO…" — the clamp was hiding the label rather than
              wrapping it. Three lines, tighter tracking and a break-word so a
              long single word breaks instead of being cut. The reserved height
              stays at two lines, so a row of short titles still aligns. */}
          <p
            title={title}
            className="text-[11px] uppercase tracking-[0.1em] font-medium text-sand-600 mb-3 leading-[1.35] line-clamp-3 min-h-[2.05em] break-words"
          >
            {title}
          </p>
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
          {/* The description used to truncate to one line, which on a narrow
              card meant "How long our dri…" and no description at all. */}
          {trend && <p className="text-xs text-sand-600 mt-2.5 leading-snug line-clamp-2">{trend}</p>}
        </div>
        {Icon && (
          <div className="h-9 w-9 shrink-0 rounded-pill bg-sand-100 dark:bg-sand-900/40 flex items-center justify-center text-sand-700 transition-colors duration-400 ease-sierra-out group-hover:bg-primary/10 group-hover:text-primary">
            <Icon size={16} />
          </div>
        )}
      </div>
    </Root>
  );
}
