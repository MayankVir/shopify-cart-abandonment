"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `delayMs`, but only while the browser tab is visible.
 *
 * Background tabs never poll, which is the main source of wasted database
 * egress (an idle dashboard tab otherwise hits the DB all day). When the tab
 * becomes visible again the callback runs immediately if the data is older
 * than `delayMs`.
 *
 * Pass `delayMs = null` to disable polling.
 */
export function useVisibleInterval(
  callback: () => void,
  delayMs: number | null
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (delayMs == null) return;

    let lastRun = Date.now();

    const run = () => {
      lastRun = Date.now();
      callbackRef.current();
    };

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      run();
    }, delayMs);

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun >= delayMs) run();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [delayMs]);
}
