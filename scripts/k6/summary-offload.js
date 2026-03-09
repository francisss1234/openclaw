import { check, sleep } from "k6";
import http from "k6/http";

export const options = {
  vus: 100,
  duration: "10m",
  thresholds: {
    http_req_duration: ["p(95)<300"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const baseUrl = __ENV.OPENCLAW_CHAT_ENDPOINT ?? "http://127.0.0.1:18789/api/chat";
  const token = __ENV.OPENCLAW_GATEWAY_TOKEN ?? "";
  const payload = JSON.stringify({
    user_id: `k6-user-${__VU}-${__ITER}`,
    text: "ping",
  });
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = http.post(baseUrl, payload, { headers });
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(1);
}
