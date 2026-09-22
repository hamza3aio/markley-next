import type { Viewer } from "@/lib/auth";

export function can(viewer: Viewer, key: string): boolean {
  return viewer.permissions.includes(key);
}

export function isAdmin(viewer: Viewer): boolean {
  return viewer.profile.role === "admin";
}
