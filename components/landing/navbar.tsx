import { auth } from "@clerk/nextjs/server";
import { SiteHeader } from "@/components/landing/site-header";

export async function Navbar() {
  const { userId } = await auth();
  return <SiteHeader signedIn={Boolean(userId)} />;
}
