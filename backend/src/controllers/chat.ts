import { Request, Response } from "express";
import { ChatSession, IChatSession } from "../models/ChatSession";
import Groq from "groq-sdk";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { inngest } from "../inngest/client";
import { User } from "../models/User";
import { InngestSessionResponse, InngestEvent } from "../types/inngest";
import { Types } from "mongoose";

// Initialize Groq API
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "llama-3.3-70b-versatile";

const defaultAnalysis = {
  emotionalState: "neutral",
  themes: [] as string[],
  riskLevel: 0,
  recommendedApproach: "supportive listening",
  progressIndicators: [] as string[],
};

function getRequestUserId(req: Request): Types.ObjectId | null {
  const u = req.user as { id?: string; _id?: Types.ObjectId } | undefined;
  if (!u) return null;
  const raw = u.id ?? u._id;
  if (raw == null) return null;
  try {
    return new Types.ObjectId(String(raw));
  } catch {
    return null;
  }
}

function parseAnalysisFromGroq(text: string) {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return { ...defaultAnalysis, ...parsed };
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return { ...defaultAnalysis, ...parsed };
      } catch {
        /* use default */
      }
    }
    logger.warn("Could not parse analysis JSON from Groq; using defaults");
    return { ...defaultAnalysis };
  }
}

// Create a new chat session
export const createChatSession = async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized - User not authenticated" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const sessionId = uuidv4();

    const session = new ChatSession({
      sessionId,
      userId,
      startTime: new Date(),
      status: "active",
      messages: [],
    });

    await session.save();

    res.status(201).json({
      message: "Chat session created successfully",
      sessionId: session.sessionId,
    });
  } catch (error) {
    logger.error("Error creating chat session:", error);
    res.status(500).json({
      message: "Error creating chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Send a message in the chat session
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    logger.info("Processing message:", { sessionId, message });

    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      logger.error("Session not found in DB:", { sessionId });
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      logger.error("User mismatch for session:", { sessionId, sessionUserId: session.userId, requestUserId: userId });
      return res.status(403).json({ message: "Unauthorized" });
    }

    logger.info("Session found and user verified. Preparing Groq call...");

    const event: InngestEvent = {
      name: "therapy/session.message",
      data: {
        message,
        history: session.messages,
        memory: {
          userProfile: {
            emotionalState: [],
            riskLevel: 0,
            preferences: {},
          },
          sessionContext: {
            conversationThemes: [],
            currentTechnique: null,
          },
        },
        goals: [],
        systemPrompt: `You are an AI therapist assistant. Your role is to:
        1. Provide empathetic and supportive responses
        2. Use evidence-based therapeutic techniques
        3. Maintain professional boundaries
        4. Monitor for risk factors
        5. Guide users toward their therapeutic goals`,
      },
    };

    try {
      logger.info("Sending message to Inngest...");
      await inngest.send(event);
      logger.info("Inngest send successful");
    } catch (inngestErr) {
      logger.warn(
        "Inngest send failed (ok for local dev):",
        inngestErr instanceof Error ? inngestErr.message : inngestErr
      );
    }

    const combinedPrompt = `${event.data.systemPrompt}

You are also responsible for analyzing the user's message for therapeutic insights.

User Message: ${message}
Conversation Context: ${JSON.stringify({ memory: event.data.memory, goals: event.data.goals })}

Respond with a SINGLE valid JSON object (no markdown, no extra text) in exactly this structure:
{
  "analysis": {
    "emotionalState": "string describing the user's emotional state",
    "themes": ["array", "of", "themes"],
    "riskLevel": 0,
    "recommendedApproach": "string",
    "progressIndicators": ["array", "of", "indicators"]
  },
  "response": "Your full empathetic therapeutic response to the user here"
}

The response field must:
1. Address the immediate emotional needs
2. Use appropriate therapeutic techniques
3. Show empathy and understanding
4. Maintain professional boundaries
5. Consider safety and well-being`;

    logger.info(`Using Groq Model: ${GROQ_MODEL}`);
    logger.info("Calling Groq API...");
    const startTime = Date.now();

    const combinedResult = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: combinedPrompt }],
      max_tokens: 1000,
    });

    const endTime = Date.now();
    logger.info(`Groq API call took ${endTime - startTime}ms`);

    const combinedText = combinedResult.choices[0]?.message?.content?.trim() || "";
    logger.info("Raw Groq Response received:", {
      length: combinedText.length,
      preview: combinedText.substring(0, 100) + "...",
    });

    let analysis = { ...defaultAnalysis };
    let response = "";

    try {
      const cleaned = combinedText.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      logger.info("Attempting to parse cleaned JSON response...");
      const parsed = JSON.parse(cleaned);
      if (parsed.analysis) {
        analysis = { ...defaultAnalysis, ...parsed.analysis };
      }
      response = parsed.response || "";
      logger.info("Successfully parsed and extracted response");
    } catch (parseError) {
      logger.warn("JSON parse failed, falling back to raw text:", parseError instanceof Error ? parseError.message : String(parseError));
      response = combinedText;
    }

    if (!response) {
      logger.warn("Groq returned empty response, using default fallback");
      response = "I'm here to listen and support you. Could you tell me more about how you're feeling?";
    }

    logger.info("Updating session messages in database...");
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    session.messages.push({
      role: "assistant",
      content: response,
      timestamp: new Date(),
      metadata: {
        analysis,
        progress: {
          emotionalState: analysis.emotionalState,
          riskLevel: analysis.riskLevel,
        },
      },
    });

    await session.save();
    logger.info("Session saved successfully to MongoDB");

    res.json({
      response,
      message: response,
      analysis,
      metadata: {
        progress: {
          emotionalState: analysis.emotionalState,
          riskLevel: analysis.riskLevel,
        },
      },
    });
  } catch (error) {
    logger.error("CRITICAL ERROR in sendMessage:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({
      message: "Error processing message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get chat session history
export const getSessionHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json({
      messages: session.messages,
      startTime: session.startTime,
      status: session.status,
    });
  } catch (error) {
    logger.error("Error fetching session history:", error);
    res.status(500).json({ message: "Error fetching session history" });
  }
};

export const getChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    logger.info(`Getting chat session: ${sessionId}`);
    const chatSession = await ChatSession.findOne({ sessionId });
    if (!chatSession) {
      logger.warn(`Chat session not found: ${sessionId}`);
      return res.status(404).json({ error: "Chat session not found" });
    }
    logger.info(`Found chat session: ${sessionId}`);
    res.json(chatSession);
  } catch (error) {
    logger.error("Failed to get chat session:", error);
    res.status(500).json({ error: "Failed to get chat session" });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json(session.messages);
  } catch (error) {
    logger.error("Error fetching chat history:", error);
    res.status(500).json({ message: "Error fetching chat history" });
  }
};

// Get all chat sessions for the authenticated user
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(sessions);
  } catch (error) {
    logger.error("Error fetching all sessions:", error);
    res.status(500).json({ message: "Error fetching sessions" });
  }
};