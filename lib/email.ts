import nodemailer from "nodemailer";
import { Resend } from "resend";
import { captureError } from "@/lib/log";

// One email sender, no custom domain required. Order of preference:
//   1) Gmail SMTP  — send from your @gmail to ANY recipient with just an app
//      password (no domain to own or verify). Best zero-cost option.
//   2) Resend      — needs a verified domain to reach arbitrary recipients;
//      falls back to onboarding@resend.dev (account owner only) otherwise.
//   3) none        — no-op; the app still shows tickets in-app + Stripe receipt.

const ONBOARDING = "Tripcraft <onboarding@resend.dev>";

function errMsg(e: unknown): string {
  const o = e as { message?: string };
  return o?.message ?? (typeof e === "string" ? e : JSON.stringify(e));
}

export type SendResult = { sent: boolean; via?: string; reason?: string };
export type Attachment = { filename: string; content: Buffer };

export async function sendEmail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: Attachment[] }): Promise<SendResult> {
  const gUser = process.env.GMAIL_USER;
  const gPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;

  // 1) Gmail SMTP — works for any recipient, no domain needed.
  if (gUser && gPass) {
    try {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: gUser, pass: gPass.replace(/\s+/g, "") },
      });
      await transport.sendMail({ from: `Tripcraft <${gUser}>`, to, subject, html, attachments });
      return { sent: true, via: "gmail" };
    } catch (e) {
      captureError("email_gmail_failed", e);
      // fall through to Resend if available
    }
  }

  // 2) Resend.
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.RESEND_FROM || ONBOARDING;
    const resend = new Resend(key);
    try {
      let { error } = await resend.emails.send({ from, to, subject, html, attachments });
      if (error && from !== ONBOARDING && /not verified|domain/i.test(errMsg(error))) {
        ({ error } = await resend.emails.send({ from: ONBOARDING, to, subject, html, attachments }));
      }
      if (error) { captureError("email_resend_failed", error); return { sent: false, via: "resend", reason: errMsg(error) }; }
      return { sent: true, via: "resend" };
    } catch (e) {
      captureError("email_resend_error", e);
      return { sent: false, via: "resend", reason: errMsg(e) };
    }
  }

  return { sent: false, reason: "no_email_provider" };
}
