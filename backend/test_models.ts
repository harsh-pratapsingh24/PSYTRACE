import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

// Load .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("No API key found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log("Listing models...");
        // In @google/generative-ai v0.5.0, listModels might not be available or differently named.
        // Let's try to just test a few common ones.
        const modelsToTest = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro", "gemini-1.0-pro"];
        
        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("test");
                console.log(`Model ${modelName}: SUCCESS`);
                process.exit(0);
            } catch (err: any) {
                console.log(`Model ${modelName}: FAILED - ${err.message}`);
            }
        }
    } catch (error: any) {
        console.error("Error:", error.message);
    }
}

listModels();
