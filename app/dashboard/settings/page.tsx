import { requireViewer } from "@/lib/auth";
import { SettingsForm } from "./form";

export default async function SettingsPage() {
  const viewer = await requireViewer();
  return (
    <SettingsForm
      profile={{
        full_name: viewer.profile.full_name,
        theme: viewer.profile.theme,
        email_notifications: viewer.profile.email_notifications,
      }}
    />
  );
}
