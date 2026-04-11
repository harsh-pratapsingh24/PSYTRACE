"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/contexts/session-context";

export function FixedChat() {
  const router = useRouter();
  const { isAuthenticated, loading } = useSession();

  const handleClick = () => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    router.push("/therapy/new");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        size="icon"
        type="button"
        aria-label="Open therapy chat"
        className="h-14 w-14 rounded-full shadow-lg hover:scale-105 transition-transform"
        onClick={handleClick}
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    </div>
  );
}
