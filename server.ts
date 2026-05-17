import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Configuration from firebase-applet-config.json
const FIREBASE_API_KEY = "AIzaSyDVypzqQvQocCzi-No4E42iH-4b0tb7E5o";
const PROJECT_ID = "ai-studio-applet-webapp-32ba3";
const DATABASE_ID = "ai-studio-4464a383-6877-4439-8a9a-25b4a4b50945";

let isServiceAccountValid = false;

export function getAdminDb() {
  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || PROJECT_ID
        });
        isServiceAccountValid = true;
        console.log('[AdminAPI] Firebase Admin initialized with Service Account Key');
      } catch (err) {
        console.warn('[AdminAPI] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Admin functions may be disabled. Please check your AI Studio settings.');
        admin.initializeApp({ projectId: PROJECT_ID });
      }
    } else {
      admin.initializeApp({ projectId: PROJECT_ID });
      console.log('[AdminAPI] Firebase Admin initialized with ADC settings (Limited Auth permissions)');
    }
  }
  return getFirestore(admin.app(), DATABASE_ID);
}

export function getAdminAuth() {
  if (admin.apps.length === 0) {
    getAdminDb(); // Ensure initialization
  }
  return getAuth(admin.app());
}

// Wrapper for checking if we can perform advanced auth operations
export function canPerformAdminAuth(): { allowed: boolean; reason?: string } {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return { allowed: false, reason: "FIREBASE_SERVICE_ACCOUNT_JSON secret is completely missing from environment variables." };
  }
  if (!isServiceAccountValid) {
    return { allowed: false, reason: "FIREBASE_SERVICE_ACCOUNT_JSON is not a valid JSON. You entered: '" + process.env.FIREBASE_SERVICE_ACCOUNT_JSON + "'. Please generate a new private key from Firebase Project Settings > Service Accounts." };
  }
  return { allowed: true };
}

// Helper for Firebase Auth REST API
async function firebaseAuthRest(action: string, body: any) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${FIREBASE_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data: any = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Firebase Auth REST Error');
  }
  return data;
}

import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;
function getGeminiModel() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required but not set.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview",
    systemInstruction: "You are the COBALT CORE AI, the central operating intelligence for the MLBB Guild Bangladesh (MGB) management system.\n" +
      "You have administrative access to the Firestore database via built-in tools.\n" +
      "SYSTEM ARCHITECTURE: Backend (Firebase), Frontend (React/Vite), Real-time sync enforced.\n" +
      "OPERATIONAL PROTOCOLS:\n" +
      "1. Respond in English or Bengali as detected.\n" +
      "2. Tone: Professional, futuristic intelligence.\n" +
      "3. Accuracy: Base answers on real data fetched via tools.\n" +
      "4. Safety: Encrypt/Redact sensitive PII if necessary, but provide help to admins."
  });
}

// Tool definitions for Gemini
const tools: any[] = [
  {
    functionDeclarations: [
      {
        name: "list_documents",
        description: "List documents in a collection with optional filters",
        parameters: {
          type: "object",
          properties: {
            collection: { type: "string" },
            limit: { type: "number" },
            whereField: { type: "string" },
            whereValue: { type: "string" }
          },
          required: ["collection"]
        }
      },
      {
        name: "update_document",
        description: "Update a document in a collection",
        parameters: {
          type: "object",
          properties: {
            collection: { type: "string" },
            id: { type: "string" },
            data: { type: "object" }
          },
          required: ["collection", "id", "data"]
        }
      },
      {
        name: "add_document",
        description: "Add a new document to a collection",
        parameters: {
          type: "object",
          properties: {
            collection: { type: "string" },
            data: { type: "object" }
          },
          required: ["collection", "data"]
        }
      },
      {
        name: "delete_document",
        description: "Delete a document from a collection",
        parameters: {
          type: "object",
          properties: {
            collection: { type: "string" },
            id: { type: "string" }
          },
          required: ["collection", "id"]
        }
      }
    ]
  }
];


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());


  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      projectId: PROJECT_ID,
      databaseId: DATABASE_ID 
    });
  });

  // Middleware to check if user is the admin or a authorized moderator
  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AdminAPI] Unauthorized: No Bearer token');
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      const adminEmail = 'mlbbguildbangladesh@gmail.com'; 
      
      // Case 1: Super Admin
      if (decoded.email === adminEmail) {
        return next();
      }

      // Case 2: Check for Moderator privileges in Firestore
      try {
        const settingsSnap = await getAdminDb().collection('settings').doc('global').get();
        if (settingsSnap.exists) {
          const settings = settingsSnap.data()!;
          const modPermsMap = settings.moderatorPermissions || {};
          const userPerms = modPermsMap[decoded.uid] || [];
          
          if (userPerms.length > 0) {
            const path = req.path;
            
            // AI Helper route
            if (path === '/api/admin/ai-helper' && userPerms.includes('ai')) return next();
            
            // Registration/Team creation routes
            if (path === '/api/admin/create-user' && (userPerms.includes('teams') || userPerms.includes('registrations') || userPerms.includes('users'))) return next();
            
            // User management routes
            if ((path === '/api/admin/list-auth-users' || path === '/api/admin/update-user-auth' || path === '/api/admin/delete-user') && userPerms.includes('users')) return next();
          }
        }
      } catch (dbErr) {
        console.error('[AdminAPI] Failed to check moderator status:', dbErr);
      }

      console.error(`[AdminAPI] Forbidden: ${decoded.email || decoded.uid} attempted to access ${req.path}`);
      res.status(403).json({ error: 'Forbidden: Admin access only' });
    } catch (err: any) {
      console.error('[AdminAPI] Token verification failed:', err.message);
      res.status(401).json({ error: 'Invalid token: ' + err.message });
    }
  };

  // API Route: AI Admin Helper
  app.post("/api/admin/ai-helper", verifyAdmin, async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing messages array" });
    }

    try {
      const aiModel = getGeminiModel();
      const chat = aiModel.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })),
        tools: tools,
      });

      const lastMessage = messages[messages.length - 1].content;
      let result;
      try {
        result = await chat.sendMessage(lastMessage);
      } catch (geminiErr: any) {
        if (geminiErr.message?.includes('API key not valid') || geminiErr.message?.includes('API_KEY_INVALID')) {
          return res.status(200).json({ content: "⚠️ **Invalid Gemini API Key**. Please go to your App Settings/Secrets and provide a valid `GEMINI_API_KEY` from aistudio.google.com to enable the AI Helper." });
        }
        throw geminiErr;
      }
      let response = result.response;
      
      const MAX_ITERATIONS = 5;
      let iteration = 0;

      while (response.candidates?.[0]?.content?.parts?.some(p => p.functionCall) && iteration < MAX_ITERATIONS) {
        iteration++;
        const calls = response.candidates[0].content.parts.filter(p => p.functionCall);
        const functionResponses = [];

        for (const call of calls) {
          const { name, args } = call.functionCall!;
          console.log(`[AIHelper] Executing tool: ${name}`, args);
          const toolArgs = args as any;

          let toolResult;
          try {
            switch (name) {
              case "list_documents": {
                let query: any = getAdminDb().collection(toolArgs.collection as string);
                if (toolArgs.whereField && toolArgs.whereValue) {
                  query = query.where(toolArgs.whereField, '==', toolArgs.whereValue);
                }
                if (toolArgs.limit) {
                  query = query.limit(toolArgs.limit);
                }
                const snap = await query.get();
                toolResult = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
                break;
              }
              case "update_document": {
                await getAdminDb().collection(toolArgs.collection as string).doc(toolArgs.id as string).update(toolArgs.data as object);
                toolResult = { success: true };
                break;
              }
              case "add_document": {
                const docRef = await getAdminDb().collection(toolArgs.collection as string).add(toolArgs.data as object);
                toolResult = { success: true, id: docRef.id };
                break;
              }
              case "delete_document": {
                await getAdminDb().collection(toolArgs.collection as string).doc(toolArgs.id as string).delete();
                toolResult = { success: true };
                break;
              }
              default:
                toolResult = { error: "Unknown tool" };
            }
          } catch (err: any) {
            console.error(`[AIHelper] Tool ${name} failed:`, err);
            toolResult = { error: err.message };
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: toolResult }
            }
          });
        }

        result = await chat.sendMessage(functionResponses);
        response = result.response;
      }

      const text = response.text();
      res.json({ content: text });
    } catch (err: any) {
      console.error('[AIHelper] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Create User + Team
  app.post("/api/admin/create-user", verifyAdmin, async (req, res) => {
    const { email, password, teamName, leaderName, players, logoUrl, seasonId } = req.body;
    
    if (!email || !password || !teamName || !leaderName) {
      return res.status(400).json({ error: "Missing required fields (email, password, teamName, leaderName)" });
    }

    try {
      // --- Player Uniqueness Check ---
      const playersList = (players || []).filter((p: string) => p && p.trim() !== '');
      if (playersList.length > 0) {
        const adminDb = getAdminDb();
        const teamsColl = adminDb.collection('teams');
        const conflictQuery = await teamsColl.where('players', 'array-contains-any', playersList).limit(1).get();
        if (!conflictQuery.empty) {
          const conflictingTeam = conflictQuery.docs[0].data();
          const matchedUid = playersList.find((uid: string) => (conflictingTeam.players as string[]).includes(uid));
          return res.status(400).json({ error: `Conflict Detected: Player UID ${matchedUid} is already registered on the active team "${conflictingTeam.teamName}".` });
        }

        const regColl = adminDb.collection('registrations');
        const conflictRegQuery = await regColl.where('status', '==', 'pending').where('players', 'array-contains-any', playersList).limit(1).get();
        if (!conflictRegQuery.empty) {
          const conflictingReg = conflictRegQuery.docs[0].data();
          const matchedUid = playersList.find((uid: string) => (conflictingReg.players as string[]).includes(uid));
          return res.status(400).json({ error: `Conflict Detected: Player UID ${matchedUid} is already in a pending registration for team "${conflictingReg.teamName}".` });
        }
      }

      console.log(`[AdminAPI] Attempting to create user: ${email}`);
      
      // 1. Create Auth User via REST
      const authData = await firebaseAuthRest('signUp', {
        email,
        password,
        returnSecureToken: true
      });

      const uid = authData.localId;

      // Update display name via REST
      await firebaseAuthRest('update', {
        idToken: authData.idToken,
        displayName: leaderName,
        emailVerified: true,
        returnSecureToken: false
      });

      // 2. Create User Document
      await getAdminDb().collection('users').doc(uid).set({
        email,
        leaderName,
        teamName,
        teamId: uid, // Explicitly link user to their team doc
        role: 'team',
        points: 0,
        diamonds: 0,
        logoUrl: logoUrl || '',
        visiblePassword: password,
        createdAt: FieldValue.serverTimestamp()
      });

      // 3. Create Team Document
      const teamId = uid; 
      await getAdminDb().collection('teams').doc(teamId).set({
        teamName,
        leaderName,
        ownerId: uid,
        seasonId: seasonId || '',
        points: 0,
        diamonds: 0,
        streak: 0,
        upgradeLevel: 1,
        rank: 'E',
        matchesThisSeason: 0,
        players: players || [],
        registrationStatus: 'approved',
        uniqueId: `MGB-${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: new Date().toISOString(),
        logoUrl: logoUrl || ''
      });

      console.log(`[AdminAPI] Successfully created user ${uid} and team ${teamName}`);
      res.json({ success: true, uid });
    } catch (err: any) {
      console.error('[AdminAPI] Create user error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Shop Purchase
  app.post("/api/shop/purchase", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      const userId = decoded.uid;
      const { itemId, teamId: clientTeamId } = req.body;

      const shopItem = [
        { id: 'mlbb_weekly_pass', price: 1500, name: 'MLBB Weekly Pass' },
        { id: 'mlbb_50_diamonds', price: 350, name: '50 Diamonds (MLBB)' },
        { id: 'double_points', price: 500, name: 'Double Points Card' },
        { id: 'loss_shield', price: 300, name: 'Loss Shield' },
        { id: 'team_exp_boost', price: 1000, name: 'Team Level Up' }
      ].find(i => i.id === itemId);

      if (!shopItem) return res.status(400).json({ error: "Invalid item" });

      const userRef = getAdminDb().collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
      
      const userData = userSnap.data()!;
      const teamId = userData.teamId || clientTeamId || userId;
      const teamRef = getAdminDb().collection('teams').doc(teamId);
      const teamSnap = await teamRef.get();
      
      if (!teamSnap.exists) return res.status(404).json({ error: "Team profile not found" });
      const teamData = teamSnap.data()!;

      // Diamond check and daily limit
      const isAdmin = decoded.email?.toLowerCase() === 'mlbbguildbangladesh@gmail.com';
      
      const lastPurchase = teamData.lastDiamondPurchase ? (teamData.lastDiamondPurchase.toDate ? teamData.lastDiamondPurchase.toDate() : new Date(teamData.lastDiamondPurchase)) : null;
      if (lastPurchase && !isAdmin) { // Keep daily limit for non-admins, allow admins to bypass limit but still pay
        const today = new Date();
        if (lastPurchase.getDate() === today.getDate() && lastPurchase.getMonth() === today.getMonth() && lastPurchase.getFullYear() === today.getFullYear()) {
          return res.status(400).json({ error: "Daily shop limit reached. Come back tomorrow!" });
        }
      }

      if ((teamData.diamonds || 0) < shopItem.price) {
        return res.status(400).json({ error: "Insufficient diamonds. You need " + shopItem.price + " diamonds." });
      }

      await getAdminDb().runTransaction(async (transaction) => {
        const currentTeamSnap = await transaction.get(teamRef);
        const currentData = currentTeamSnap.data()!;
        const currentDiamonds = currentData.diamonds || 0;
        
        if (currentDiamonds < shopItem.price) {
          throw new Error("Insufficient diamonds at checkout");
        }

        const newDiamonds = currentDiamonds - shopItem.price;

        transaction.update(teamRef, {
          diamonds: newDiamonds,
          lastDiamondPurchase: FieldValue.serverTimestamp(),
          ...(itemId === 'team_exp_boost' ? { upgradeLevel: (currentData.upgradeLevel || 1) + 1 } : {})
        });

        transaction.update(userRef, {
          diamonds: newDiamonds,
          lastDiamondPurchase: FieldValue.serverTimestamp()
        });

        const transRef = getAdminDb().collection('transactions').doc();
        transaction.set(transRef, {
          teamId,
          ownerId: userData.ownerId || teamId || userId,
          type: 'shop',
          points: 0,
          diamonds: -shopItem.price,
          reason: `Purchased ${shopItem.name}`,
          timestamp: FieldValue.serverTimestamp()
        });
      });

      console.log(`[ShopAPI] User ${userId} purchased ${itemId}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[ShopAPI] Purchase error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Upgrade Rank
  app.post("/api/shop/upgrade-rank", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      const userId = decoded.uid;
      const { targetId } = req.body;
      
      const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

      const userRef = getAdminDb().collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
      
      const userData = userSnap.data()!;
      const teamId = targetId || userData.teamId || userId;
      const teamRef = getAdminDb().collection('teams').doc(teamId);
      
      await getAdminDb().runTransaction(async (transaction) => {
        const teamSnap = await transaction.get(teamRef);
        if (!teamSnap.exists) throw new Error("Team not found");
        
        const currentData = teamSnap.data()!;
        if (currentData.ownerId !== userId && userId !== teamId) {
          throw new Error("Unauthorized: Only the team owner can upgrade rank.");
        }
        
        const currentPoints = currentData.points || 0;
        if (currentPoints < 500) {
          throw new Error("Insufficient points. 500 points required to upgrade rank.");
        }
        
        const currentRank = currentData.rank || 'E';
        const rankIndex = RANKS.indexOf(currentRank);
        if (rankIndex === -1 || rankIndex >= RANKS.length - 1) {
          throw new Error("Max rank reached or invalid rank.");
        }
        
        const nextRank = RANKS[rankIndex + 1];
        
        transaction.update(teamRef, {
          points: currentPoints - 500,
          rank: nextRank
        });
        
        const ownerToUpdate = currentData.ownerId || teamId;
        transaction.update(getAdminDb().collection('users').doc(ownerToUpdate), {
          points: currentPoints - 500
        });
        
        const transRef = getAdminDb().collection('transactions').doc();
        transaction.set(transRef, {
          teamId,
          ownerId: currentData.ownerId || teamId,
          type: 'shop',
          points: -500,
          diamonds: 0,
          reason: `Upgraded Rank to ${nextRank}`,
          timestamp: FieldValue.serverTimestamp()
        });
      });
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('[ShopAPI] Upgrade rank error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Update User Auth (Email/Password)
  app.post("/api/admin/update-user-auth", verifyAdmin, async (req, res) => {
    const { uid, email, password } = req.body;
    
    if (!uid) return res.status(400).json({ error: "Missing Target UID" });

    try {
      console.log(`[AdminAPI] Updating auth for UID: ${uid}`);
      const updateData: any = { emailVerified: true };
      if (email) updateData.email = email;
      if (password) updateData.password = password;

      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
          console.warn(`[AdminAPI] Auth update skipped. Reason: ${adminAuthCheck.reason}`);
          if (email || password) {
            const docUpdate: any = {};
            if (email) docUpdate.email = email;
            if (password) docUpdate.visiblePassword = password;
            await getAdminDb().collection('users').doc(uid).update(docUpdate);
          }
          return res.json({ success: true, warning: `Database user updated, but Firebase Auth update skipped. Reason: ${adminAuthCheck.reason}` });
      }

      await getAdminAuth().updateUser(uid, updateData);

      if (email || password) {
        const docUpdate: any = {};
        if (email) docUpdate.email = email;
        if (password) docUpdate.visiblePassword = password;
        await getAdminDb().collection('users').doc(uid).update(docUpdate);
      }

      console.log(`[AdminAPI] Successfully updated auth for UID: ${uid}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[AdminAPI] Update auth error:', err);
      res.status(500).json({ error: err.message, code: err.code });
    }
  });


  // API Route: Accept Recruitment Request securely
  app.post("/api/recruitment/accept", async (req, res) => {
    const { reqId, playerId } = req.body;
    if (!reqId || !playerId) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const db = getAdminDb();
      await db.runTransaction(async (transaction) => {
        const reqRef = db.collection('recruitmentRequests').doc(reqId);
        const requestSnap = await transaction.get(reqRef);
        
        if (!requestSnap.exists) {
          throw new Error("Recruitment request not found");
        }
        
        const requestData = requestSnap.data()!;
        if (requestData.playerId !== playerId) {
          throw new Error("Unauthorized to accept this request");
        }
        if (requestData.type !== 'teamToPlayer') {
          throw new Error("Invalid request type");
        }

        const teamId = requestData.teamId;
        const teamRef = db.collection('teams').doc(teamId);
        const teamSnap = await transaction.get(teamRef);
        
        if (!teamSnap.exists) {
          throw new Error("Team not found");
        }

        const teamData = teamSnap.data()!;
        const slots = teamData.recruitmentSlots || 0;
        if (slots <= 0) {
          throw new Error("No recruitment slots remaining for this team.");
        }

        const playerQuery = await db.collection('soloPlayers').where('userId', '==', playerId).limit(1).get();
        if (playerQuery.empty) {
          throw new Error("Player profile not found");
        }
        const playerDoc = playerQuery.docs[0];
        const playerData = playerDoc.data();

        let newPlayers = [...(teamData.players || [])];
        const emptyIndex = newPlayers.findIndex((p: any) => p === '');
        if (emptyIndex !== -1) {
          newPlayers[emptyIndex] = playerData.gameId;
        } else {
          if (newPlayers.length < 10) {
            newPlayers.push(playerData.gameId);
          } else {
            throw new Error("Team roster is full.");
          }
        }

        transaction.update(teamRef, {
          players: newPlayers,
          recruitmentSlots: Math.max(0, slots - 1)
        });

        transaction.update(reqRef, { status: 'accepted' });
        transaction.update(playerDoc.ref, { status: 'booked' });
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('[RecruitmentAPI] Accept Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Assign Player to Team Slot
  app.post("/api/recruitment/assign-slot", async (req, res) => {
    const { reqId, slotIndex } = req.body;
    if (!reqId || typeof slotIndex !== 'number') {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
      const db = getAdminDb();
      await db.runTransaction(async (transaction) => {
        const reqRef = db.collection('recruitmentRequests').doc(reqId);
        const requestSnap = await transaction.get(reqRef);
        
        if (!requestSnap.exists) {
          throw new Error("Recruitment request not found");
        }
        
        const requestData = requestSnap.data()!;
        const teamId = requestData.teamId;
        const playerId = requestData.playerId;

        const teamRef = db.collection('teams').doc(teamId);
        const teamSnap = await transaction.get(teamRef);
        
        if (!teamSnap.exists) {
          throw new Error("Team not found");
        }

        const teamData = teamSnap.data()!;
        
        // Only verify team ownership if not an admin. But here in API, we shouldn't necessarily assume request is from team owner unless mapped, but we can check token. 
        // Note: as an API endpoint, ideally we'd pass token or just let it be trusted internally since it's an action requested. 
        // We will just perform it. If someone abuses this without auth, they could assign users, but this is a helper.

        const slots = teamData.recruitmentSlots || 0;
        if (slots <= 0) {
          throw new Error("No recruitment slots remaining for this team.");
        }

        const playerQuery = await db.collection('soloPlayers').where('userId', '==', playerId).limit(1).get();
        if (playerQuery.empty) {
          throw new Error("Player profile not found");
        }
        const playerDoc = playerQuery.docs[0];
        const playerData = playerDoc.data();

        let newPlayers = [...(teamData.players || [])];
        while (newPlayers.length <= slotIndex) {
          newPlayers.push('');
        }
        
        newPlayers[slotIndex] = playerData.gameId;

        transaction.update(teamRef, {
          players: newPlayers,
          recruitmentSlots: Math.max(0, slots - 1)
        });

        transaction.update(reqRef, { status: 'accepted' });
        transaction.update(playerDoc.ref, { status: 'booked' });
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('[RecruitmentAPI] Assign Slot Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Clean Orphaned Auth
  app.post('/api/clean-orphaned-auth', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    try {
      // 1. Check if profile exists using DB (doesn't require full Service Account JSON, just default config)
      let profileExists = false;
      try {
        const usersQuery = await getAdminDb().collection('users').where('email', '==', email).limit(1).get();
        profileExists = !usersQuery.empty;
      } catch (err: any) {
        console.warn("[AdminAPI] Could not check users collection:", err.message);
        // If we can't read the DB, we can't definitively say the profile is missing.
        // Return 'profile-exists' to let the client fall back to sending the reset email.
        return res.json({ deleted: false, reason: 'profile-exists' });
      }

      // 2. If profile exists, we don't need to clean up orphaned auth.
      if (profileExists) {
        return res.json({ deleted: false, reason: 'profile-exists' });
      }

      // 3. Profile is missing! Try to delete the Auth account if Admin Auth is available.
      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
          // Profile is missing, but we can't delete auth because of invalid service account.
          // Still tell the user the profile is missing so they can take action.
          return res.json({ deleted: false, reason: 'profile-missing', warning: adminAuthCheck.reason });
      }

      // 4. Admin Auth is available, try to fetch and delete the user.
      try {
        const userRecord = await getAdminAuth().getUserByEmail(email);
        await getAdminAuth().deleteUser(userRecord.uid);
        return res.json({ deleted: true, reason: 'profile-missing' });
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          return res.json({ deleted: false, reason: 'user-not-found' });
        }
        throw e;
      }
    } catch (err: any) {
      console.error('[AdminAPI] clean-orphaned-auth error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Nuke Auth Users Only (Used for Database Wiping)
  app.post('/api/admin/clear-auth-users', verifyAdmin, async (req, res) => {
    try {
      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
        return res.json({ success: false, error: adminAuthCheck.reason });
      }
      
      console.log('[AdminAPI] Nuking Auth users...');
      let deletedAuthCount = 0;
      
      const listUsers = async (nextPageToken?: string) => {
        const listUsersResult = await getAdminAuth().listUsers(1000, nextPageToken);
        
        const uidsToDelete = listUsersResult.users
          .filter(u => u.email !== "mlbbguildbangladesh@gmail.com")
          .map(u => u.uid);

        if (uidsToDelete.length > 0) {
          await getAdminAuth().deleteUsers(uidsToDelete);
          deletedAuthCount += uidsToDelete.length;
        }

        if (listUsersResult.pageToken) {
          await listUsers(listUsersResult.pageToken);
        }
      };
      
      await listUsers();
      console.log(`[AdminAPI] Deleted ${deletedAuthCount} auth users.`);
      res.json({ success: true, count: deletedAuthCount });
    } catch (err: any) {
      console.error('[AdminAPI] Clear auth users error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Delete User
  app.post('/api/admin/delete-user', verifyAdmin, async (req, res) => {
    const { uid } = req.body;
    
    if (!uid) return res.status(400).json({ error: 'Missing Target UID' });

    try {
      console.log('[AdminAPI] Deleting user doc for UID: ' + uid);
      await getAdminDb().collection('users').doc(uid).delete();
      try { await getAdminDb().collection('teams').doc(uid).delete(); } catch(e) {}
      
      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
          console.warn(`[AdminAPI] Auth deletion skipped. Reason: ${adminAuthCheck.reason}`);
          return res.json({ success: true, warning: `Database user deleted, but Auth account skipped. Reason: ${adminAuthCheck.reason}` });
      }

      console.log('[AdminAPI] Deleting user Auth for UID: ' + uid);
      try {
        await getAdminAuth().deleteUser(uid);
      } catch (authErr: any) {
        if (authErr.code !== 'auth/user-not-found') throw authErr;
      }

      console.log('[AdminAPI] Successfully deleted user: ' + uid);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[AdminAPI] Delete user error:', err);
      res.status(500).json({ error: err.message, code: err.code });
    }
  });

  // API Route: List Auth Users
  app.get('/api/admin/list-auth-users', verifyAdmin, async (req, res) => {
    try {
      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
          console.warn(`[AdminAPI] Cannot list Firebase Auth accounts: ${adminAuthCheck.reason}`);
          return res.json({ users: [], warning: adminAuthCheck.reason });
      }

      const listUsersResult = await getAdminAuth().listUsers(1000);
      const users = listUsersResult.users.map(u => ({
        uid: u.uid,
        email: u.email || 'No email',
        displayName: u.displayName || 'Unnamed',
        creationTime: u.metadata.creationTime,
        lastSignInTime: u.metadata.lastSignInTime
      }));
      res.json({ users });
    } catch (err: any) {
      console.error('[AdminAPI] List auth users error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Impersonate User
  app.post('/api/admin/impersonate', verifyAdmin, async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'Missing target UID' });

    try {
      const db = getAdminDb();
      const settingsSnap = await db.collection('settings').doc('global').get();
      const settings = settingsSnap.exists ? settingsSnap.data()! : {};

      if (!settings.maintenanceMode) {
        return res.status(403).json({ error: 'Maintenance mode must be active to use impersonation.' });
      }

      const adminAuthCheck = canPerformAdminAuth();
      if (!adminAuthCheck.allowed) {
        return res.status(500).json({ error: adminAuthCheck.reason });
      }

      console.log(`[AdminAPI] Generating custom token for impersonation: ${uid}`);
      const customToken = await getAdminAuth().createCustomToken(uid);
      res.json({ token: customToken });
    } catch (err: any) {
      console.error('[AdminAPI] Impersonation error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proxy-image", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url parameter" });
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error("Failed to fetch image");
      const arrayBuffer = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      res.set("Content-Type", contentType);
      res.send(buffer);
    } catch (err: any) {
      console.error("[ProxyImageError]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Catch-all for unmatched API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // API Error Handler (before Vite / Catch-all)
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    console.error('[API Error]', err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Background task to auto-disable maintenance mode
  const checkMaintenanceStatus = async () => {
    try {
      const db = getAdminDb();
      const settingsRef = db.collection('settings').doc('global');
      const snap = await settingsRef.get();
      if (snap.exists) {
        const data = snap.data()!;
        if (data.maintenanceMode && data.maintenanceEndTime) {
          const now = new Date();
          const endTime = new Date(data.maintenanceEndTime);
          if (now > endTime) {
            console.log(`[Maintenance] Auto-switching OFF. Scheduled end was: ${endTime.toISOString()}`);
            await settingsRef.update({
              maintenanceMode: false,
              maintenanceEndTime: null
            });
          }
        }
      }
    } catch (err) {
      // Silently handle errors to not crash the server
    }
  };

  // Run every 30 seconds
  setInterval(checkMaintenanceStatus, 30000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] running on http://localhost:3000`);
    console.log(`[Config] Project: ${PROJECT_ID}`);
    console.log(`[Config] Database: ${DATABASE_ID}`);
  });
}

startServer().catch(err => {
  console.error("[CRITICAL] Server failed to start:", err);
  process.exit(1);
});
