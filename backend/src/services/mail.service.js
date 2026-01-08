import { sendMail as graphSendMail } from "../graphMailer.js";

export async function sendMail(to, subject, html) {
  return graphSendMail(to, subject, html);
}
