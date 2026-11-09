// Reads the page open in the app's WebView through Chrome DevTools remote debugging (on in debug builds).
//   node pagetext.mjs <package>                 prints the page's URL and text
//   node pagetext.mjs <package> --eval <expr>   prints the value of a JavaScript expression run in the page
// Needs: adb on PATH, the app running. Exits 2 when the WebView cannot be reached.
// uiautomator cannot see inside a WebView, which is why this exists.
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const pkg = args[0] && !args[0].startsWith("--") ? args[0] : "com.tompkinssoftwaresystems.witchcard";
const evalAt = args.indexOf("--eval");
const expression = evalAt >= 0 ? args.slice(evalAt + 1).join(" ") : "location.href + '\\n' + document.body.innerText";
const sh = (c) => execSync(c, { encoding: "utf8" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Asks the page once. A WebView takes one debugging client at a time, and the previous run of this script may
// not have let go yet when the next one starts, so the caller retries a refused connection.
async function ask(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 20000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id !== 1) return;
      clearTimeout(t); ws.close();
      if (d.result && d.result.exceptionDetails) { reject(Object.assign(new Error("page threw: " + JSON.stringify(d.result.exceptionDetails.exception || d.result.exceptionDetails.text)), { fromPage: true })); return; }
      const r = d.result && d.result.result;
      resolve(r ? (r.value === undefined ? r.description || "" : r.value) : "");
    };
    ws.onerror = (e) => { clearTimeout(t); reject(new Error(e && e.message ? e.message : "websocket error")); };
  });
}

let out = null, lastError = "no WebView devtools socket";
for (let attempt = 1; attempt <= 8 && out === null; attempt++) {
  if (attempt > 1) await sleep(500 * attempt);
  const sockets = sh("adb shell cat /proc/net/unix").split("\n").map((l) => l.trim().split(/\s+/).pop() || "").filter((n) => n.startsWith("@webview_devtools_remote_"));
  for (const s of sockets) {
    const name = s.slice(1);
    try {
      sh(`adb forward tcp:9333 localabstract:${name}`);
      const list = JSON.parse(await (await fetch("http://127.0.0.1:9333/json")).text());
      const pages = list.filter((p) => p.type === "page" && p.webSocketDebuggerUrl);
      if (!pages.length) { lastError = "no page in the WebView"; continue; }
      for (const page of pages) {
        try { out = await ask(page); break; }
        catch (e) { lastError = e.message; if (e.fromPage) { console.error("devtools: " + e.message); process.exit(2); } }
      }
      if (out !== null) break;
    } catch (e) { lastError = e.message; }
  }
}
if (out === null) { console.error("devtools: " + lastError); process.exit(2); }
console.log(typeof out === "string" ? out : JSON.stringify(out));
