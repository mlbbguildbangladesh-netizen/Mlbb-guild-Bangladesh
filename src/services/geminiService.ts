import { auth } from "../lib/firebase";

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
  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      return "Error: Neural link requires authentication. Please log in as Administrator.";
    }

    const token = await firebaseUser.getIdToken();
    
    // Convert history format if needed (our server expects { role: 'user' | 'assistant', content: string })
    const messages = [
      ...history.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.parts?.[0]?.text || m.content
      })),
      { role: 'user', content: prompt }
    ];

    const response = await fetch('/api/admin/ai-helper', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ messages })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    return data.content || "Neural link stable but no data retrieved.";
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    return `Error: Neural link disrupted (${error.message}). Check API uplink in secrets.`;
  }
}
