import { useEffect, type RefObject } from 'react';
import { useReaderStore } from '@/store/readerStore';

/**
 * Two-finger pinch-to-zoom on the scroll container. Listeners are attached in
 * the CAPTURE phase so they run before the SelectionOverlay's pointer handlers
 * and can't be swallowed. Also ctrl/⌘ + wheel on desktop, and double-tap in a
 * blank area handled elsewhere.
 */
export function usePinchZoom(ref: RefObject<HTMLElement>, ready?: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startDist = 0;
    let startZoom = 1;
    let pinching = false;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true;
        startDist = dist(e.touches) || 1;
        startZoom = useReaderStore.getState().zoom;
        e.preventDefault(); // stop the page from starting a scroll/selection
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      const ratio = dist(e.touches) / startDist;
      useReaderStore.getState().setZoom(startZoom * ratio);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinching = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      useReaderStore.getState().nudgeZoom(e.deltaY > 0 ? -0.1 : 0.1);
    };

    // capture: true → we see the event before descendant handlers
    el.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    el.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchmove', onTouchMove, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchend', onTouchEnd, { capture: true } as EventListenerOptions);
      el.removeEventListener('touchcancel', onTouchEnd, { capture: true } as EventListenerOptions);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref, ready]);
}
