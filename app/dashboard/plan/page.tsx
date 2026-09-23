import { requireViewer } from "@/lib/auth";
import { getMyPlanAction } from "../plans/actions";
import { PlanRequestForm, UsageBars } from "./widgets";

export default async function MyPlanPage() {
  const viewer = await requireViewer();
  const { plan, features, used } = await getMyPlanAction();
  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>My plan: {plan?.name ?? "Free"}</h2>
        <p style={{ color: "var(--muted)" }}>Students and parents never pay. Limits below apply to your teacher account.</p>
        <UsageBars features={features} used={used} />
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Need more? Contact sales</h3>
        <PlanRequestForm name={viewer.profile.full_name || ""} email={viewer.profile.email} />
      </section>
    </>
  );
}
