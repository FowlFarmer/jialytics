import { Jialytics } from 'jialytics/react';
import type { ReactNode } from 'react';

export const metadata = { title: 'jialytics example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
        {/* The one line that counts page views. trackLocalhost so `npm run dev` counts too. */}
        <Jialytics trackLocalhost />
      </body>
    </html>
  );
}
