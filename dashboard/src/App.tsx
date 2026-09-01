import { useState, useCallback, useRef } from "react";
import type { MitigationState, MitigationEvent } from "./types";
import MonitorView from "./components/MonitorView";
import MitigationView from "./components/MitigationView";
import AuditView from "./components/AuditView";

export default function App() {
  const [screen, setScreen] = useState<MitigationState>("monitoring");
  const [mitigation, setMitigation] = useState<MitigationEvent | null>(null);
  const autoTriggerBlockedRef = useRef(false);

  const onTrigger = useCallback((ev: MitigationEvent) => {
    autoTriggerBlockedRef.current = true;
    setMitigation(ev);
    setScreen("mitigating");
  }, []);

  const onComplete = useCallback((ev: MitigationEvent) => {
    setMitigation(ev);
    setScreen("complete");
  }, []);

  const onReset = useCallback(() => {
    setMitigation(null);
    setScreen("monitoring");
  }, []);

  if (screen === "monitoring") {
    return <MonitorView onTrigger={onTrigger} autoTriggerBlocked={autoTriggerBlockedRef} />;
  }

  if (screen === "mitigating" && mitigation) {
    return <MitigationView event={mitigation} onComplete={onComplete} onBack={onReset} />;
  }

  if (screen === "complete" && mitigation) {
    return <AuditView event={mitigation} onReset={onReset} />;
  }

  return null;
}
