import { Suspense } from 'react';
import { DraftPrototypeShell } from './DraftPrototypeShell';

export default function DraftSessionPrototypePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-400">
          Loading Draft Session UI Prototype...
        </div>
      }
    >
      <DraftPrototypeShell />
    </Suspense>
  );
}
