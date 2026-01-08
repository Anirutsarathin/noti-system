import fetch from "node-fetch";
import { getMailHost } from "./mail.config.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

async function getAccessToken() {
  const { tenant_id, client_id, client_secret } = await getMailHost();

  const res = await fetch(
    `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("❌ Failed to get access token");
  }

  return data.access_token;
}

export async function sendMail(to, subject, html) {
  const token = await getAccessToken();
  const { from_user } = await getMailHost();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${from_user}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}
