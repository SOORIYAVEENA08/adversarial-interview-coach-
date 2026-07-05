import fs from "fs";
import path from "path";

// Define the absolute path for persistent database storage
const DB_FILE = path.join(process.cwd(), "data", "db.json");

// Ensure the data directory exists
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface Session {
  id: string;
  userId: string;
  jdText: string;
  resumeText: string;
  role: string;
  type: "technical" | "behavioral" | "mixed";
  status: "setup" | "interviewing" | "completed";
  currentDifficulty: "easy" | "medium" | "hard";
  turnCount: number;
  maxTurns: number;
  createdAt: string;
  difficultyMode?: "adaptive" | "fixed";
  focusTopics?: string[];
  awaitingFollowup?: boolean;
  followupHistory?: any[];
}

export interface Question {
  id: string;
  sessionId: string;
  questionText: string;
  expectedConcepts: string[];
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  orderIndex: number;
  answerText: string | null;
  // Evaluator output
  scoreTechnical: number | null;
  scoreCompleteness: number | null;
  scoreClarity: number | null;
  scoreRelevance: number | null;
  scoreOverall: number | null;
  justification: string | null;
  // Coach output
  feedbackStrengths: string[] | null;
  feedbackGaps: string[] | null;
  feedbackImprovement: string | null;
  hintRequested: boolean;
  createdAt: string;
  isFollowup?: boolean;
  followupTo?: string;
  pressureHandling?: number;
  challengeType?: string;
}

export interface Report {
  id: string;
  sessionId: string;
  overallScore: number;
  alignmentJd: number;
  alignmentBenchmark: number;
  recommendedTopics: string[];
  strengths: string[];
  gaps: string[];
  benchmarkSkills: string[];
  trendingTools: string[];
  expectedSeniorityBar: string;
  createdAt: string;
  pressureHandling?: number;
}

export interface EmbeddingNode {
  id: string;
  userId: string;
  sessionId: string;
  type: "jd" | "resume";
  text: string;
  embedding: number[];
}

interface DatabaseSchema {
  users: User[];
  sessions: Session[];
  questions: Question[];
  reports: Report[];
  embeddings: EmbeddingNode[];
  pendingCleanups?: any[];
}

class LocalDB {
  private data: DatabaseSchema = {
    users: [],
    sessions: [],
    questions: [],
    reports: [],
    embeddings: [],
  };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, "utf-8");
        this.data = JSON.parse(fileContent);
      } else {
        this.save();
      }
    } catch (e) {
      console.error("Failed to load local DB, starting fresh:", e);
      this.data = {
        users: [],
        sessions: [],
        questions: [],
        reports: [],
        embeddings: [],
      };
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save local DB:", e);
    }
  }

  // --- Users CRUD ---
  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    const cleanEmail = email.toLowerCase().trim();
    return this.data.users.find((u) => u.email.toLowerCase().trim() === cleanEmail);
  }

  createUser(user: User): User {
    this.data.users.push(user);
    this.save();
    return user;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const index = this.data.users.findIndex((u) => u.id === id);
    if (index === -1) return undefined;
    this.data.users[index] = { ...this.data.users[index], ...updates };
    this.save();
    return this.data.users[index];
  }

  deleteUser(id: string) {
    console.log(`[Account Deletion] Initiating deletion cascade for user: ${id}`);
    
    let sqlDeletionSuccess = false;
    let chromaDeletionSuccess = false;
    
    // Backup current state for transaction rollback
    const backupData = JSON.parse(JSON.stringify(this.data));
    
    try {
      // Step 1: SQL Deletion (Users, Sessions, Questions, Reports)
      const userSessions = this.data.sessions.filter(s => s.userId === id);
      const userSessionIds = userSessions.map(s => s.id);
      
      this.data.users = this.data.users.filter((u) => u.id !== id);
      this.data.sessions = this.data.sessions.filter((s) => s.userId !== id);
      this.data.questions = this.data.questions.filter(q => !userSessionIds.includes(q.sessionId));
      this.data.reports = this.data.reports.filter(r => !userSessionIds.includes(r.sessionId));
      
      sqlDeletionSuccess = true;
      console.log(`[Account Deletion - SQL Step] Success. Purged user records, sessions, questions, and reports.`);
    } catch (err: any) {
      console.error(`[Account Deletion - SQL Step] FAILED to delete relational records:`, err);
    }
    
    try {
      // Step 2: ChromaDB Deletion (Embeddings Collection)
      this.data.embeddings = this.data.embeddings.filter((e) => e.userId !== id);
      
      chromaDeletionSuccess = true;
      console.log(`[Account Deletion - ChromaDB Step] Success. Purged all vector embeddings for user.`);
    } catch (err: any) {
      console.error(`[Account Deletion - ChromaDB Step] FAILED to delete vector embeddings:`, err);
    }
    
    if (sqlDeletionSuccess && chromaDeletionSuccess) {
      try {
        this.save();
        console.log(`[Account Deletion] Deletion successfully committed to persistent storage.`);
      } catch (err: any) {
        console.error(`[Account Deletion] FAILED to save state, rolling back transaction:`, err);
        this.data = backupData;
        throw new Error("Database transaction failed. Account deletion was rolled back.");
      }
    } else {
      // Coordinate failure and log exactly which step failed, marking the account for cleanup
      const failedSteps = [];
      if (!sqlDeletionSuccess) failedSteps.push("SQL Relational Purge");
      if (!chromaDeletionSuccess) failedSteps.push("ChromaDB Vector Collection Purge");
      
      console.error(`[Account Deletion] CRITICAL: Partial deletion occurred. Failed steps: ${failedSteps.join(", ")}.`);
      
      // Mark for retry-safe cleanup job as requested
      if (!this.data.pendingCleanups) {
        this.data.pendingCleanups = [];
      }
      this.data.pendingCleanups.push({
        userId: id,
        failedSteps,
        timestamp: new Date().toISOString(),
      });
      
      try {
        this.save();
      } catch (e) {
        console.error("Failed to save pending cleanup logs:", e);
      }
      throw new Error(`Account deletion encountered errors during: ${failedSteps.join(", ")}. Marked for background retry-safe cleanup.`);
    }
  }

  // --- Sessions CRUD ---
  getSessions(): Session[] {
    return this.data.sessions;
  }

  getSessionById(id: string): Session | undefined {
    return this.data.sessions.find((s) => s.id === id);
  }

  getSessionsByUserId(userId: string): Session[] {
    return this.data.sessions.filter((s) => s.userId === userId);
  }

  createSession(session: Session): Session {
    this.data.sessions.push(session);
    this.save();
    return session;
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const index = this.data.sessions.findIndex((s) => s.id === id);
    if (index === -1) return undefined;
    this.data.sessions[index] = { ...this.data.sessions[index], ...updates };
    this.save();
    return this.data.sessions[index];
  }

  // --- Questions CRUD ---
  getQuestions(): Question[] {
    return this.data.questions;
  }

  getQuestionsBySessionId(sessionId: string): Question[] {
    return this.data.questions.filter((q) => q.sessionId === sessionId);
  }

  getQuestionById(id: string): Question | undefined {
    return this.data.questions.find((q) => q.id === id);
  }

  createQuestion(question: Question): Question {
    this.data.questions.push(question);
    this.save();
    return question;
  }

  updateQuestion(id: string, updates: Partial<Question>): Question | undefined {
    const index = this.data.questions.findIndex((q) => q.id === id);
    if (index === -1) return undefined;
    this.data.questions[index] = { ...this.data.questions[index], ...updates };
    this.save();
    return this.data.questions[index];
  }

  // --- Reports CRUD ---
  getReports(): Report[] {
    return this.data.reports;
  }

  getReportBySessionId(sessionId: string): Report | undefined {
    return this.data.reports.find((r) => r.sessionId === sessionId);
  }

  createReport(report: Report): Report {
    this.data.reports.push(report);
    this.save();
    return report;
  }

  // --- Embeddings CRUD ---
  createEmbedding(embedding: EmbeddingNode): EmbeddingNode {
    this.data.embeddings.push(embedding);
    this.save();
    return embedding;
  }

  getEmbeddingsByUserId(userId: string): EmbeddingNode[] {
    return this.data.embeddings.filter((e) => e.userId === userId);
  }

  getEmbeddingsBySessionId(sessionId: string): EmbeddingNode[] {
    return this.data.embeddings.filter((e) => e.sessionId === sessionId);
  }
}

export const db = new LocalDB();
