"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGameData, createRuleAction, updateRuleAction, deleteRuleAction,
  restoreDefaultsAction, awardPointsAction, resetPointsAction,
  updateLeaderboardAction, type GameData,
} from "./game-actions";

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`);

export function GamificationSection({ classId, isManager, isStaff }: { classId: string; isManager: boolean; isStaff: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<GameData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      setData(await getGameData(classId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed.");
    }
  }
  useEffect(() => { load(); }, [classId]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setMsg(null);
    try {
      const r = await fn();
      if (done) setMsg(typeof r === "object" && r !== null && "total" in r ? `Awarded. Total: ${(r as { total: number }).total}.` : done);
      if (typeof r === "object" && r !== null && "deactivated" in r && (r as { deactivated: boolean }).deactivated) setMsg("Rule deactivated (has history).");
      router.refresh();
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    }
  }

  if (err) return <section className="card"><h3 style={{ margin: 0 }}>Points & achievements</h3><div className="empty">{err}</div></section>;
  if (!data) return <section className="card"><h3 style={{ margin: 0 }}>Points & achievements</h3><div className="loading">Loading points…</div></section>;

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Points & achievements</h3>
        <div className="spacer" />
        {data.myTotal !== null ? <span className="badge">My points: {data.myTotal}{data.myRank ? ` (#${data.myRank})` : ""}</span> : null}
      </div>
      {msg ? <p>{msg}</p> : null}
      <h4>{isStaff ? "Achievements (earned counts)" : "My achievements"}</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {data.catalogue.map((a) => {
          const n = data.earned[a.code] ?? 0;
          const on = isStaff ? n > 0 : n > 0;
          return <span key={a.code} className={`badge ${on ? "success" : ""}`} title={a.description}>{a.icon} {a.name}{isStaff ? ` ×${n}` : ""}</span>;
        })}
      </div>
      <h4>Leaderboard {data.leaderboard.enabled ? "" : "(disabled)"}</h4>
      {!data.leaderboard.enabled && !isStaff ? (
        <div className="empty">The leaderboard is disabled for this class.</div>
      ) : !data.leaderboard.entries.length ? (
        <div className="empty">No points yet.</div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Rank</th><th>Student</th><th>Points</th></tr></thead>
          <tbody>
            {data.leaderboard.entries.map((e) => (
              <tr key={`${e.rank}-${e.name}`} style={e.mine ? { background: "#eef2ff" } : undefined}>
                <td>{medal(e.rank)}</td><td>{e.name}</td><td><b>{e.total}</b></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {isManager ? (
        <>
          <h4>Leaderboard settings</h4>
          <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" defaultChecked={data.lbEnabled} onChange={(e) => run(() => updateLeaderboardAction(classId, e.target.checked, data.lbNames), "Leaderboard updated.")} /> Leaderboard enabled
          </label>
          <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" defaultChecked={data.lbNames} onChange={(e) => run(() => updateLeaderboardAction(classId, data.lbEnabled, e.target.checked), "Privacy updated.")} /> Show student names (off = anonymous)
          </label>
          <h4>Point rules</h4>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Name</th><th>Points</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.code}</code></td>
                  <td>{r.name}</td>
                  <td><input className="input" style={{ width: 80 }} type="number" defaultValue={r.points} id={`pts-${r.id}`} /></td>
                  <td><input type="checkbox" defaultChecked={r.active} id={`on-${r.id}`} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn secondary" onClick={() => {
                      const pts = Number((document.getElementById(`pts-${r.id}`) as HTMLInputElement).value);
                      const active = (document.getElementById(`on-${r.id}`) as HTMLInputElement).checked;
                      run(() => updateRuleAction(classId, r.id, { points: pts, active }), "Rule saved.");
                    }}>Save</button>{" "}
                    <button className="btn ghost" onClick={() => { if (confirm("Delete this rule? (Used rules are deactivated instead.)")) run(() => deleteRuleAction(classId, r.id), "Rule removed."); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <RuleForm classId={classId} onDone={(m) => { setMsg(m); router.refresh(); load(); }} />
          <h4>Award points</h4>
          <AwardForm classId={classId} students={data.students} rules={data.rules.filter((r) => r.active)} onDone={(m) => { setMsg(m); router.refresh(); load(); }} />
        </>
      ) : (
        <>
          <h4>How points work here</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {data.rules.map((r) => <span key={r.id} className="badge">{r.name}: +{r.points}</span>)}
          </div>
        </>
      )}
    </section>
  );
}

function RuleForm({ classId, onDone }: { classId: string; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await createRuleAction(classId, { code: String(fd.get("code") ?? ""), name: String(fd.get("name") ?? ""), points: Number(fd.get("points") ?? 0) });
      onDone("Rule added.");
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 8 }}>
      <div className="grid cols-3">
        <label className="field">Code<input className="input" name="code" required pattern="[a-z0-9_]{2,40}" placeholder="helpful_peer" /></label>
        <label className="field">Name<input className="input" name="name" required maxLength={80} /></label>
        <label className="field">Points<input className="input" name="points" type="number" required /></label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn secondary" type="submit" disabled={busy}>Add rule</button>
        <button className="btn ghost" type="button" onClick={async () => {
          try { await restoreDefaultsAction(classId); onDone("Defaults restored."); } catch (e) { onDone(e instanceof Error ? e.message : "Failed."); }
        }}>Restore defaults</button>
        <button className="btn ghost" type="button" onClick={async () => {
          if (!confirm("Reset ALL points in this class?")) return;
          try { const { resetPointsAction } = await import("./game-actions"); await resetPointsAction(classId); onDone("Points reset."); } catch (e) { onDone(e instanceof Error ? e.message : "Failed."); }
        }}>Reset class points</button>
      </div>
    </form>
  );
}

function AwardForm({ classId, students, rules, onDone }: { classId: string; students: { user_id: string; name: string }[]; rules: { id: string; name: string; points: number }[]; onDone: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const ruleId = String(fd.get("rule") ?? "");
      const body: { user_id: string; rule_id?: string; points?: number; reason?: string } = {
        user_id: String(fd.get("who") ?? ""), reason: String(fd.get("reason") ?? ""),
      };
      if (ruleId) body.rule_id = ruleId; else body.points = Number(fd.get("pts") ?? 0);
      const { total } = await awardPointsAction(classId, body);
      onDone(`Awarded. Total: ${total}.`);
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 8 }}>
      <div className="grid cols-3">
        <label className="field">Student
          <select className="input" name="who">{students.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}</select>
        </label>
        <label className="field">Rule
          <select className="input" name="rule" defaultValue="">
            <option value="">Custom</option>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.points})</option>)}
          </select>
        </label>
        <label className="field">Custom points<input className="input" name="pts" type="number" placeholder="e.g. 5" /></label>
      </div>
      <label className="field">Reason<input className="input" name="reason" maxLength={300} /></label>
      <div><button className="btn secondary" type="submit" disabled={busy}>{busy ? "Awarding…" : "Award"}</button></div>
    </form>
  );
}
