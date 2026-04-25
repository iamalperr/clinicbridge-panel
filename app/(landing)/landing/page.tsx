import { redirect } from "next/navigation";

// /landing now lives at "/" — keep this redirect for backward compatibility
export default function LandingRedirect() {
  redirect("/");
}
