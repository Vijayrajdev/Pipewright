"use client";

import { useEffect, useState } from "react";
import { fetchAiStatus, type AiStatus } from "./store";

export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus & { loading: boolean }>({
    enabled: false,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    fetchAiStatus().then((s) => alive && setStatus({ ...s, loading: false }));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
