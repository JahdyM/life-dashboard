"use client";

import { useEffect, useRef } from "react";

const TRAIL_COUNT = 14;

type Point = { x: number; y: number };

export default function AtomCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const trailRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const mouse = useRef<Point>({ x: 0, y: 0 });
  const points = useRef<Point[]>(
    Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: 0 }))
  );
  const rafId = useRef<number | null>(null);
  const isPressed = useRef(false);
  const isMounted = useRef(false);
  const isVisible = useRef(false);

  useEffect(() => {
    const canUseCustomCursor =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!canUseCustomCursor) return;

    isMounted.current = true;
    isVisible.current = false;

    const setCursorVisibility = (show: boolean) => {
      if (!cursorRef.current) return;
      cursorRef.current.style.opacity = show ? "1" : "0";
      trailRefs.current.forEach((el) => {
        if (el) el.style.opacity = show ? el.dataset.baseOpacity || "0.3" : "0";
      });
    };

    const onMove = (event: MouseEvent) => {
      mouse.current.x = event.clientX;
      mouse.current.y = event.clientY;
      if (!isVisible.current) {
        isVisible.current = true;
        points.current.forEach((point) => {
          point.x = event.clientX;
          point.y = event.clientY;
        });
        setCursorVisibility(true);
      }
    };

    const onDown = () => {
      isPressed.current = true;
    };

    const onUp = () => {
      isPressed.current = false;
    };

    const onLeave = () => {
      isVisible.current = false;
      setCursorVisibility(false);
    };

    const animate = () => {
      if (!isMounted.current) return;
      const cursor = cursorRef.current;
      const headLerp = 0.4;
      const tailLerp = 0.34;

      points.current[0].x += (mouse.current.x - points.current[0].x) * headLerp;
      points.current[0].y += (mouse.current.y - points.current[0].y) * headLerp;

      for (let i = 1; i < points.current.length; i += 1) {
        points.current[i].x += (points.current[i - 1].x - points.current[i].x) * tailLerp;
        points.current[i].y += (points.current[i - 1].y - points.current[i].y) * tailLerp;
      }

      if (cursor) {
        cursor.style.transform = `translate3d(${points.current[0].x}px, ${points.current[0].y}px, 0) translate(-50%, -50%) scale(${isPressed.current ? 0.9 : 1})`;
      }

      trailRefs.current.forEach((el, idx) => {
        if (!el) return;
        const p = points.current[idx];
        const scale = 1 - (idx / TRAIL_COUNT) * 0.85;
        const opacity = Math.max(0.04, 0.34 - idx * 0.02);
        el.dataset.baseOpacity = opacity.toFixed(3);
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) scale(${scale})`;
        if (isVisible.current) el.style.opacity = opacity.toFixed(3);
      });

      rafId.current = window.requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    window.addEventListener("mouseup", onUp, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });
    window.addEventListener("blur", onLeave, { passive: true });

    rafId.current = window.requestAnimationFrame(animate);

    return () => {
      isMounted.current = false;
      isVisible.current = false;
      if (rafId.current !== null) {
        window.cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  return (
    <>
      <div ref={cursorRef} className="atom-cursor" aria-hidden="true">
        <span className="atom-core" />
        <span className="atom-orbit orbit-1" />
        <span className="atom-orbit orbit-2" />
        <span className="atom-orbit orbit-3" />
        <span className="electron-track track-1">
          <span className="atom-electron" />
        </span>
        <span className="electron-track track-2">
          <span className="atom-electron" />
        </span>
        <span className="electron-track track-3">
          <span className="atom-electron" />
        </span>
      </div>
      <div className="atom-trail" aria-hidden="true">
        {Array.from({ length: TRAIL_COUNT }).map((_, idx) => (
          <span
            key={idx}
            className="atom-trail-dot"
            ref={(node) => {
              trailRefs.current[idx] = node;
            }}
          />
        ))}
      </div>
    </>
  );
}
