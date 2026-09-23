import { getPlansAction, getRequestsAction } from "./actions";
import { PlansManager, AssignForm, RequestsInbox, CreatePlanForm } from "./manager";

export default async function PlansPage() {
  const plans = await getPlansAction();
  const requests = await getRequestsAction();
  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Plans</h2>
        <p style={{ color: "var(--muted)" }}>Students and parents always use the free plan and are never charged. Billing integrates later without rebuilds.</p>
        <PlansManager initial={plans} />
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Create plan</h3>
        <CreatePlanForm />
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Assign plan</h3>
        <AssignForm slugs={plans.filter((p) => p.is_active).map((p) => p.slug)} />
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Plans can only be assigned to teachers/admins — never students or parents.</p>
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Custom-plan requests ({requests.length})</h3>
        <RequestsInbox initial={requests} />
      </section>
    </>
  );
}
