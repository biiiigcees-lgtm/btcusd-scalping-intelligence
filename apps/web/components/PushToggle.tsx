"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub);
    });
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const vapidRes = await fetch("/api/v1/push/vapid");
      const vapid = await vapidRes.json();
      if (!vapid.enabled || !vapid.publicKey) {
        setMsg("Push not configured (missing VAPID key)");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Notification permission denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setEnabled(true);
      setMsg("Notifications on — only gated signals");
    } catch (e) {
      setMsg((e as Error).message || "Failed to enable");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await fetch("/api/v1/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMsg("Notifications off");
    } catch (e) {
      setMsg((e as Error).message || "Failed to disable");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => (enabled ? disable() : enable())}
        className={`text-[11px] rounded-full border px-2.5 py-1 font-medium transition-colors ${
          enabled
            ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-400"
            : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {busy ? "…" : enabled ? "Alerts on" : "Enable alerts"}
      </button>
      {msg ? <span className="text-[10px] text-zinc-600 max-w-[160px] text-right">{msg}</span> : null}
    </div>
  );
}
