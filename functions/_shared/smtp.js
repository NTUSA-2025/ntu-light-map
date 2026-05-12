import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readResponse(reader) {
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("smtp_connection_closed");
    text += decoder.decode(value, { stream: true });

    const lines = text.split(/\r?\n/).filter(Boolean);
    const last = lines.at(-1);
    if (last && /^\d{3} /.test(last)) {
      const code = Number(last.slice(0, 3));
      return { code, text };
    }
  }
}

async function command(reader, writer, line, expected) {
  await writer.write(encoder.encode(`${line}\r\n`));
  const response = await readResponse(reader);
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw new Error(`smtp_${line.split(" ")[0].toLowerCase()}_${response.code}`);
  }
  return response;
}

function base64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function escapeHeader(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function dotStuff(value) {
  return value.replace(/^\./gm, "..");
}

export async function sendVerificationEmail(env, { to, code }) {
  if (env.DEV_EMAIL_CODE && env.ALLOW_DEV_AUTH === "true") {
    console.log(`Dev email code for ${to}: ${code}`);
    return;
  }

  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM || env.SMTP_USER;

  if (!user || !pass || !from) {
    throw new Error("smtp_not_configured");
  }

  const socket = connect({ hostname: host, port }, { secureTransport: "on" });
  await socket.opened;

  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  try {
    let response = await readResponse(reader);
    if (response.code !== 220) throw new Error(`smtp_greeting_${response.code}`);

    await command(reader, writer, "EHLO ntu-light-map", 250);
    await command(reader, writer, "AUTH LOGIN", 334);
    await command(reader, writer, base64(user), 334);
    await command(reader, writer, base64(pass), 235);
    await command(reader, writer, `MAIL FROM:<${from}>`, 250);
    await command(reader, writer, `RCPT TO:<${to}>`, [250, 251]);
    await command(reader, writer, "DATA", 354);

    const subject = "台大夜間亮度地圖驗證碼";
    const text = [
      `你的驗證碼是 ${code}`,
      "",
      "此驗證碼 10 分鐘內有效。",
      "如果不是你本人操作，請忽略這封信。",
    ].join("\r\n");
    const message = [
      `From: 台大夜間亮度地圖 <${escapeHeader(from)}>`,
      `To: ${escapeHeader(to)}`,
      `Subject: =?UTF-8?B?${base64(subject)}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      dotStuff(text),
      ".",
    ].join("\r\n");

    await writer.write(encoder.encode(`${message}\r\n`));
    response = await readResponse(reader);
    if (response.code !== 250) throw new Error(`smtp_data_${response.code}`);
    await command(reader, writer, "QUIT", 221);
  } finally {
    writer.releaseLock();
    reader.releaseLock();
    socket.close();
  }
}
