import type { ExecutionRecord, Snapshot, GuardianState } from "./types";

interface CliSession {
  startTime: number;
  commandCount: number;
  lastCommandTime: number;
  executions: ExecutionRecord[];
  snapshots: Record<string, Snapshot>;
  guardianState: GuardianState;
  mockMode: boolean;
}

let session: CliSession = createFresh();

function createFresh(): CliSession {
  return {
    startTime: Date.now(),
    commandCount: 0,
    lastCommandTime: Date.now(),
    executions: [],
    snapshots: {},
    guardianState: { enabled: false, blocked: false, threshold: 1.05, target: 1.1 },
    mockMode: false,
  };
}

export function resetSession(): void {
  session = createFresh();
}

export function getSession(): Readonly<CliSession> {
  return session;
}

export function updateSession(partial: Partial<CliSession>): void {
  Object.assign(session, partial);
}

export function incrementCommandCount(): void {
  session.commandCount++;
  session.lastCommandTime = Date.now();
}

export function getSnapshot(id: string): Snapshot | undefined {
  return session.snapshots[id];
}

export function addSnapshot(snap: Snapshot): void {
  session.snapshots[snap.id] = snap;
}

export function listSnapshots(): Snapshot[] {
  return Object.values(session.snapshots).sort((a, b) => b.timestamp - a.timestamp);
}

export function addExecutionRecord(rec: ExecutionRecord): void {
  session.executions.push(rec);
}

export function getExecutionRecords(): ExecutionRecord[] {
  return [...session.executions];
}

export function getGuardianState(): GuardianState {
  return { ...session.guardianState };
}

export function setGuardianState(state: Partial<GuardianState>): void {
  session.guardianState = { ...session.guardianState, ...state };
}

export function setMockMode(active: boolean): void {
  session.mockMode = active;
}

export function isMockMode(): boolean {
  return session.mockMode;
}
