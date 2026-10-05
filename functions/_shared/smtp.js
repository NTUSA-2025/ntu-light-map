export async function sendVerificationEmail(env, { to, code }) {
  if (env.DEV_EMAIL_CODE && env.ALLOW_DEV_AUTH === "true") {
    console.log(`Dev email code for ${to}: ${code}`);
    return;
  }

  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error("resend_not_configured");
  }

  const from = env.RESEND_FROM || env.SMTP_FROM || "台大夜間亮度地圖 <no-reply@ntusa.ntu.edu.tw>";
  const subject = "台大夜間亮度地圖驗證碼";
  const text = [
    `你的驗證碼是 ${code}`,
    "",
    "此驗證碼 10 分鐘內有效。",
    "如果不是你本人操作，請忽略這封信。",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
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
