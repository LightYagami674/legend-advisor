'use client';

import { useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface VariantMeta {
  key: string;
  label: string;
}

interface PrototypeSwitcherProps {
  variants: VariantMeta[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentIndex = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );
  const activeVariant = variants[currentIndex] ?? variants[0];

  const selectVariant = useCallback(
    (nextKey: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('variant', nextKey);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const cycle = useCallback(
    (delta: -1 | 1) => {
      const nextIndex = (currentIndex + delta + variants.length) % variants.length;
      const next = variants[nextIndex];
      if (next) selectVariant(next.key);
    },
    [currentIndex, variants, selectVariant]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cycle(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        cycle(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycle]);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-400/50 bg-zinc-950/95 px-3 py-1.5 text-xs font-medium text-zinc-100 shadow-2xl backdrop-blur-md">
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Prototype
        </span>
        <button
          type="button"
          onClick={() => cycle(-1)}
          aria-label="Previous variant"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-amber-400 hover:text-amber-300"
        >
          ←
        </button>
        <span className="min-w-[165px] text-center font-mono text-xs text-zinc-100">
          {activeVariant.key} ({activeVariant.label})
        </span>
        <button
          type="button"
          onClick={() => cycle(1)}
          aria-label="Next variant"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-amber-400 hover:text-amber-300"
        >
          →
        </button>
      </div>
    </div>
  );
}
