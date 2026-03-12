'use client';

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProgressBar
        height="3px"
        color="#8b5cf6" 
        options={{ showSpinner: true }}
        shallowRouting
      />
    </>
  );
}
