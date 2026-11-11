// 測試機排程：測試機主檔、測試預約、撞期與使用規則。
import { formatIso } from "./planner-domain";
import type { TestBooking, TestMachine, TestMachineKind } from "./planner-types";
import { isWorkday, shiftWorkdays } from "./workload";

export const MACHINE_KINDS: TestMachineKind[] = ["實體機台", "桌機", "開發用機"];
export const IPC_OPTIONS = ["艾訊", "Quixant"];
export const BOOKING_ROUNDS = ["規則測試", "R1", "R2", "R3", "R4", "Prod", "合併測試", "升級測試", "開發"];
export const BOOKING_STATUSES = ["待佈署", "測試中", "完成", "取消"] as const;
// 一定要在實體機台跑的輪次（遊戲最終在實體機台運行）
export const FINAL_ROUNDS = new Set(["Prod", "合併測試", "升級測試"]);

export const DEFAULT_TEST_MACHINES: TestMachine[] = [
  { id: "machine-real-1", name: "實體機台 1", kind: "實體機台", ipc: "", floor: "", host: "", billAcceptor: "", status: "可用" },
  { id: "machine-real-2", name: "實體機台 2", kind: "實體機台", ipc: "", floor: "", host: "", billAcceptor: "", status: "可用" },
  { id: "machine-real-3", name: "實體機台 3", kind: "實體機台", ipc: "", floor: "", host: "", billAcceptor: "", status: "可用" },
  ...[1, 2, 3, 4, 5].map((index) => ({
    id: `machine-pc-${index}`,
    name: `桌機 ${index}`,
    kind: "桌機" as const,
    ipc: "",
    floor: "",
    host: "",
    billAcceptor: "",
    status: "可用" as const,
  })),
];

const text = (value: unknown) => String(value ?? "").trim();
const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export function normalizeTestMachines(values: unknown, fallback: TestMachine[]): TestMachine[] {
  if (!Array.isArray(values)) return fallback;
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = (value ?? {}) as Record<string, unknown>;
    const id = text(item.id);
    const name = text(item.name);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const kind = MACHINE_KINDS.includes(item.kind as TestMachineKind) ? (item.kind as TestMachineKind) : "桌機";
    return [
      {
        id,
        name,
        kind,
        ipc: text(item.ipc),
        floor: text(item.floor),
        host: text(item.host),
        billAcceptor: text(item.billAcceptor),
        status: item.status === "維修中" ? ("維修中" as const) : ("可用" as const),
      },
    ];
  });
}

export function normalizeTestBookings(values: unknown): TestBooking[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = (value ?? {}) as Record<string, unknown>;
    const id = text(item.id);
    const machineId = text(item.machineId);
    const startDate = text(item.startDate);
    const finishDate = text(item.finishDate);
    if (!id || !machineId || !isIso(startDate) || !isIso(finishDate) || seen.has(id)) return [];
    seen.add(id);
    const status = BOOKING_STATUSES.includes(item.status as TestBooking["status"]) ? (item.status as TestBooking["status"]) : "待佈署";
    return [
      {
        id,
        machineId,
        epicIds: Array.isArray(item.epicIds) ? item.epicIds.map(text).filter(Boolean) : [],
        round: text(item.round) || "R1",
        item: text(item.item),
        versionSet: text(item.versionSet),
        qa: text(item.qa),
        startDate,
        finishDate: finishDate < startDate ? startDate : finishDate,
        status,
        taskRef: text(item.taskRef),
        note: text(item.note),
      },
    ];
  });
}

const active = (booking: TestBooking) => booking.status !== "取消";

// 同一台機器時段重疊的預約（取消的不算）
export function findConflicts(bookings: TestBooking[]) {
  const conflicts = new Set<string>();
  const byMachine = new Map<string, TestBooking[]>();
  for (const booking of bookings.filter(active)) {
    byMachine.set(booking.machineId, [...(byMachine.get(booking.machineId) ?? []), booking]);
  }
  for (const list of byMachine.values()) {
    const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length && sorted[j].startDate <= sorted[i].finishDate; j += 1) {
        conflicts.add(sorted[i].id);
        conflicts.add(sorted[j].id);
      }
    }
  }
  return conflicts;
}

// 依使用規則給提醒（不阻擋）
export function bookingWarnings(booking: Pick<TestBooking, "machineId" | "round">, machines: TestMachine[]) {
  const machine = machines.find((item) => item.id === booking.machineId);
  if (!machine) return [];
  const warnings: string[] = [];
  if (machine.status === "維修中") warnings.push(`${machine.name} 目前維修中。`);
  if (machine.kind === "開發用機") warnings.push("開發用機是工程師開發用的，借用前請先和工程師確認（最後備案）。");
  if (machine.kind !== "實體機台" && FINAL_ROUNDS.has(booking.round)) {
    warnings.push(`${booking.round} 屬於最終測試，遊戲在實體機台運行，請改排實體機台。`);
  }
  return warnings;
}

// 插單：某台機器從指定日起的預約一起往後推 N 個工作日
export function pushBookings(bookings: TestBooking[], machineId: string, fromIso: string, workdays: number, holidayDates: Set<string>) {
  const moved: TestBooking[] = [];
  const next = bookings.map((booking) => {
    if (booking.machineId !== machineId || !active(booking) || booking.status === "完成" || booking.startDate < fromIso) return booking;
    const shifted = {
      ...booking,
      startDate: shiftWorkdays(booking.startDate, workdays, holidayDates),
      finishDate: shiftWorkdays(booking.finishDate, workdays, holidayDates),
    };
    moved.push(shifted);
    return shifted;
  });
  return { bookings: next, moved };
}

const ROUND_ORDER = ["R1", "R2", "R3", "R4"];

// 出測有問題開下一輪：複製成下一筆，接在上一輪結束後的下一個工作日，工期相同
export function nextRoundBooking(booking: TestBooking, holidayDates: Set<string>, newId: string): TestBooking {
  const roundIndex = ROUND_ORDER.indexOf(booking.round);
  const round = roundIndex >= 0 && roundIndex < ROUND_ORDER.length - 1 ? ROUND_ORDER[roundIndex + 1] : booking.round;
  let length = 0;
  for (let current = new Date(`${booking.startDate}T00:00:00`); formatIso(current) <= booking.finishDate; current.setDate(current.getDate() + 1)) {
    if (isWorkday(current, holidayDates)) length += 1;
  }
  const startDate = shiftWorkdays(booking.finishDate, 1, holidayDates);
  const finishDate = shiftWorkdays(startDate, Math.max(0, length - 1), holidayDates);
  return { ...booking, id: newId, round, startDate, finishDate, status: "待佈署" };
}
