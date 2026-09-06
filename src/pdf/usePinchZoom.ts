import { useEffect, type RefObject } from 'react';
import { useReaderStore } from '@/store/readerStore';

/**
 * Two-finger pinch-to-zoom on the scroll container, plus ctrl/⌘ + wheel on
 * desktop. Updates the store's `zoom`; page re-render handles the rest.
 * We keep the pinch focal point roughly stable by adjusting scrollTop.
 */
export function usePinchZoom(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startDist = 0;
    let startZoom = 1;
    let pinching = false;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinching = true;
      startDist = dist(e.touches);
      startZoom = useReaderStore.getState().zoom;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
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

    // double-tap to toggle 1x <-> 2x
    let lastTap = 0;
    const onTouchTap = (e: TouchEvent) => {
      if (e.touches.length) return;
      const now = Date.now();
      if (now - lastTap < 280) {
        const { zoom, setZoom } = useReaderStore.getState();
        setZoom(zoom > 1.3 ? 1 : 2);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchend', onTouchTap, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchend', onTouchTap);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref]);
}
