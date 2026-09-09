# Company throttle controls

Requirement: the supplied group screenshot asks for both throttling and unthrottling a delivery company from its company profile.

- ADMIN and OPS_MANAGER see **Throttle company** for OK or WARNED companies and **Unthrottle company** for THROTTLED companies. Warned companies retain **Return to normal** as well. Controls are translated into Arabic and disabled while saving.
- Actions use the existing tenant-scoped, audited discipline endpoint. A successful response refreshes the company status and changes the available action; failures show an error.
- Manual throttling now sets the company's drivers' `throttledUntil` to seven days, matching the existing automatic discipline policy. Unthrottling sets the company to OK and clears those driver restrictions immediately.
- Suspended and removed companies are not inadvertently restored by the throttle control.

Validation: frontend and backend TypeScript checks passed; 93 tests across company discipline, fleet operations and dispatch passed. Added route regression tests cover both staff roles, throttle duration and driver/company updates, unthrottle, audit recording, tenant isolation and supervisor denial.

Production release (9 September 2026):

- API: pair-darb-i9fmvbnmj-trypairai-6527s-projects.vercel.app, READY. Both production API aliases returned healthy responses.
- Web: pair-darb-5mal40cpx-trypairai-6527s-projects.vercel.app, READY, production build passed.
- Live darbkw.vercel.app checks: Sidra Delivery Co (OK) displays **Throttle company**; Gulf Swift Couriers (THROTTLED) displays **Unthrottle company** and the Arabic **إلغاء تقييد الشركة**. Checks did not change company discipline or driver restrictions in production; both mutation directions are covered by route tests.
