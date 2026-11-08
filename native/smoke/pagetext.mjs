// Prints the text of the page open in the app's WebView, through Chrome DevTools remote debugging
// (on in debug builds). Usage: node pagetext.mjs <package>
// Needs: adb on PATH, the app running. Exits 2 when the WebView cannot be reached.
import { execSync } from "node:child_process";

const pkg = process.argv[2] || "com.tompkinssoftwaresystems.witchcard";
const sh = (c) => execSync(c, { encoding: "utf8" });

const sockets = sh("adb shell cat /proc/net/unix").split("\n").map((l) => l.trim().split(/\s+/).pop() || "").filter((n) => n.startsWith("@webview_devtools_remote_"));
if (!sockets.length) { console.error("no WebView devtools socket"); process.exit(2); }
let text = "";
for (const s of sockets) {
  const name = s.slice(1);
  try {
    sh(`adb forward tcp:9333 localabstract:${name}`);
    const list = JSON.parse(await (await fetch("http://127.0.0.1:9333/json")).text());
    const page = list.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
    if (!page) continue;
    text = await new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 15000);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "location.href + '\\n' + document.body.innerText", returnByValue: true } }));
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) { clearTimeout(t); ws.close(); resolve(d.result && d.result.result ? d.result.result.value : ""); } };
      ws.onerror = (e) => { clearTimeout(t); reject(e); };
    });
    if (text) break;
  } catch (e) { console.error("devtools: " + e.message); }
}
if (!text) process.exit(2);
console.log(text);
