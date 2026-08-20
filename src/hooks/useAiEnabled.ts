import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useAiEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api
      .get<{ enabled: boolean }>("/ai/config")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);
  return enabled;
}
