// Phase 4 Wave 5 — /chat/scheduled page route.
// Renders the ScheduledBriefingsList with React Query data; the form
// hits POST /api/scheduled-briefings on submit.
import { ScheduledBriefingsList } from "@/components/scheduled-jobs/ScheduledBriefingsList";

export default function ScheduledBriefingsPage() {
  return (
    <div className="w-full max-w-none">
      <ScheduledBriefingsList />
    </div>
  );
}
