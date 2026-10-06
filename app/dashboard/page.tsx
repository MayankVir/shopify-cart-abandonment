import { redirect } from "next/navigation";
import {
  getDashboardAccess,
  workspaceHome,
} from "@/lib/dashboard-access";

export default async function DashboardPage() {
  const access = await getDashboardAccess();
  if (!access) redirect("/sign-in");
  redirect(workspaceHome(access));
}
