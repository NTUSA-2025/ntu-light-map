const DEFAULT_FROM = "台大夜間亮度地圖 <no-reply@ntusa.ntu.edu.tw>";
const INCIDENT_TYPE_LABELS = {
  accident: "夜間事故",
  harassment: "夜間騷擾",
};

async function sendEmail(env, { to, subject, text }) {
  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("resend_not_configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || env.SMTP_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("resend_send_failed", response.status, errorText);
    throw new Error(`resend_failed_${response.status}`);
  }
}

export async function sendVerificationEmail(env, { to, code }) {
  if (env.DEV_EMAIL_CODE && env.ALLOW_DEV_AUTH === "true") {
    console.log(`Dev email code for ${to}: ${code}`);
    return;
  }

  await sendEmail(env, {
    to,
    subject: "台大夜間亮度地圖驗證碼",
    text: [
      `你的驗證碼是 ${code}`,
      "",
      "此驗證碼 10 分鐘內有效。",
      "如果不是你本人操作，請忽略這封信。",
    ].join("\n"),
  });
}

function taipeiTime(sqliteUtc) {
  // D1 stores `datetime('now')` as UTC without a zone suffix.
  const date = new Date(`${String(sqliteUtc).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return String(sqliteUtc);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

export async function sendFollowupNotification(env, { incident, reporterEmail, origin }) {
  const to = env.FOLLOWUP_NOTIFY_EMAIL;
  if (!to) {
    throw new Error("followup_notify_email_not_configured");
  }

  const typeLabel = INCIDENT_TYPE_LABELS[incident.type] || incident.type;
  const text = [
    "有一筆新的安全事件回報，回報者同意學權部後續聯繫關心。",
    "",
    `案件編號：${incident.id}`,
    `事件類型：${typeLabel}`,
    `回報時間：${taipeiTime(incident.created_at)}`,
    `回報區域：${incident.report_hex_id}`,
    `地圖位置：https://www.google.com/maps?q=${incident.lat},${incident.lng}`,
    `回報者信箱：${reporterEmail}`,
    "",
    "事件描述：",
    incident.description || "沒有描述",
    "",
    `回報管理頁面：${origin}/admin.html`,
  ].join("\n");

  if (!env.RESEND_API_KEY && env.ALLOW_DEV_AUTH === "true") {
    console.log(`Dev follow-up notification for ${to}:\n${text}`);
    return;
  }

  await sendEmail(env, {
    to,
    subject: `【夜間亮度地圖】${typeLabel}回報 #${incident.id}，同意後續聯繫`,
    text,
  });
}
