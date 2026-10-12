const MENU_ID = "base64-decode";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "base64decode",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  decodeAndCopy(info.selectionText || "", tab);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "decode-selection" || !tab) return;
  let text = "";
  try {
    text = await getSelectedText(tab);
  } catch {
    await notify(tab, "이 페이지에서는 선택한 텍스트를 읽을 수 없습니다.", false);
    return;
  }
  if (!text.trim()) {
    await notify(tab, "선택된 텍스트가 없습니다.", false);
    return;
  }
  decodeAndCopy(text, tab);
});

// 모든 프레임에서 선택 영역을 찾고, 안 되면 최상위 프레임만 시도
async function getSelectedText(tab) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: readSelection
    });
  } catch {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: readSelection
    });
  }
  const hit = results.find((r) => r.result);
  return hit ? hit.result : "";
}

// input/textarea 안의 선택은 getSelection()에 잡히지 않으므로 따로 처리
function readSelection() {
  const el = document.activeElement;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && typeof el.selectionStart === "number") {
    const s = el.value.substring(el.selectionStart, el.selectionEnd);
    if (s) return s;
  }
  return window.getSelection().toString();
}

async function decodeAndCopy(text, tab) {
  let decoded;
  try {
    decoded = decodeBase64(text);
  } catch (e) {
    await notify(tab, "Base64 디코딩 실패: 올바른 Base64 문자열이 아닙니다.", false);
    return;
  }

  try {
    await copyToClipboard(decoded);
    await notify(tab, "복사됨: " + preview(decoded), true);
  } catch (e) {
    await notify(tab, "클립보드 복사 실패: " + e.message, false);
  }
}

// 공백 제거, URL-safe(-_) 변환, 패딩 보정 후 UTF-8로 디코딩
function decodeBase64(input) {
  let s = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!s || /[^A-Za-z0-9+/=]/.test(s)) throw new Error("invalid");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("invalid");
  s += "=".repeat((4 - (s.length % 4)) % 4);

  const binary = atob(s);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function preview(text) {
  const oneLine = text.replace(/\s+/g, " ");
  return oneLine.length > 60 ? oneLine.slice(0, 60) + "…" : oneLine;
}

// 서비스 워커에는 DOM이 없으므로 offscreen 문서에서 복사
async function copyToClipboard(text) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "디코딩한 텍스트를 클립보드에 복사"
    });
  }
  const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "copy", text });
  if (!res || !res.ok) throw new Error(res && res.error ? res.error : "unknown");
}

// 페이지에 잠깐 토스트 표시, 불가능한 페이지(chrome:// 등)면 아이콘 배지로 대체
async function notify(tab, message, ok) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      func: showToast,
      args: [message, ok]
    });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: ok ? "#2e7d32" : "#c62828" });
    await chrome.action.setBadgeText({ text: ok ? "OK" : "ERR" });
    await chrome.action.setTitle({ title: message });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
  }
}

function showToast(message, ok) {
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    maxWidth: "420px",
    padding: "10px 14px",
    borderRadius: "8px",
    background: ok ? "#2e7d32" : "#c62828",
    color: "#fff",
    font: "14px/1.4 sans-serif",
    boxShadow: "0 4px 12px rgba(0,0,0,.3)",
    wordBreak: "break-all",
    transition: "opacity .3s"
  });
  document.documentElement.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2000);
}
