"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SessionProvider as CustomSessionProvider } from "@/lib/contexts/session-context";
import { FixedChat } from "@/components/chat/fixed-chat";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <CustomSessionProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <FixedChat />
        </ThemeProvider>
      </CustomSessionProvider>
    </NextAuthSessionProvider>
  );
}
