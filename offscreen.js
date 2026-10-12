chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen" || msg.type !== "copy") return;
  try {
    const buf = document.getElementById("buf");
    buf.value = msg.text;
    buf.select();
    const ok = document.execCommand("copy");
    sendResponse(ok ? { ok: true } : { ok: false, error: "execCommand 실패" });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
});
