import { useEffect, useState } from "react";
import { Redirect } from "expo-router";

import { adminToken } from "@/src/admin/api";
import { Loading } from "@/src/admin/ui";

export default function AdminEntry() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    adminToken().then((t) => setState(t ? "in" : "out"));
  }, []);
  if (state === "loading") return <Loading label="Opening the panel" />;
  return <Redirect href={state === "in" ? "/admin/overview" : "/admin/login"} />;
}
