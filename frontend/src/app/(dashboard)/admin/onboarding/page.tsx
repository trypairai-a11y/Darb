"use client";
// Phase 2 Wave 5 — /admin/onboarding wizard.
//
// REQ-gtm-onboarding. UI-SPEC §3.4.
//
// Was five steps. Two of them existed only to pull data out of competitor
// aggregators: step 3 asked a founder to type in Keeta, Talabat, Deliveroo and
// Americana portal usernames and passwords, and step 4 ("Backwash") replayed
// history from them. That was the pre-rebuild product. Darb is the only
// platform in scope now (PRD §1), so onboarding a fleet is: create the tenant,
// import its couriers, hand over the report.
//
// The step components and their API wrappers are left in place, unimported —
// same call the PRD rebuild made with the aggregator Prisma models.
//
// State machine: { step: 1..3, tenantId?, completedSteps: number[] }
// Renders OnboardingStepper + the step component for the current step.
//
// Super-admin gated server-side (every /api/admin/* call). Frontend uses
// SuperAdminGuard for graceful 403.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import OnboardingStepper from "@/components/admin/OnboardingStepper";
import TenantInfoStep from "@/components/admin/onboarding/TenantInfoStep";
import CourierImportStep from "@/components/admin/onboarding/CourierImportStep";
import ReportPreview from "@/components/admin/onboarding/ReportPreview";
import SuperAdminGuard from "@/components/admin/SuperAdminGuard";

type StepNum = 1 | 2 | 3;

interface WizardState {
  step: StepNum;
  tenantId?: string;
  tenantName?: string;
  completedSteps: number[];
}

const STEPPER_STEPS = [
  { key: "tenant", label: "Tenant" },
  { key: "couriers", label: "Couriers" },
  { key: "report", label: "Report" },
];

export default function AdminOnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({
    step: 1,
    completedSteps: [],
  });

  const advance = (next: StepNum, patch: Partial<WizardState> = {}) =>
    setState((prev) => ({
      ...prev,
      step: next,
      ...patch,
      completedSteps: Array.from(new Set([...prev.completedSteps, prev.step])),
    }));

  return (
    <SuperAdminGuard>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-sand-600">
              Founder white-glove
            </p>
            <h1 className="font-display text-2xl text-slate-900">
              Onboard a new fleet
            </h1>
            {state.tenantName && (
              <p className="text-sm text-sand-600 mt-1">
                Working on: <span className="font-medium">{state.tenantName}</span>
              </p>
            )}
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center gap-1.5 text-sm text-sand-600 hover:text-slate-900"
          >
            <ArrowLeft size={14} />
            Cancel
          </Link>
        </div>

        <OnboardingStepper currentStep={state.step} steps={STEPPER_STEPS} />

        <div>
          {state.step === 1 && (
            <TenantInfoStep
              onNext={(resp) =>
                advance(2, {
                  tenantId: resp.tenantId,
                  tenantName: resp.tenantName,
                })
              }
            />
          )}
          {state.step === 2 && state.tenantId && (
            <CourierImportStep
              tenantId={state.tenantId}
              onNext={() => advance(3)}
              onSkip={() => advance(3)}
            />
          )}
          {state.step === 3 && state.tenantId && (
            <ReportPreview
              tenantId={state.tenantId}
              onComplete={() =>
                router.push(`/admin/billing/${state.tenantId}`)
              }
            />
          )}
        </div>
      </div>
    </SuperAdminGuard>
  );
}
