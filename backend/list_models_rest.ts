import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key");
    process.exit(1);
}

// Try listing models using the REST API directly since the SDK might be old
const fetch = require('node-fetch');

async function listModels() {
    const urls = [
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    ];

    for (const url of urls) {
        console.log(`Checking ${url}...`);
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.models) {
                console.log(`SUCCESS for ${url}`);
                console.log("Models:", data.models.map((m: any) => m.name).join(", "));
                return;
            } else {
                console.log(`No models found for ${url}:`, JSON.stringify(data));
            }
        } catch (err: any) {
            console.log(`Failed for ${url}:`, err.message);
        }
    }
}

listModels();
