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
  Users,
  Terminal,
  Plus,
  AlertCircle,
  CheckCircle2,
  Database,
  Send,
  Clock,
  BookOpen,
  Download,
  Upload,
  Paperclip,
  X,
} from "lucide-react";
import { EmailBodyEditor } from "./components/Email.body";

interface Sender {
  id: string;
  email: string;
  password: string;
  weight: number;
  active: boolean;
  name?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  minDelay: number;
  maxDelay: number;
  maxWeight?: number; // configured full weight
  remaining?: number; // runtime remaining weight
  currentWeight?: number; // for UI display of current weight
}

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 587;

interface Log {
  msg: string;
  type: "info" | "success" | "error" | "warn";
  time: string;
}

interface SheetCell {
  r: number;
  c: number;
  v: unknown;
}

type WorkbookSheet = React.ComponentProps<typeof Workbook>["data"][number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cellText = (cell: unknown): string => {
  if (cell === null || cell === undefined) return "";
  if (!isRecord(cell)) return String(cell);
  const value = cell.v ?? cell.m;
  return value !== null && typeof value === "object"
    ? ""
    : String(value ?? "").trim();
};

const senderForStorage = (sender: Sender) => ({
  id: sender.id,
  email: sender.email,
  weight: sender.weight,
  active: sender.active,
  name: sender.name,
  smtpHost: sender.smtpHost,
  smtpPort: sender.smtpPort,
  smtpSecure: sender.smtpSecure,
  minDelay: sender.minDelay,
  maxDelay: sender.maxDelay,
  maxWeight: sender.maxWeight,
  remaining: sender.remaining,
  currentWeight: sender.currentWeight,
});

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

const extractRowsFromSheet = (sheet: WorkbookSheet | undefined): string[][] => {
  if (!sheet) return [];
  const rows: string[][] = [];

  if (sheet.data && sheet.data.length > 0) {
    sheet.data.forEach((rowData, r) => {
      if (!rowData) return;
      if (!rows[r]) rows[r] = [];
      rowData.forEach((cell, c) => {
        rows[r][c] = cellText(cell);
      });
    });
  } else if (sheet.celldata) {
    sheet.celldata.forEach((cell) => {
      const r = cell.r;
      const c = cell.c;
      if (!rows[r]) rows[r] = [];
      rows[r][c] = cellText(cell.v);
    });
  }
  while (rows.length && !rows[rows.length - 1].some((cell) => cell !== "")) {
    rows.pop();
  }
  return rows;
};

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_");

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error("The CSV file contains an unclosed quote.");
  return rows;
};

const personalize = (
  template: string,
  values: Record<string, string>,
  escapeHtml: boolean,
) =>
  template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[normalizeHeader(key)] ?? "";
    return escapeHtml
      ? value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
      : value;
  });

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

// --- MAIN COMPONENT ---

export default function EmailBlaster() {
  const stopRef = useRef(false);
  const runLockRef = useRef(false);

  // --- State ---
  const [senders, setSenders] = useState<Sender[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [replyTo, setReplyTo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "senders" | "config" | "instructions"
  >("senders");

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
  const [batchSize, setBatchSize] = useState(10);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  const sendersRef = useRef<Sender[]>([]);

  const senderWeightsRef = useRef<{ [key: string]: number }>({});
  const [sheetData, setSheetData] = useState<WorkbookSheet[]>([
    {
      id: "leads",
      name: "Leads",
      status: 1,
      order: 0,
      celldata: [
        { r: 0, c: 0, v: { v: "Email", bl: 1 } },
        { r: 0, c: 1, v: { v: "First_Name", bl: 1 } },
        { r: 0, c: 2, v: { v: "Last_Name", bl: 1 } },
        { r: 0, c: 3, v: { v: "From_Email", bl: 1 } },
        { r: 0, c: 4, v: { v: "Status", bl: 1 } },
        { r: 0, c: 5, v: { v: "Time", bl: 1 } },
        { r: 0, c: 6, v: { v: "Date", bl: 1 } },
        { r: 0, c: 7, v: { v: "Note", bl: 1 } },
      ],
      config: {
        columnlen: {
          0: 260,
          1: 140,
          2: 140,
          3: 240,
          4: 120,
          5: 120,
          6: 120,
          7: 300,
        },
      },
    },
  ]);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("eb_senders");
    const savedSheet = localStorage.getItem("eb_sheet");
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed))
          throw new Error("Saved senders are invalid.");
        const migrated = parsed.filter(isRecord).map((s) => ({
          id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
          email: typeof s.email === "string" ? s.email : "",
          password: "",
          weight: typeof s.weight === "number" ? s.weight : 1,
          active: typeof s.active === "boolean" ? s.active : true,
          name: typeof s.name === "string" ? s.name : "",
          smtpHost:
            typeof s.smtpHost === "string" && s.smtpHost.trim()
              ? s.smtpHost.trim()
              : DEFAULT_SMTP_HOST,
          smtpPort:
            typeof s.smtpPort === "number" ? s.smtpPort : DEFAULT_SMTP_PORT,
          smtpSecure: typeof s.smtpSecure === "boolean" ? s.smtpSecure : false,
          minDelay: typeof s.minDelay === "number" ? s.minDelay : 5,
          maxDelay: typeof s.maxDelay === "number" ? s.maxDelay : 15,
          maxWeight:
            typeof s.maxWeight === "number"
              ? s.maxWeight
              : typeof s.weight === "number"
                ? s.weight
                : 1,
          remaining:
            typeof s.remaining === "number"
              ? s.remaining
              : typeof s.weight === "number"
                ? s.weight
                : 1,
        }));
        setSenders(migrated);
        localStorage.setItem(
          "eb_senders",
          JSON.stringify(migrated.map(senderForStorage)),
        );
      } catch (e) {
        console.error(e);
      }
    } else {
      // Start empty: the customer adds their own SMTP accounts.
      setSenders([]);
    }
    if (savedSheet) {
      try {
        const parsed: unknown = JSON.parse(savedSheet);
        if (
          !Array.isArray(parsed) ||
          !parsed.every(
            (item) =>
              isRecord(item) &&
              (item.data === undefined || Array.isArray(item.data)) &&
              (item.celldata === undefined || Array.isArray(item.celldata)),
          )
        ) {
          throw new Error("Saved lead sheet is invalid.");
        }
        setSheetData(parsed as WorkbookSheet[]);
      } catch (e) {
        console.error(e);
      }
    }
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    localStorage.setItem(
      "eb_senders",
      JSON.stringify(senders.map(senderForStorage)),
    );

    sendersRef.current = senders.map((s) => ({
      ...s,
      currentWeight: senderWeightsRef.current[s.id] ?? s.currentWeight,
    }));
  }, [senders, storageLoaded]);
  useEffect(() => {
    if (!storageLoaded) return;
    localStorage.setItem("eb_sheet", JSON.stringify(sheetData));
  }, [sheetData, storageLoaded]);

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
        smtpHost: DEFAULT_SMTP_HOST,
        smtpPort: DEFAULT_SMTP_PORT,
        smtpSecure: false,
        minDelay: 5, // Default Min
        maxDelay: 15, // Default Max
        maxWeight: 1,
        remaining: 1,
      },
    ]);
  };

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
  const onSheetChange = (data: WorkbookSheet[]) => {
    setSheetData(data);
    localStorage.setItem("eb_sheet", JSON.stringify(data));
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2)
        throw new Error("The CSV must include a header and at least one lead.");

      const headers = parsed[0].map(normalizeHeader);
      const emailIndex = headers.indexOf("email");
      if (emailIndex < 0) throw new Error("The CSV needs an Email column.");

      for (const required of ["status", "time", "date", "note"]) {
        if (!headers.includes(required)) headers.push(required);
      }

      const statusIndex = headers.indexOf("status");
      const cells = parsed.slice(1).map((sourceRow) => {
        const row = headers.map((header, index) => {
          if (index >= parsed[0].length) return "";
          return sourceRow[index] ?? "";
        });
        if (!row[statusIndex]?.trim()) row[statusIndex] = "Pending";
        return row;
      });
      const celldata = [
        ...headers.map((header, c) => ({
          r: 0,
          c,
          v: { v: header, bl: 1 },
        })),
        ...cells.flatMap((row, r) =>
          row.map((value, c) => ({ r: r + 1, c, v: { v: value } })),
        ),
      ];
      const importedSheet = {
        id: "leads",
        name: "Leads",
        status: 1,
        order: 0,
        celldata,
      };
      setSheetData([importedSheet]);
      addLog(
        `Imported ${cells.length} lead rows from ${file.name}.`,
        "success",
      );
    } catch (error) {
      addLog(
        error instanceof Error ? error.message : "Could not import CSV.",
        "error",
      );
    }
  };

  const downloadCsv = () => {
    const rows = extractRowsFromSheet(sheetData[0]);
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "email-blaster-leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const validateSheet = () => {
    const rows = extractRowsFromSheet(sheetData[0]);
    const headers = (rows[0] ?? []).map(normalizeHeader);
    const emailIndex = headers.indexOf("email");
    if (emailIndex < 0) {
      addLog("The sheet needs an Email column in its first row.", "error");
      return;
    }

    const leads = rows.slice(1).filter((row) => row[emailIndex]?.trim());
    const valid = leads.filter((row) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[emailIndex].trim()),
    );
    addLog(
      `Sheet check: ${valid.length} valid email(s), ${leads.length - valid.length} invalid or incomplete row(s).`,
      valid.length ? "success" : "error",
    );
  };

  // Helper to visually update the sheet (Status/Time)
  // --- ENGINE ---
  const getNextSender = (preferredEmail?: string): Sender | null => {
    const activeSenders = senders.filter(
      (s) =>
        s.active &&
        (!preferredEmail ||
          s.email.trim().toLowerCase() === preferredEmail.toLowerCase()),
    );
    if (activeSenders.length === 0) return null;

    activeSenders.sort((a, b) => {
      const weightA = senderWeightsRef.current[a.id] || 0;
      const weightB = senderWeightsRef.current[b.id] || 0;
      return weightB - weightA;
    });

    return (
      activeSenders.find(
        (sender) => (senderWeightsRef.current[sender.id] ?? 0) > 0,
      ) ?? null
    );
  };

  const updateRowStatus = (
    rowIdx: number,
    status: string,
    time: string,
    date: string,
    note: string,
    headers: string[],
  ) => {
    setSheetData((prev) => {
      const newSheetData = JSON.parse(JSON.stringify(prev));
      const sheet = newSheetData[0];

      const columns = [
        ["status", status],
        ["time", time],
        ["date", date],
        ["note", note],
      ] as const;
      const updateSingleCell = (r: number, c: number, val: string) => {
        if (sheet.data && Array.isArray(sheet.data)) {
          if (!sheet.data[r]) sheet.data[r] = [];
          const existing = sheet.data[r][c] || {};
          sheet.data[r][c] = { ...existing, v: val, m: val };
        } else {
          if (!sheet.celldata) sheet.celldata = [];
          const idx = sheet.celldata.findIndex(
            (cell: SheetCell) => cell.r === r && cell.c === c,
          );
          if (idx >= 0)
            sheet.celldata[idx].v = {
              ...sheet.celldata[idx].v,
              v: val,
            };
          else sheet.celldata.push({ r, c, v: { v: val } });
        }
      };

      columns.forEach(([name, value]) => {
        const index = headers.indexOf(name);
        if (index >= 0) updateSingleCell(rowIdx, index, value);
      });

      localStorage.setItem("eb_sheet", JSON.stringify(newSheetData));
      return newSheetData;
    });
  };

  const resetAllWeights = () => {
    senderWeightsRef.current = {};
    sendersRef.current.forEach((s) => {
      senderWeightsRef.current[s.id] = s.active ? (s.maxWeight ?? s.weight) : 0;
    });

    setSenders((prev) =>
      prev.map((s) => ({
        ...s,
        remaining: s.active ? (s.maxWeight ?? s.weight) : 0,
        currentWeight: s.active ? (s.maxWeight ?? s.weight) : 0,
      })),
    );
  };

  const reduceSenderWeight = (senderId: string) => {
    const current = senderWeightsRef.current[senderId] ?? 0;

    if (current > 0) {
      const newVal = current - 1;

      senderWeightsRef.current[senderId] = newVal;

      setSenders((prev) =>
        prev.map((s) => (s.id === senderId ? { ...s, remaining: newVal } : s)),
      );
    }
  };
  const start = async () => {
    if (runLockRef.current || isProcessing) return;
    const activeSenders = senders.filter((s) => s.active);
    if (activeSenders.length === 0) {
      addLog("❌ No active senders configured", "error");
      return;
    }

    if (!isSimulation && activeSenders.some((s) => !s.email || !s.password)) {
      addLog(
        "Enter an email and app password for every active sender.",
        "error",
      );
      return;
    }

    if (activeSenders.some((s) => !s.smtpHost?.trim())) {
      addLog("Every active sender needs an SMTP host.", "error");
      return;
    }

    const currentSheet: WorkbookSheet = JSON.parse(
      JSON.stringify(sheetData[0]),
    );
    let rows = extractRowsFromSheet(currentSheet);
    if (!rows || rows.length <= 1) {
      addLog("❌ No leads to process.", "error");
      return;
    }

    const headers = (rows[0] ?? []).map(normalizeHeader);
    const originalHeaderCount = headers.length;
    const emailIndex = headers.indexOf("email");
    if (emailIndex < 0) {
      addLog("The sheet needs an Email column in its first row.", "error");
      return;
    }

    for (const column of ["status", "time", "date", "note"]) {
      if (headers.includes(column)) continue;
      const columnIndex = headers.length;
      headers.push(column);
      if (currentSheet.data && Array.isArray(currentSheet.data)) {
        if (!currentSheet.data[0]) currentSheet.data[0] = [];
        currentSheet.data[0][columnIndex] = { v: column, m: column };
      } else {
        currentSheet.celldata ??= [];
        currentSheet.celldata.push({
          r: 0,
          c: columnIndex,
          v: { v: column },
        });
      }
    }
    if (headers.length !== originalHeaderCount) {
      setSheetData((prev) => [currentSheet, ...prev.slice(1)]);
      rows = extractRowsFromSheet(currentSheet);
    }

    const totalBytes = attachments.reduce(
      (total, file) => total + file.size,
      0,
    );
    if (totalBytes > 3 * 1024 * 1024) {
      addLog("Attachments must total 3 MB or less.", "error");
      return;
    }

    runLockRef.current = true;
    stopRef.current = false;
    setIsProcessing(true);
    let encodedAttachments: {
      filename: string;
      contentType: string | undefined;
      content: string;
    }[];
    try {
      encodedAttachments = await Promise.all(
        attachments.map(async (file) => ({
          filename: file.name,
          contentType: file.type || undefined,
          content: toBase64(new Uint8Array(await file.arrayBuffer())),
        })),
      );
    } catch (error) {
      runLockRef.current = false;
      setIsProcessing(false);
      addLog(
        error instanceof Error ? error.message : "Could not read attachments.",
        "error",
      );
      return;
    }

    senders.forEach((s) => {
      senderWeightsRef.current[s.id] = s.remaining ?? s.maxWeight ?? s.weight;
    });

    addLog("Automatic sending started.", "info");
    let page = 1;
    let pageCount = 0;
    let handled = 0;
    const recordHandledRow = () => {
      handled++;
      pageCount++;
      if (pageCount >= Math.max(1, batchSize)) {
        addLog(`Batch ${page} complete (${pageCount} row(s)).`, "info");
        page++;
        pageCount = 0;
      }
    };
    const statusIndex = headers.indexOf("status");
    const firstNameIndex = headers.indexOf("first_name");
    const lastNameIndex = headers.indexOf("last_name");
    const fromEmailIndex = headers.indexOf("from_email");

    try {
      for (let i = 1; i < rows.length; i++) {
        if (stopRef.current) break;

        const row = rows[i] ?? [];
        const email = row[emailIndex]?.trim() ?? "";
        if (!email) continue;

        const status = row[statusIndex]?.trim().toLowerCase() ?? "";
        if (status === "completed" || status === "failed") continue;

        const { time, date } = getCurrentTimestamp();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          updateRowStatus(
            i,
            "Failed",
            time,
            date,
            "Invalid email address",
            headers,
          );
          addLog(`Invalid recipient on sheet row ${i + 1}.`, "error");
          recordHandledRow();
          continue;
        }

        const preferredEmail = row[fromEmailIndex]?.trim();
        let sender = getNextSender(preferredEmail || undefined);
        if (
          preferredEmail &&
          !senders.some(
            (item) =>
              item.active &&
              item.email.trim().toLowerCase() === preferredEmail.toLowerCase(),
          )
        ) {
          updateRowStatus(
            i,
            "Failed",
            time,
            date,
            "From_Email is not an active configured sender",
            headers,
          );
          addLog(
            `No active sender matches ${preferredEmail} for ${email}.`,
            "error",
          );
          recordHandledRow();
          continue;
        }

        if (!sender) {
          const timeoutMs = calculateTimeoutMs(
            minTimeout,
            maxTimeout,
            timeoutUnit,
          );
          addLog(
            `Sender weight exhausted. Waiting ${(timeoutMs / 1000).toFixed(0)}s before resetting weights.`,
            "warn",
          );
          await delay(timeoutMs);
          if (stopRef.current) break;
          resetAllWeights();
          sender = getNextSender(preferredEmail || undefined);
          if (!sender) {
            updateRowStatus(
              i,
              "Failed",
              time,
              date,
              "No available sender",
              headers,
            );
            addLog(`No sender with available weight for ${email}.`, "error");
            recordHandledRow();
            continue;
          }
        }

        const values = Object.fromEntries(
          headers.map((header, index) => [header, row[index]?.trim() ?? ""]),
        );
        values.first_name =
          row[firstNameIndex]?.trim() ?? values.first_name ?? "";
        values.last_name = row[lastNameIndex]?.trim() ?? values.last_name ?? "";
        values.email = email;

        const delayMs = getRandomDelay(
          Number(sender.minDelay) || 5,
          Number(sender.maxDelay) || 15,
        );
        addLog(
          `Batch ${page}: sending to ${email} via ${sender.email} in ${(delayMs / 1000).toFixed(1)}s.`,
          "info",
        );
        updateRowStatus(i, "Sending", time, date, "", headers);
        await delay(delayMs);
        if (stopRef.current) break;

        try {
          if (isSimulation) {
            addLog(`[SIM] ${sender.email} → ${email}`, "success");
            updateRowStatus(i, "Completed", time, date, "Simulated", headers);
          } else {
            const res = await fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: {
                  email: sender.email,
                  password: sender.password,
                  name: sender.name,
                  smtpHost: sender.smtpHost,
                  smtpPort: sender.smtpPort,
                  smtpSecure: sender.smtpSecure,
                },
                receiver: { email },
                subject: personalize(emailSubject, values, false),
                html: personalize(emailBody, values, true),
                replyTo: replyTo || sender.email,
                attachments: encodedAttachments,
              }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(
                json.error || `Email service returned ${res.status}.`,
              );
            }
            addLog(`Sent to ${email}.`, "success");
            updateRowStatus(i, "Completed", time, date, "Sent", headers);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Email delivery failed.";
          addLog(`${email}: ${message}`, "error");
          updateRowStatus(i, "Failed", time, date, message, headers);
        }

        reduceSenderWeight(sender.id);
        recordHandledRow();
      }
    } finally {
      runLockRef.current = false;
      setIsProcessing(false);
      addLog(
        stopRef.current
          ? `Sending stopped. Processed ${handled} row(s).`
          : `Automatic sending finished. Processed ${handled} row(s).`,
        stopRef.current ? "warn" : "success",
      );
    }
  };
  const stop = () => {
    stopRef.current = true;
    addLog("⏹️ Stop requested", "warn");
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
            <Send className="text-indigo-400" /> EMAIL BROADCAST
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Single-page campaign workspace · sends from your own SMTP server
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("instructions")}
            className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            <BookOpen size={18} /> Guide
          </button>
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
        </div>
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
              title="Campaign settings"
            >
              <Settings size={14} className="mx-auto" />
            </button>
            <button
              onClick={() => setActiveTab("instructions")}
              className={`flex-1 py-2 rounded text-sm font-medium ${activeTab === "instructions" ? "bg-indigo-600" : "text-slate-400"}`}
              title="Instructions"
            >
              <BookOpen size={14} className="mx-auto" />
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
                          updateSender(sender.id, {
                            active: e.target.checked,
                          })
                        }
                        className="w-4 h-4"
                      />
                      <input
                        type="email"
                        value={sender.email}
                        onChange={(e) =>
                          updateSender(sender.id, {
                            email: e.target.value,
                          })
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
                          updateSender(sender.id, {
                            password: e.target.value,
                          })
                        }
                        placeholder="SMTP password / app password (session only)"
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
                    <p className="mb-3 text-[10px] text-slate-400">
                      Credentials stay in this browser session only. Sending
                      runs on this PC, so the password never leaves your
                      computer.
                    </p>

                    {/* Configs */}
                    <div className="grid grid-cols-12 gap-2 text-xs">
                      <div className="col-span-12 md:col-span-12">
                        <input
                          type="text"
                          value={sender.name || ""}
                          onChange={(e) =>
                            updateSender(sender.id, {
                              name: e.target.value,
                            })
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
                      {/* SMTP server */}
                      <div className="col-span-7 flex flex-col">
                        <label className="text-slate-400 text-[10px]">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={sender.smtpHost}
                          onChange={(e) =>
                            updateSender(sender.id, {
                              smtpHost: e.target.value,
                            })
                          }
                          placeholder="smtp.gmail.com"
                          className="bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>
                      <div className="col-span-2 flex flex-col">
                        <label className="text-slate-400 text-[10px]">
                          Port
                        </label>
                        <input
                          type="number"
                          value={sender.smtpPort}
                          onChange={(e) =>
                            updateSender(sender.id, {
                              smtpPort: Number(e.target.value),
                            })
                          }
                          className="bg-slate-600 text-white px-2 py-1 rounded"
                        />
                      </div>
                      <div className="col-span-3 flex flex-col justify-end">
                        <label className="flex items-center justify-center gap-1 rounded bg-slate-600 px-2 py-1 text-slate-200">
                          <input
                            type="checkbox"
                            checked={sender.smtpSecure}
                            onChange={(e) =>
                              updateSender(sender.id, {
                                smtpSecure: e.target.checked,
                              })
                            }
                          />
                          SSL
                        </label>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">
                      Gmail: smtp.gmail.com, port 587, SSL off. Custom servers
                      usually use port 465 with SSL on, or 587 with SSL off.
                    </p>
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
                <label className="text-xs font-bold text-slate-400">
                  Batch size
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={batchSize}
                  onChange={(e) =>
                    setBatchSize(
                      Math.min(1000, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                  className="mt-1 w-full rounded bg-slate-700 px-3 py-2 text-sm text-white"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Sends every pending lead automatically, showing progress in
                  groups of this size.
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
                  Attachments
                </label>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-600 bg-slate-700 px-3 py-3 text-sm text-slate-200 hover:bg-slate-600">
                  <Paperclip size={16} />
                  Add files (3 MB total maximum)
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files ?? []);
                      const combined = [...attachments, ...selected];
                      if (
                        combined.reduce((sum, file) => sum + file.size, 0) >
                        3 * 1024 * 1024
                      ) {
                        addLog("Attachments must total 3 MB or less.", "error");
                      } else {
                        setAttachments(combined);
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 text-xs text-slate-300"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                          aria-label={`Remove ${file.name}`}
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
                <p className="mt-1 text-[10px] text-slate-500">
                  Personalize with {"{{first_name}}"}, {"{{last_name}}"}, or
                  another CSV column.
                </p>
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

          {activeTab === "instructions" && (
            <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex-grow space-y-4 text-sm text-slate-300">
              <h2 className="text-lg font-bold text-white">
                How to use Email Blaster
              </h2>
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Import a CSV with an <code>Email</code> column, or edit the
                  Leads sheet directly. First_Name, Last_Name, and From_Email
                  are optional. Missing Status, Time, Date, and Note columns are
                  added automatically.
                </li>
                <li>
                  Add and activate senders. For each one enter the email
                  address, its SMTP password (Gmail needs an app password), the
                  SMTP host, port and SSL setting. Passwords are cleared from
                  saved browser data and must be re-entered for each session.
                </li>
                <li>
                  Use <code>{"{{first_name}}"}</code> and{" "}
                  <code>{"{{last_name}}"}</code> (or any CSV header) in the
                  subject or message to personalize it. From_Email must match an
                  active configured sender.
                </li>
                <li>
                  Choose a batch size and optional files. START processes all
                  pending rows in order, updating status as it goes. Sender
                  weights and per-sender delays are applied; exhausted weights
                  reset after the configured wait.
                </li>
                <li>
                  Use Simulation Mode to verify the workflow without delivering
                  email. Download CSV to export the current sheet and statuses.
                </li>
              </ol>
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-amber-200">
                <strong>Sending requirements:</strong> the app runs on this PC
                and connects straight to each sender&apos;s SMTP server, so the
                computer needs outbound access on port 587 or 465. Gmail:{" "}
                <code>smtp.gmail.com</code>, port <code>587</code>, SSL off.
                Custom servers usually use port <code>465</code> with SSL on.
                Sending limits, SPF/DKIM and app passwords are enforced by the
                mail provider. Attachments are limited to 3 MB total per
                message.
              </div>
              <p className="text-xs text-slate-400">
                Sender settings and leads are stored in this browser&apos;s
                local storage. Passwords are never saved and never leave this
                computer.
              </p>
            </section>
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
                  CSV headers: Email, First_Name, Last_Name, From_Email
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600">
                  <Upload size={14} /> Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      void importCsv(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={downloadCsv}
                  className="flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600"
                >
                  <Download size={14} /> Download CSV
                </button>
                <button
                  onClick={validateSheet}
                  className="flex items-center gap-2 rounded bg-purple-600 px-3 py-2 text-sm hover:bg-purple-500"
                >
                  <Terminal size={14} /> Validate
                </button>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex-grow relative min-h-96">
            <Workbook
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
