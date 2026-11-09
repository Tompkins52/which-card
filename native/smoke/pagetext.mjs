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

const sockets = sh("adb shell cat /proc/net/unix").split("\n").map((l) => l.trim().split(/\s+/).pop() || "").filter((n) => n.startsWith("@webview_devtools_remote_"));
if (!sockets.length) { console.error("no WebView devtools socket"); process.exit(2); }
let out = null;
for (const s of sockets) {
  const name = s.slice(1);
  try {
    sh(`adb forward tcp:9333 localabstract:${name}`);
    const list = JSON.parse(await (await fetch("http://127.0.0.1:9333/json")).text());
    const page = list.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
    if (!page) continue;
    out = await new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 20000);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id !== 1) return;
        clearTimeout(t); ws.close();
        if (d.result && d.result.exceptionDetails) { reject(new Error("page threw: " + JSON.stringify(d.result.exceptionDetails.exception || d.result.exceptionDetails.text))); return; }
        const r = d.result && d.result.result;
        resolve(r ? (r.value === undefined ? r.description || "" : r.value) : "");
      };
      ws.onerror = (e) => { clearTimeout(t); reject(e); };
    });
    if (out !== null) break;
  } catch (e) { console.error("devtools: " + e.message); }
}
if (out === null) process.exit(2);
console.log(typeof out === "string" ? out : JSON.stringify(out));
