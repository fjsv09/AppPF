'use client';

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';
import { Suspense } from 'react';

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProgressBar
          height="4px"
          color="#3b82f6" 
          options={{ showSpinner: false }}
          shallowRouting
        />
      </Suspense>
    </>
  );
}
