'use client';

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';
import { Suspense } from 'react';

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProgressBar
          height="3px"
          color="#8b5cf6" 
          options={{ showSpinner: true }}
          shallowRouting
        />
      </Suspense>
    </>
  );
}
