import { NextRequest, NextResponse } from "next/server";
import { getServerBackendUrl } from "@/lib/server-backend";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    console.log(`Getting chat history for session ${sessionId}`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header is required" },
        { status: 401 }
      );
    }

    const response = await fetch(
      `${getServerBackendUrl()}/chat/sessions/${sessionId}/history`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to get chat history:", error);
      return NextResponse.json(
        { error: error.error || "Failed to get chat history" },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("Chat history retrieved successfully:", data);

    // Format the response to match the frontend's expected format
    const formattedMessages = data.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error("Error getting chat history:", error);
    return NextResponse.json(
      { error: "Failed to get chat history" },
      { status: 500 }
    );
  }
}
