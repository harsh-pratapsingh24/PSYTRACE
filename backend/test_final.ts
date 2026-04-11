import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const modelName = "gemini-2.0-flash";

if (!apiKey) {
    console.error("No API key");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
    try {
        console.log(`Testing model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Say 'hello world' if you are working.");
        console.log("Response:", result.response.text());
        console.log("SUCCESS");
    } catch (err: any) {
        console.error("FAILURE:", err.message);
    }
}

test();
