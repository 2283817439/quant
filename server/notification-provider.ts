export type NotificationChannel = "in_app" | "email" | "sms";
export type NotificationLevel = "info" | "warning" | "critical";

export type ProviderSendRequest = {
  channel: NotificationChannel;
  level: NotificationLevel;
  title: string;
  message: string;
  target?: string;
};

export type ProviderSendResult = {
  ok: boolean;
  provider: string;
  providerMessage: string;
};

type EmailProviderType = "resend" | "webhook" | "disabled";
type SmsProviderType = "twilio" | "webhook" | "disabled";

type ProviderConfig = {
  timeoutMs: number;
  emailProvider: EmailProviderType;
  smsProvider: SmsProviderType;

  // Resend
  resendApiKey: string;
  resendFrom: string;
  resendDefaultTo: string;

  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFrom: string;
  twilioDefaultTo: string;

  // Webhook fallback
  emailWebhookUrl: string;
  smsWebhookUrl: string;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

function asPositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEmailProvider(value: string): EmailProviderType {
  if (value === "resend" || value === "webhook") {
    return value;
  }
  return "disabled";
}

function parseSmsProvider(value: string): SmsProviderType {
  if (value === "twilio" || value === "webhook") {
    return value;
  }
  return "disabled";
}

function loadConfig(): ProviderConfig {
  return {
    timeoutMs: asPositiveInt(env("ALERT_PROVIDER_TIMEOUT_MS"), 8000),
    emailProvider: parseEmailProvider(env("ALERT_EMAIL_PROVIDER", "disabled")),
    smsProvider: parseSmsProvider(env("ALERT_SMS_PROVIDER", "disabled")),

    resendApiKey: env("ALERT_RESEND_API_KEY"),
    resendFrom: env("ALERT_RESEND_FROM"),
    resendDefaultTo: env("ALERT_RESEND_DEFAULT_TO"),

    twilioAccountSid: env("ALERT_TWILIO_ACCOUNT_SID"),
    twilioAuthToken: env("ALERT_TWILIO_AUTH_TOKEN"),
    twilioFrom: env("ALERT_TWILIO_FROM"),
    twilioDefaultTo: env("ALERT_TWILIO_DEFAULT_TO"),

    emailWebhookUrl: env("ALERT_EMAIL_WEBHOOK_URL"),
    smsWebhookUrl: env("ALERT_SMS_WEBHOOK_URL"),
  };
}

function splitTargets(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTargets(target: string | undefined, fallbackTarget: string): string[] {
  const merged = [target ?? "", fallbackTarget].filter(Boolean).join(",");
  return Array.from(new Set(splitTargets(merged)));
}

function normalizeSmsTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }
  return `+${digits}`;
}

async function doFetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaResend(config: ProviderConfig, req: ProviderSendRequest): Promise<ProviderSendResult> {
  if (!config.resendApiKey || !config.resendFrom) {
    return {
      ok: false,
      provider: "resend",
      providerMessage: "ALERT_RESEND_API_KEY 或 ALERT_RESEND_FROM 未配置",
    };
  }

  const toList = resolveTargets(req.target, config.resendDefaultTo);
  if (toList.length === 0) {
    return {
      ok: false,
      provider: "resend",
      providerMessage: "邮件接收目标为空",
    };
  }

  const payload = {
    from: config.resendFrom,
    to: toList,
    subject: `[${req.level.toUpperCase()}] ${req.title}`,
    text: `${req.title}\n\n${req.message}`,
  };

  const response = await doFetchJson(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    config.timeoutMs
  );

  return {
    ok: response.ok,
    provider: "resend",
    providerMessage: response.ok
      ? "邮件发送成功"
      : `Resend API 错误(${response.status}): ${typeof response.body === "string" ? response.body : JSON.stringify(response.body)}`,
  };
}

async function sendViaTwilio(config: ProviderConfig, req: ProviderSendRequest): Promise<ProviderSendResult> {
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFrom) {
    return {
      ok: false,
      provider: "twilio",
      providerMessage: "Twilio 凭据未完整配置",
    };
  }

  const toList = resolveTargets(req.target, config.twilioDefaultTo)
    .map((item) => normalizeSmsTarget(item))
    .filter(Boolean);

  if (toList.length === 0) {
    return {
      ok: false,
      provider: "twilio",
      providerMessage: "短信接收目标为空",
    };
  }

  const to = toList[0];
  const body = `[${req.level.toUpperCase()}] ${req.title} - ${req.message}`;

  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");

  const form = new URLSearchParams({
    To: to,
    From: config.twilioFrom,
    Body: body,
  });

  const response = await doFetchJson(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
    config.timeoutMs
  );

  return {
    ok: response.ok,
    provider: "twilio",
    providerMessage: response.ok
      ? "短信发送成功"
      : `Twilio API 错误(${response.status}): ${typeof response.body === "string" ? response.body : JSON.stringify(response.body)}`,
  };
}

async function sendViaWebhook(
  url: string,
  providerName: string,
  config: ProviderConfig,
  req: ProviderSendRequest
): Promise<ProviderSendResult> {
  if (!url) {
    return {
      ok: false,
      provider: providerName,
      providerMessage: `${providerName} webhook URL 未配置`,
    };
  }

  const response = await doFetchJson(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "risk_alert",
        channel: req.channel,
        level: req.level,
        title: req.title,
        message: req.message,
        target: req.target ?? "",
        timestamp: new Date().toISOString(),
      }),
    },
    config.timeoutMs
  );

  return {
    ok: response.ok,
    provider: providerName,
    providerMessage: response.ok
      ? "Webhook 发送成功"
      : `${providerName} webhook 错误(${response.status})`,
  };
}

export async function sendNotification(req: ProviderSendRequest): Promise<ProviderSendResult> {
  if (req.channel === "in_app") {
    return {
      ok: true,
      provider: "in_app",
      providerMessage: "应用内通知已入队",
    };
  }

  const config = loadConfig();

  if (req.channel === "email") {
    switch (config.emailProvider) {
      case "resend":
        return sendViaResend(config, req);
      case "webhook":
        return sendViaWebhook(config.emailWebhookUrl, "email_webhook", config, req);
      default:
        return {
          ok: false,
          provider: "email",
          providerMessage: "邮件供应商未启用（ALERT_EMAIL_PROVIDER）",
        };
    }
  }

  if (req.channel === "sms") {
    switch (config.smsProvider) {
      case "twilio":
        return sendViaTwilio(config, req);
      case "webhook":
        return sendViaWebhook(config.smsWebhookUrl, "sms_webhook", config, req);
      default:
        return {
          ok: false,
          provider: "sms",
          providerMessage: "短信供应商未启用（ALERT_SMS_PROVIDER）",
        };
    }
  }

  return {
    ok: false,
    provider: "unknown",
    providerMessage: "未知通知渠道",
  };
}
