"use client";

import React, { useState, useEffect, useRef } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import {
  Trash2,
  Eye,
  EyeOff,
  Play,
  Pause,
  Settings,
  Mail,
  Users,
  Terminal,
  Plus,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  Send,
  Clock,
} from "lucide-react";
import { EmailBodyEditor } from "./components/Email.body";

interface Sender {
  id: string;
  email: string;
  password: string;
  weight: number;
  active: boolean;
  name?: string;
  minDelay: number;
  maxDelay: number;
  maxWeight?: number; // configured full weight
  remaining?: number; // runtime remaining weight
  currentWeight?: number; // for UI display of current weight
}

interface Log {
  msg: string;
  type: "info" | "success" | "error" | "warn";
  time: string;
}

// --- Utilities ---

const calculateTimeoutMs = (
  min: number,
  max: number,
  unit: "seconds" | "minutes",
): number => {
  // 1. Convert everything to Seconds first
  let minSec = min;
  let maxSec = max;

  if (unit === "minutes") {
    minSec = min * 60;
    maxSec = max * 60;
  }

  // 2. Ensure Min is not larger than Max (user error protection)
  const actualMin = Math.min(minSec, maxSec);
  const actualMax = Math.max(minSec, maxSec);

  // 3. Randomize
  const randomSeconds = Math.floor(
    Math.random() * (actualMax - actualMin + 1) + actualMin,
  );

  // 4. Return Milliseconds
  return randomSeconds * 1000;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getCurrentTimestamp = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    time: `${hours}:${mins}:${secs}`,
    date,
  };
};

const getRandomDelay = (min: number, max: number): number => {
  // Ensure min isn't larger than max
  const actualMin = Math.min(min, max);
  const actualMax = Math.max(min, max);
  return (
    Math.floor(Math.random() * (actualMax - actualMin + 1) + actualMin) * 1000
  );
};

const selectSenderWeighted = (senders: Sender[]): Sender | null => {
  const active = senders.filter((s) => s.active);
  if (active.length === 0) return null;

  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;

  for (const sender of active) {
    random -= sender.weight;
    if (random <= 0) return sender;
  }

  return active[0];
};

// const getRandomDelay = (min: number, max: number): number => {
//   return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
// };

// --- FIX: ROBUST DATA EXTRACTOR (Handles 'data' AND 'celldata') ---
const extractRowsFromSheet = (sheet: any): string[][] => {
  if (!sheet) return [];
  const rows: string[][] = [];

  // CASE 1: The "data" format (2D Array) - Manual Typing
  if (sheet.data && Array.isArray(sheet.data) && sheet.data.length > 0) {
    sheet.data.forEach((rowData: any[], r: number) => {
      if (!rowData) return;
      if (!rows[r]) rows[r] = [];
      rowData.forEach((cell: any, c: number) => {
        let value = "";
        if (cell !== null && cell !== undefined) {
          value = cell.v ?? cell.m ?? String(cell);
          if (typeof value === "object") value = "";
        }
        rows[r][c] = String(value).trim();
      });
    });
  }
  // CASE 2: The "celldata" format (Sparse Array) - Demo Data
  else if (sheet.celldata && Array.isArray(sheet.celldata)) {
    sheet.celldata.forEach((cell: any) => {
      const r = cell.r;
      const c = cell.c;
      let value = "";
      if (cell.v !== null && cell.v !== undefined) {
        if (typeof cell.v === "object") {
          value = cell.v.v ?? cell.v.m ?? "";
        } else {
          value = String(cell.v);
        }
      }
      if (!rows[r]) rows[r] = [];
      rows[r][c] = String(value).trim();
    });
  }
  return rows.filter((row) => row && row.some((cell) => cell !== ""));
};

// --- MAIN COMPONENT ---

export default function EmailBlaster() {
  const workbookRef = useRef<any>(null);
  const stopRef = useRef(false);

  // --- State ---
  const [senders, setSenders] = useState<Sender[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [replyTo, setReplyTo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [activeTab, setActiveTab] = useState<"senders" | "config">("senders");

  // Config State
  // Note: Min/Max Delay moved to Sender object.
  // These timeouts are for the "Reset" logic only.
  const [minTimeout, setMinTimeout] = useState(30);
  const [maxTimeout, setMaxTimeout] = useState(60);
  const [timeoutUnit, setTimeoutUnit] = useState<"seconds" | "minutes">(
    "seconds",
  );

  const [emailSubject, setEmailSubject] = useState("Hello from our team!");
  const [emailBody, setEmailBody] = useState(
    "<p>Hello,</p><p>We have an exciting opportunity for you!</p>",
  );
  const [isSimulation, setIsSimulation] = useState(false);

  const STARTING_WEIGHT = 10; // or any default value you want
  const sendersRef = useRef<Sender[]>([]);

  const senderWeightsRef = useRef<{ [key: string]: number }>({});
  const [sheetData, setSheetData] = useState<any[]>([
    {
      id: "leads",
      name: "Leads",
      status: 1,
      order: 0,
      celldata: [
        { r: 0, c: 0, v: { v: "Email", bl: 1 } },
        { r: 0, c: 1, v: { v: "Status", bl: 1 } },
        { r: 0, c: 2, v: { v: "Time", bl: 1 } },
        { r: 0, c: 3, v: { v: "Date", bl: 1 } },
        { r: 0, c: 4, v: { v: "Note", bl: 1 } },
      ],
      config: { columnlen: { 0: 260, 1: 120, 2: 120, 3: 120, 4: 300 } },
    },
  ]);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("eb_senders");
    const savedSheet = localStorage.getItem("eb_sheet");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Ensure old data has minDelay/maxDelay
        const migrated = parsed.map((s: any) => ({
          ...s,
          minDelay: s.minDelay || 5,
          maxDelay: s.maxDelay || 15,
          maxWeight: s.maxWeight ?? s.weight ?? 1,
          remaining: s.remaining ?? s.weight ?? 1,
        }));
        setSenders(migrated);
      } catch (e) {
        console.error(e);
      }
    } else {
      setSenders([
        {
          id: "test-1",
          email: process.env.EMAIL || "",
          password: "",
          weight: 1,
          active: true,
          name: "Test Sender",
          minDelay: 5,
          maxDelay: 10,
          maxWeight: 1,
          remaining: 1,
        },
      ]);
    }
    if (savedSheet) {
      try {
        setSheetData(JSON.parse(savedSheet));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("eb_senders", JSON.stringify(senders));

    // Only update the Ref's CONFIGURATION (email, pass, etc),
    // but preserve the runtime currentWeight from the Ref itself if it exists.
    sendersRef.current = senders.map((s) => ({
      ...s,
      currentWeight: senderWeightsRef.current[s.id] ?? s.currentWeight,
    }));
  }, [senders]);
  useEffect(() => {
    localStorage.setItem("eb_sheet", JSON.stringify(sheetData));
  }, [sheetData]);

  const addLog = (msg: string, type: Log["type"] = "info") => {
    const { time } = getCurrentTimestamp();
    setLogs((prev) => [{ msg, type, time }, ...prev].slice(0, 100));
  };

  // Senders
  const addSender = () => {
    const newSenderId = Math.random().toString(36).substr(2, 9);
    setSenders([
      ...senders,
      {
        id: newSenderId,
        email: "",
        password: "",
        weight: 1,
        active: true,
        name: "",
        minDelay: 5, // Default Min
        maxDelay: 15, // Default Max
        maxWeight: 1,
        remaining: 1,
      },
    ]);
  };

  const loadingDemoRef = useRef(false);

  const updateSender = (id: string, updates: Partial<Sender>) => {
    setSenders(
      senders.map((s) => {
        if (s.id !== id) return s;
        // If weight is being updated, also treat it as the new maxWeight and reset remaining
        if (typeof updates.weight === "number") {
          return {
            ...s,
            ...updates,
            maxWeight: updates.weight,
            remaining: updates.weight,
          };
        }
        return { ...s, ...updates };
      }),
    );
  };

  const removeSender = (id: string) => {
    setSenders(senders.filter((s) => s.id !== id));
  };

  // --- Sheet Logic ---
  const onSheetChange = (data: any[]) => {
    setSheetData(data);
    localStorage.setItem("eb_sheet", JSON.stringify(data));
  };

  const loadDemoData = () => {
    // Reset to "celldata" format for demo
    const demoSheet = {
      id: "leads",
      name: "Leads",
      status: 1,
      order: 0,
      celldata: [
        { r: 0, c: 0, v: { v: "Email", bl: 1 } },
        { r: 0, c: 1, v: { v: "Status", bl: 1 } },
        { r: 0, c: 2, v: { v: "Time", bl: 1 } },
        { r: 0, c: 3, v: { v: "Date", bl: 1 } },
        { r: 0, c: 4, v: { v: "Note", bl: 1 } },
        { r: 1, c: 0, v: { v: "safaragak+1@gmail.com" } },
        { r: 1, c: 1, v: { v: "Pending" } },
      ],
      config: { columnlen: { 0: 260, 1: 120, 2: 120, 3: 120, 4: 300 } },
    };
    // Set flag to prevent onSheetChange from overwriting during initialization
    loadingDemoRef.current = true;
    setSheetData([demoSheet]);
    localStorage.setItem("eb_sheet", JSON.stringify([demoSheet]));
    addLog("✓ Demo data loaded (1 test lead)", "success");
    // Validate immediately to show user it worked
    setTimeout(() => {
      const rows = extractRowsFromSheet(demoSheet);
      addLog(
        `📊 Demo verified: ${rows.length - 1} leads ready to send`,
        "info",
      );
    }, 100);
  };

  const validateSheet = () => {
    const rows = extractRowsFromSheet(sheetData[0]);
    addLog(`📊 Sheet analysis: ${rows.length} rows found`, "info");

    if (rows.length <= 1) {
      addLog("❌ No data rows found.", "error");
      return;
    }

    rows.slice(1).forEach((row, i) => {
      addLog(
        `  Row ${i + 1}: ${row[0] || "(empty)"} | ${row[1] || "Pending"}`,
        "info",
      );
    });

    addLog(`✓ Ready to process ${rows.length - 1} leads`, "success");
  };

  // Helper to visually update the sheet (Status/Time)
  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setSheetData((prev) => {
      // Deep copy to ensure state update triggers
      const newSheetData = JSON.parse(JSON.stringify(prev));
      const sheet = newSheetData[0];

      // If we are in "data" mode (2D array)
      if (sheet.data && Array.isArray(sheet.data)) {
        if (!sheet.data[rowIdx]) sheet.data[rowIdx] = [];
        // Preserve existing formatting if possible, just update v
        const existing = sheet.data[rowIdx][colIdx] || {};
        sheet.data[rowIdx][colIdx] = { ...existing, v: value, m: value };
      }
      // If we are in "celldata" mode (Sparse array)
      else {
        if (!sheet.celldata) sheet.celldata = [];
        const idx = sheet.celldata.findIndex(
          (c: any) => c.r === rowIdx && c.c === colIdx,
        );
        if (idx >= 0) {
          sheet.celldata[idx].v = { ...sheet.celldata[idx].v, v: value };
        } else {
          sheet.celldata.push({ r: rowIdx, c: colIdx, v: { v: value } });
        }
      }

      // Save
      localStorage.setItem("eb_sheet", JSON.stringify(newSheetData));
      return newSheetData;
    });
  };

  // --- ENGINE ---
  const getNextSender = (): Sender | null => {
    const activeSenders = senders.filter((s) => s.active);
    if (activeSenders.length === 0) return null;

    // Sort by: Current Weight (Desc) -> Then by Index (Asc)
    activeSenders.sort((a, b) => {
      const weightA = senderWeightsRef.current[a.id] || 0;
      const weightB = senderWeightsRef.current[b.id] || 0;
      return weightB - weightA;
    });

    const topSender = activeSenders[0];
    const topWeight = senderWeightsRef.current[topSender.id] || 0;

    // If highest available weight is 0, ALL are 0
    if (topWeight <= 0) return null;

    return topSender;
  };

  // 3. Performance Fix: Update all 4 cells in ONE render
  const updateRowStatus = (
    rowIdx: number,
    status: string,
    time: string,
    date: string,
    note: string,
  ) => {
    setSheetData((prev) => {
      const newSheetData = JSON.parse(JSON.stringify(prev));
      const sheet = newSheetData[0];

      const updateSingleCell = (r: number, c: number, val: string) => {
        if (sheet.data && Array.isArray(sheet.data)) {
          if (!sheet.data[r]) sheet.data[r] = [];
          const existing = sheet.data[r][c] || {};
          sheet.data[r][c] = { ...existing, v: val, m: val };
        } else {
          if (!sheet.celldata) sheet.celldata = [];
          const idx = sheet.celldata.findIndex(
            (cell: any) => cell.r === r && cell.c === c,
          );
          if (idx >= 0)
            sheet.celldata[idx].v = { ...sheet.celldata[idx].v, v: val };
          else sheet.celldata.push({ r, c, v: { v: val } });
        }
      };

      updateSingleCell(rowIdx, 1, status);
      updateSingleCell(rowIdx, 2, time);
      updateSingleCell(rowIdx, 3, date);
      updateSingleCell(rowIdx, 4, note);

      localStorage.setItem("eb_sheet", JSON.stringify(newSheetData));
      return newSheetData;
    });
  };

  const resetAllWeights = () => {
    // 1. Reset Ref
    senderWeightsRef.current = {};
    sendersRef.current.forEach((s) => {
      senderWeightsRef.current[s.id] = STARTING_WEIGHT;
    });

    // 2. Reset UI State
    setSenders((prev) =>
      prev.map((s) => ({ ...s, currentWeight: STARTING_WEIGHT })),
    );
  };

  const reduceSenderWeight = (senderId: string) => {
    const current = senderWeightsRef.current[senderId] ?? 0;

    if (current > 0) {
      const newVal = current - 1;

      // 1. Update Source of Truth immediately
      senderWeightsRef.current[senderId] = newVal;

      // 2. Update UI (Visuals)
      setSenders((prev) =>
        prev.map((s) => (s.id === senderId ? { ...s, remaining: newVal } : s)),
      );
    }
  };
  const start = async () => {
    if (isProcessing) return;
    if (senders.filter((s) => s.active).length === 0) {
      addLog("❌ No active senders configured", "error");
      return;
    }

    const rows = extractRowsFromSheet(sheetData[0]);
    if (!rows || rows.length <= 1) {
      addLog("❌ No leads to process.", "error");
      return;
    }

    setIsProcessing(true);
    stopRef.current = false;

    // --- CRITICAL FIX: Sync Logic with UI before starting ---
    // We populate the internal Ref using the values currently shown in the UI.
    // If we don't do this, the engine sees "0" weight even if UI shows "10".
    senders.forEach((s) => {
      // Use the 'remaining' value if it exists, otherwise default to 10
      const weightToUse =
        s.remaining !== undefined && s.remaining !== null
          ? s.remaining
          : STARTING_WEIGHT;

      senderWeightsRef.current[s.id] = weightToUse;
    });

    addLog(`🚀 Engine started...`, "info");

    for (let i = 1; i < rows.length; i++) {
      if (stopRef.current) break;

      const email = rows[i] ? rows[i][0] : "";
      const status = rows[i] ? rows[i][1] : "";

      if (!email || !email.includes("@")) continue;
      if (status === "Completed" || status === "Failed") continue;

      let sender = getNextSender();

      // --- LOGIC: Handle Weight Exhaustion (Timeout & Reset) ---
      if (!sender) {
        // USE NEW HELPER HERE
        const timeoutMs = calculateTimeoutMs(
          minTimeout,
          maxTimeout,
          timeoutUnit,
        );

        // Log the exact time so you know it's working
        const displayTime = (timeoutMs / 1000).toFixed(0);
        addLog(
          `⏳ All weights exhausted (0). Waiting ${displayTime}s (${timeoutUnit} mode) to reset...`,
          "warn",
        );

        // Wait
        await delay(timeoutMs);

        // Reset
        resetAllWeights();
        addLog("↻ Timeout complete. Weights reset to 10.", "success");

        // Retry selection
        sender = getNextSender();
        if (!sender) {
          addLog("❌ Error: No senders available even after reset.", "error");
          break;
        }
      }

      // --- LOGIC: Specific Sender Delay ---
      const sMin = Number(sender.minDelay) || 5;
      const sMax = Number(sender.maxDelay) || 15;
      const delayMs = getRandomDelay(sMin, sMax);

      const currentW = senderWeightsRef.current[sender.id];
      addLog(
        `⏳ Sending in ${(delayMs / 1000).toFixed(1)}s (Sender: ${sender.email} | Weight: ${currentW})...`,
        "info",
      );
      await delay(delayMs);

      if (stopRef.current) break;

      const { time, date } = getCurrentTimestamp();

      // --- SEND ---
      if (isSimulation) {
        addLog(`[SIM] ${sender.email} → ${email}`, "success");
        reduceSenderWeight(sender.id);
        updateRowStatus(i, "Completed", time, date, "Simulated");
      } else {
        try {
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: {
                email: sender.email,
                password: sender.password,
                name: sender.name,
              },
              receiver: { email },
              subject: emailSubject,
              html: emailBody,
              replyTo: replyTo || sender.email,
            }),
          });
          const json = await res.json();
          if (json.success) {
            addLog(`✓ Sent to ${email}`, "success");
            reduceSenderWeight(sender.id);
            updateRowStatus(i, "Completed", time, date, "Sent");
          } else {
            throw new Error(json.error);
          }
        } catch (error: any) {
          addLog(`✗ ${email}: ${error.message}`, "error");
          updateRowStatus(i, "Failed", time, date, error.message);
        }
      }
    }
    setIsProcessing(false);
    addLog("✓ Engine finished", "success");
  };
  const stop = () => {
    stopRef.current = true;
    setIsProcessing(false);
    addLog("⏹️ Stop requested", "warn");
  };

  const testDelay = () => {
    addLog("Test delay...", "info");
  };

  const LogIcon = ({ type }: { type: Log["type"] }) => {
    const icons = {
      success: <CheckCircle2 size={14} className="text-emerald-400" />,
      error: <AlertCircle size={14} className="text-rose-400" />,
      warn: <AlertCircle size={14} className="text-amber-400" />,
      info: <Terminal size={14} className="text-blue-400" />,
    };
    return icons[type];
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-6 bg-slate-950 text-slate-200 font-sans">
      <header className="bg-gradient-to-r from-slate-800 to-slate-700 p-3 rounded-2xl border border-slate-700 flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <Send className="text-indigo-400" /> EMAIL SPMER
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Multi-sender weighted distribution engine
          </p>
        </div>
        <button
          onClick={isProcessing ? stop : start}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${isProcessing ? "bg-rose-600 text-white" : "bg-indigo-600 text-white"}`}
        >
          {isProcessing ? (
            <>
              <Pause size={20} /> STOP
            </>
          ) : (
            <>
              <Play size={20} /> START
            </>
          )}
        </button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-grow">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="flex gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setActiveTab("senders")}
              className={`flex-1 py-2 rounded text-sm font-medium ${activeTab === "senders" ? "bg-indigo-600" : "text-slate-400"}`}
            >
              <Users size={14} className="mx-auto" />
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`flex-1 py-2 rounded text-sm font-medium ${activeTab === "config" ? "bg-indigo-600" : "text-slate-400"}`}
            >
              <Settings size={14} className="mx-auto" />
            </button>
          </div>

          {activeTab === "senders" && (
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex-grow flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white">Senders</h2>
                <button
                  onClick={addSender}
                  className="p-2 bg-indigo-600 rounded text-white"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex-grow overflow-y-auto space-y-3">
                {senders.map((sender) => (
                  <div
                    key={sender.id}
                    className="bg-slate-700 p-4 rounded-lg border border-slate-600"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={sender.active}
                        onChange={(e) =>
                          updateSender(sender.id, { active: e.target.checked })
                        }
                        className="w-4 h-4"
                      />
                      <input
                        type="email"
                        value={sender.email}
                        onChange={(e) =>
                          updateSender(sender.id, { email: e.target.value })
                        }
                        placeholder="email@gmail.com"
                        className="flex-grow bg-slate-600 text-white px-3 py-1 rounded text-sm"
                      />
                      <button
                        onClick={() => removeSender(sender.id)}
                        className="p-1 text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Credentials */}
                    <div className="flex gap-2 mb-2">
                      <input
                        type={showPasswords ? "text" : "password"}
                        value={sender.password}
                        onChange={(e) =>
                          updateSender(sender.id, { password: e.target.value })
                        }
                        placeholder="App password"
                        className="flex-grow bg-slate-600 text-white px-3 py-1 rounded text-sm"
                      />
                      <button
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="p-1 text-slate-400"
                      >
                        {showPasswords ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>

                    {/* Configs */}
                    <div className="grid grid-cols-12 gap-2 text-xs">
                      <div className="col-span-12 md:col-span-12">
                        <input
                          type="text"
                          value={sender.name || ""}
                          onChange={(e) =>
                            updateSender(sender.id, { name: e.target.value })
                          }
                          placeholder="Sender Name"
                          className="w-full bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>

                      {/* Weight */}
                      <div className="col-span-4 flex flex-col">
                        <label className="text-slate-400 text-[10px]">
                          Weight
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={
                            sender.remaining ??
                            sender.maxWeight ??
                            sender.weight
                          }
                          onChange={(e) =>
                            updateSender(sender.id, {
                              weight: Number(e.target.value),
                            })
                          }
                          className="bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>

                      {/* Specific Delay */}
                      <div className="col-span-4 flex flex-col">
                        <label className="text-slate-400 text-[10px]">
                          Min(s)
                        </label>
                        <input
                          type="number"
                          value={sender.minDelay}
                          onChange={(e) =>
                            updateSender(sender.id, {
                              minDelay: Number(e.target.value),
                            })
                          }
                          className="bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>
                      <div className="col-span-4 flex flex-col">
                        <label className="text-slate-400 text-[10px]">
                          Max(s)
                        </label>
                        <input
                          type="number"
                          value={sender.maxDelay}
                          onChange={(e) =>
                            updateSender(sender.id, {
                              maxDelay: Number(e.target.value),
                            })
                          }
                          className="bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "config" && (
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex-grow flex flex-col space-y-4">
              {/* Timeout Reset */}
              <div className="border-b border-slate-700 pb-4">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-2">
                  <Clock size={12} /> Weight Reset Timeout
                </label>
                <div className="flex w-full gap-2 items-end mt-1">
                  <input
                    type="number"
                    value={minTimeout}
                    onChange={(e) => setMinTimeout(Number(e.target.value))}
                    placeholder="Min"
                    className="w-[30%] bg-slate-700 text-white px-3 py-2 rounded text-sm"
                  />
                  <input
                    type="number"
                    value={maxTimeout}
                    onChange={(e) => setMaxTimeout(Number(e.target.value))}
                    placeholder="Max"
                    className="w-[30%] bg-slate-700 text-white px-3 py-2 rounded text-sm"
                  />
                  <select
                    value={timeoutUnit}
                    onChange={(e) =>
                      setTimeoutUnit(e.target.value as "seconds" | "minutes")
                    }
                    className="flex-grow bg-slate-700 text-white px-3 py-2 rounded text-sm"
                  >
                    <option value="seconds">Sec</option>
                    <option value="minutes">Min</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Wait time when all senders reach 0 weight.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-3 p-3 bg-slate-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSimulation}
                    onChange={(e) => setIsSimulation(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-slate-300">
                    Simulation Mode
                  </span>
                </label>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400">
                  Reply To
                </label>
                <input
                  type="text"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="optional@domain.com"
                  className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 mb-2 block">
                  HTML Body
                </label>
                <EmailBodyEditor value={emailBody} onChange={setEmailBody} />
                {/* <label className="text-xs font-bold text-slate-400">
                  HTML Body
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={5}
                  className="w-full bg-slate-700 text-white px-3 py-2 rounded mt-1 text-sm font-mono resize-none"
                /> */}
              </div>
            </div>
          )}

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 h-64 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-300">Logs</h3>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-slate-500"
              >
                Clear
              </button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-1 text-xs">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-slate-500 flex-shrink-0">
                    {log.time}
                  </span>
                  <span className="flex-shrink-0">
                    <LogIcon type={log.type} />
                  </span>
                  <span
                    className={`break-all ${log.type === "success" ? "text-emerald-400" : log.type === "error" ? "text-rose-400" : log.type === "warn" ? "text-amber-400" : "text-blue-400"}`}
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Database size={20} className="text-indigo-400" /> Leads
                </h2>
                <p className="text-xs text-slate-500">
                  Email | Status | Time | Date | Note
                </p>
              </div>
              {/* <button
                  onClick={loadDemoData}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 rounded text-sm hover:bg-green-500"
                >
                  <Database size={14} /> Load Demo
                </button> */}
              <button
                onClick={validateSheet}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600 rounded text-sm hover:bg-purple-500"
              >
                <Terminal size={14} /> Validate
              </button>
            </div>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex-grow relative min-h-96">
            <Workbook
              ref={workbookRef}
              data={sheetData}
              onChange={onSheetChange}
              showSheetTabs={true}
              showToolbar={false}
              lang="en"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
