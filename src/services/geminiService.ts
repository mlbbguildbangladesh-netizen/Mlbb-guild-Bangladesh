import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not defined.");
      // Return a dummy client or throw, but since this might run, we just init with empty string to avoid crash, but it will fail on request.
      aiClient = new GoogleGenAI({ apiKey: key || 'dummy' });
    } else {
      aiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return aiClient;
}

export interface SystemData {
  teamsCount: number;
  pendingRegistrationsCount: number;
  totalMatches: number;
  schedules: any[];
  recentLogs: any[];
  settings: any;
  moderatorsCount: number;
}

export async function askGemini(prompt: string, context: SystemData, history: any[] = []) {
  const systemInstruction = `
    You are the "COBALT CORE AI", the central operating intelligence for this Guild Management System.
    You possess deep knowledge of all system protocols, team registrations, and administrative actions.
    
    SYSTEM ARCHITECTURE OVERVIEW:
    - Backend: Firebase (Firestore, Auth, Storage)
    - Frontend: React + Vite + Tailwind CSS
    - Key Features: Team Registration (UID uniqueness enforced), Challenges, Tournament Scheduling, Diamond/Points Management, Maintenance Control with Countdown.
    
    CURRENT REAL-TIME DATA:
    - Active Teams: ${context.teamsCount}
    - Pending Approvals: ${context.pendingRegistrationsCount}
    - Total Match Records: ${context.totalMatches}
    - Registered Moderators: ${context.moderatorsCount}
    - Maintenance Status: ${context.settings?.maintenanceMode ? 'ACTIVE' : 'READY/IDLE'}
    ${context.settings?.maintenanceEndTime ? `- Current Maintenance Scheduled End: ${new Date(context.settings.maintenanceEndTime).toLocaleString()}` : ''}
    
    HISTORICAL LOGS (Recent Curation):
    ${JSON.stringify(context.recentLogs.map(l => ({
      who: l.performedByEmail || 'System/Admin',
      action: l.reason || l.type,
      teamId: l.teamId,
      time: l.timestamp?.seconds ? new Date(l.timestamp.seconds * 1000).toLocaleString() : (l.timestamp ? new Date(l.timestamp).toLocaleString() : 'N/A')
    })))}

    OPERATIONAL PROTOCOLS:
    1. Response Language: Detect Bengali or English and respond accordingly.
    2. Tone: Professional, futuristic, core-system intelligence.
    3. Accuracy: Base your technical answers on the actual data provided above. 
    4. Curation Tracking: When asked about who did what, refer to the "who" field in the logs.
    
    If the data is not in the context, politely inform the administrator that the specific sector is currently shielded from AI analysis.
  `;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: history.length > 0 ? history.concat([{ role: 'user', parts: [{ text: prompt }] }]) : [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return response.text || "Communication timeout. Neural buffer empty.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error: Neural link disrupted. Check API uplink.";
  }
}
