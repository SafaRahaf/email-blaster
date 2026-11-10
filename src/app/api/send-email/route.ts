import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmailAttachment = (value: unknown): value is EmailAttachment =>
  isRecord(value) &&
  typeof value.filename === "string" &&
  value.filename.length > 0 &&
  value.filename.length <= 255 &&
  !/[\u0000\r\n]/.test(value.filename) &&
  typeof value.content === "string" &&
  /^[A-Za-z0-9+/]*={0,2}$/.test(value.content) &&
  (value.contentType === undefined ||
    (typeof value.contentType === "string" &&
      /^[\w.+-]+\/[\w.+-]+$/.test(value.contentType)));

const isEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 587;

// Hostname or IP token only: no scheme, no path, no credentials.
const isSmtpHost = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 253 &&
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(value);

export async function POST(req: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  if (!isRecord(parsedBody)) {
    return NextResponse.json(
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }
  const body = parsedBody;

  const sender = isRecord(body.sender) ? body.sender : undefined;
  const receiver = isRecord(body.receiver) ? body.receiver : undefined;
  const subject = typeof body.subject === "string" ? body.subject : "Hello";
  const html = typeof body.html === "string" ? body.html : "<p>Hello</p>";
  const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : "";
  const attachments = body.attachments ?? [];

  if (
    (body.subject !== undefined && typeof body.subject !== "string") ||
    (body.html !== undefined && typeof body.html !== "string") ||
    (body.replyTo !== undefined && typeof body.replyTo !== "string")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Subject, message, or reply-to fields are invalid.",
      },
      { status: 400 },
    );
  }

  if (
    !isEmail(sender?.email) ||
    typeof sender?.password !== "string" ||
    !sender.password.trim()
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "A valid sender email and app password are required.",
      },
      { status: 400 },
    );
  }

  if (!isEmail(receiver?.email)) {
    return NextResponse.json(
      { success: false, error: "A valid recipient email is required." },
      { status: 400 },
    );
  }

  // Per-sender SMTP server. Gmail stays the default so older clients keep working.
  const smtpHost =
    typeof sender.smtpHost === "string" && sender.smtpHost.trim()
      ? sender.smtpHost.trim()
      : DEFAULT_SMTP_HOST;
  const smtpPort =
    typeof sender.smtpPort === "number" ? sender.smtpPort : DEFAULT_SMTP_PORT;
  const smtpSecure = sender.smtpSecure === true;

  if (!isSmtpHost(smtpHost)) {
    return NextResponse.json(
      { success: false, error: "The SMTP host name is invalid." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return NextResponse.json(
      { success: false, error: "The SMTP port must be between 1 and 65535." },
      { status: 400 },
    );
  }

  if (replyTo && !isEmail(replyTo)) {
    return NextResponse.json(
      { success: false, error: "Reply-to must be a valid email address." },
      { status: 400 },
    );
  }

  if (!Array.isArray(attachments)) {
    return NextResponse.json(
      { success: false, error: "Attachments must be a list of files." },
      { status: 400 },
    );
  }

  if (subject.length > 998 || html.length > 2_000_000) {
    return NextResponse.json(
      {
        success: false,
        error: "The email content or attachments are too large.",
      },
      { status: 413 },
    );
  }

  let attachmentBytes = 0;
  const mailAttachments: nodemailer.SendMailOptions["attachments"] = [];
  for (const value of attachments as unknown[]) {
    if (!isEmailAttachment(value)) {
      return NextResponse.json(
        { success: false, error: "An attachment is invalid." },
        { status: 400 },
      );
    }

    const decoded = Buffer.from(value.content, "base64");
    if (decoded.toString("base64") !== value.content) {
      return NextResponse.json(
        { success: false, error: "An attachment is invalid." },
        { status: 400 },
      );
    }

    attachmentBytes += decoded.byteLength;
    if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { success: false, error: "Attachments must total 3 MB or less." },
        { status: 413 },
      );
    }

    mailAttachments.push({
      filename: value.filename,
      content: decoded,
      contentType:
        typeof value.contentType === "string" ? value.contentType : undefined,
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: sender.email.trim(),
        pass: sender.password.trim().replace(/\s/g, ""),
      },
    });

    const info = await transporter.sendMail({
      from: {
        name: typeof sender.name === "string" ? sender.name : "Team",
        address: sender.email.trim(),
      },
      to: receiver.email.trim(),
      subject,
      html,
      replyTo: replyTo || sender.email.trim(),
      attachments: mailAttachments,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: unknown) {
    console.error("Email delivery failed:", error);
    const code =
      isRecord(error) && typeof error.code === "string" ? error.code : "";
    let userMessage =
      "Email delivery failed. Check the sender settings and try again.";

    if (code === "EAUTH") {
      userMessage = `SMTP authentication failed for ${smtpHost}. Check the address and password (Gmail requires an app password).`;
    } else if (
      code === "ECONNECTION" ||
      code === "ETIMEDOUT" ||
      code === "ESOCKET" ||
      code === "EDNS"
    ) {
      userMessage = `Could not reach ${smtpHost}:${smtpPort}. Check the server name, port, and SSL/TLS setting.`;
    }

    return NextResponse.json(
      { success: false, error: userMessage },
      { status: code === "EAUTH" ? 401 : 502 },
    );
  }
}
