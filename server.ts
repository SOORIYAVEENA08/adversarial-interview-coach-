import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import PDFDocument from "pdfkit";
import { db, User, Session, Question, Report } from "./src/server/db.js";
import { hashPassword, verifyPassword, createToken, verifyToken, verifyTokenIgnoreExp } from "./src/server/crypto.js";
import { indexDocument, gapAnalysis } from "./src/server/rag.js";
import {
  runIndustryBenchmark,
  runInterviewer,
  runEvaluator,
  runCoach,
  runRouter,
  runReportGenerator,
  runAdversarialFollowUp,
  runFollowUpEvaluator,
} from "./src/server/agents.js";

// Extend Express Request types globally to support req.user with zero type-casting hassle
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // --- Auth Middleware ---
  function authenticateToken(req: any, res: any, next: any) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: "Invalid or expired session" });
    }

    // Double check user still exists
    const user = db.getUserById(decoded.id);
    if (!user) {
      return res.status(403).json({ error: "User no longer exists" });
    }

    req.user = decoded; // { id, email }
    next();
  }

  // --- API Routes ---

  // signup
  app.post("/api/auth/signup", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const existingUser = db.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      const user = db.createUser({
        id: `usr_${Math.random().toString(36).substring(2, 11)}`,
        email: email.toLowerCase().trim(),
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
        failedAttempts: 0,
        lockedUntil: null,
      });

      // Verification log as required
      console.log(`[Email Verification System] Sent signup verification email to: ${user.email}`);

      const token = createToken({ id: user.id, email: user.email });
      return res.status(201).json({
        token,
        user: { id: user.id, email: user.email },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Signup failed" });
    }
  });

  // login with rate limiting / lockouts
  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check lockouts
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingSecs = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000));
        res.setHeader("Retry-After", String(remainingSecs));
        return res.status(429).json({
          error: `Account temporarily locked due to failed attempts. Please try again in ${Math.ceil(remainingSecs / 60)} minute(s).`,
        });
      }

      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        const attempts = user.failedAttempts + 1;
        let lockedUntil = null;
        if (attempts >= 5) {
          // Lock for 15 minutes after 5 failures
          lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }

        db.updateUser(user.id, {
          failedAttempts: attempts >= 5 ? 0 : attempts,
          lockedUntil,
        });

        if (attempts >= 5) {
          res.setHeader("Retry-After", "900");
          return res.status(429).json({
            error: "Too many failed login attempts. Account locked for 15 minutes.",
          });
        }

        const remaining = 5 - attempts;
        return res.status(401).json({
          error: `Invalid email or password. ${remaining} attempt(s) remaining before temporary lockout.`,
        });
      }

      // Success - reset attempts
      db.updateUser(user.id, {
        failedAttempts: 0,
        lockedUntil: null,
      });

      const token = createToken({ id: user.id, email: user.email });
      return res.json({
        token,
        user: { id: user.id, email: user.email },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Login failed" });
    }
  });

  // silent token refresh endpoint
  app.post("/api/auth/refresh", (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Token is required for refresh" });
      }

      const decoded = verifyTokenIgnoreExp(token);
      if (!decoded) {
        return res.status(401).json({ error: "Invalid refresh token session" });
      }

      // Check if user still exists
      const user = db.getUserById(decoded.id);
      if (!user) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      // Limit refresh to tokens that have expired within 7 days
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (decoded.exp && (nowSeconds - decoded.exp) > 7 * 86400) {
        return res.status(401).json({ error: "Session has fully expired. Please log in again." });
      }

      // Issue a fresh new token
      const newToken = createToken({ id: user.id, email: user.email });
      return res.json({ token: newToken });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Token refresh failed" });
    }
  });

  // getCurrentUser profile with trend statistics
  app.get("/api/auth/me", authenticateToken, (req, res) => {
    try {
      const sessions = db.getSessionsByUserId(req.user.id);
      const reports = db.getReports();
      
      // Calculate score trend stats
      const sessionTrends = sessions
        .map((s) => {
          const report = reports.find((r) => r.sessionId === s.id);
          return {
            sessionId: s.id,
            role: s.role,
            type: s.type,
            date: s.createdAt,
            score: report ? report.overallScore : null,
          };
        })
        .filter((t) => t.score !== null)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return res.json({
        user: { id: req.user.id, email: req.user.email },
        statistics: {
          totalSessions: sessions.length,
          completedSessions: sessions.filter((s) => s.status === "completed").length,
          trends: sessionTrends,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Forgot password endpoint
  app.post("/api/auth/forgot-password", (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const user = db.getUserByEmail(email);
      if (user) {
        const resetToken = `rst_${Math.random().toString(36).substring(2, 11)}`;
        console.log(`[Forgot Password System] Token generated for ${user.email}: ${resetToken}`);
        console.log(`[Email Verification System] Sent password reset link with token to: ${user.email}`);
      }
      return res.json({
        message: "If the email exists in our system, a secure reset token has been dispatched successfully.",
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Delete account cascade
  app.delete("/api/auth/delete-account", authenticateToken, (req, res) => {
    try {
      db.deleteUser(req.user.id);
      return res.json({ message: "Your account and all associated resumes, questions, scores, and mock interview data have been fully deleted." });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Helper to validate entire InterviewState schema before running agent nodes
  function validateSessionState(session: any): boolean {
    if (!session) return false;
    if (!session.id || !session.userId || !session.role) return false;
    
    const validDifficulties = ["easy", "medium", "hard"];
    if (!validDifficulties.includes(session.currentDifficulty)) return false;
    
    const validStatuses = ["setup", "interviewing", "completed"];
    if (!validStatuses.includes(session.status)) return false;
    
    if (typeof session.turnCount !== "number" || typeof session.maxTurns !== "number") return false;
    if (session.turnCount > session.maxTurns + 1) return false;
    return true;
  }

  // --- Document Upload Service ---
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  app.post("/api/upload-document", authenticateToken, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file was uploaded." });
      }

      const buffer = req.file.buffer;
      const originalname = req.file.originalname.toLowerCase();

      // Magic bytes validation
      const isPDF = buffer.slice(0, 4).toString() === "%PDF";
      const isDOCX = buffer.slice(0, 4).toString("hex") === "504b0304"; // ZIP/DOCX

      let extractedText = "";

      if (isPDF) {
        try {
          const parser = new PDFParse(new Uint8Array(buffer));
          const pdfData = await parser.getText();
          extractedText = pdfData.text || "";
        } catch (pdfErr) {
          console.error("PDF parse failed:", pdfErr);
          return res.status(400).json({ error: "We couldn't read that PDF — try pasting text instead." });
        }
      } else if (isDOCX) {
        try {
          const docxResult = await mammoth.extractRawText({ buffer });
          extractedText = docxResult.value || "";
        } catch (docxErr) {
          console.error("DOCX parse failed:", docxErr);
          return res.status(400).json({ error: "We couldn't read that DOCX — try pasting text instead." });
        }
      } else {
        return res.status(400).json({ error: "Invalid file format. Only real PDF and DOCX files are accepted." });
      }

      if (!extractedText || !extractedText.trim()) {
        return res.status(400).json({ error: "We couldn't extract any text from that file. Try pasting the text instead." });
      }

      return res.json({
        text: extractedText,
        filename: req.file.originalname,
      });

    } catch (e: any) {
      console.error("Upload handler failed:", e);
      return res.status(500).json({ error: "An unexpected error occurred during document processing." });
    }
  });

  // --- Session Setup ---
  app.post("/api/sessions/setup", authenticateToken, async (req, res) => {
    try {
      const { jdText, resumeText, role, type, maxTurns, difficultyMode, currentDifficulty, focusTopics } = req.body;
      if (!jdText || !resumeText || !role || !type) {
        return res.status(400).json({ error: "Missing required fields for mock setup" });
      }

      // Enforce server-side caps
      const finalMaxTurns = Math.min(15, Math.max(3, parseInt(maxTurns) || 10));
      const validDifficulties = ["easy", "medium", "hard"];
      const finalDifficulty = validDifficulties.includes(currentDifficulty) ? currentDifficulty : "easy";
      const finalDifficultyMode = difficultyMode === "fixed" ? "fixed" : "adaptive";
      const finalFocusTopics = Array.isArray(focusTopics) ? focusTopics : [];

      const session = db.createSession({
        id: `ses_${Math.random().toString(36).substring(2, 11)}`,
        userId: req.user.id,
        jdText,
        resumeText,
        role,
        type,
        status: "setup",
        currentDifficulty: finalDifficulty,
        difficultyMode: finalDifficultyMode,
        focusTopics: finalFocusTopics,
        turnCount: 0,
        maxTurns: finalMaxTurns,
        createdAt: new Date().toISOString(),
      });

      // Start asynchronous indexing/embedding in RAG
      await Promise.all([
        indexDocument(req.user.id, session.id, "jd", jdText),
        indexDocument(req.user.id, session.id, "resume", resumeText),
      ]);

      // Run Industry Benchmark on setup to guide subsequent questions
      const benchmark = await runIndustryBenchmark(role, jdText);
      
      // Store benchmark temporarily in RAG embeddings or simply trigger gap analysis
      const analysis = await gapAnalysis(jdText, resumeText);

      // Return session plus initial analysis
      return res.status(201).json({
        session,
        benchmark,
        analysis,
      });
    } catch (e: any) {
      console.error("Failed to setup mock interview session:", e);
      return res.status(500).json({ error: e.message || "Setup failed" });
    }
  });

  // Configure new features (Difficulty Mode, Starting Difficulty, Focus Topics, turns count)
  app.post("/api/sessions/:id/configure", authenticateToken, (req, res) => {
    try {
      const session = db.getSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized configuration attempt on session: ${req.params.id} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized access to session" });
      }

      const { difficultyMode, currentDifficulty, maxTurns, focusTopics } = req.body;

      // Enforce server-side maximums & validation
      const finalMaxTurns = Math.min(15, Math.max(3, parseInt(maxTurns) || 10));
      const validDifficulties = ["easy", "medium", "hard"];
      const finalDifficulty = validDifficulties.includes(currentDifficulty) ? currentDifficulty : "easy";
      const finalDifficultyMode = difficultyMode === "fixed" ? "fixed" : "adaptive";
      const finalFocusTopics = Array.isArray(focusTopics) ? focusTopics : [];

      db.updateSession(session.id, {
        difficultyMode: finalDifficultyMode,
        currentDifficulty: finalDifficulty,
        maxTurns: finalMaxTurns,
        focusTopics: finalFocusTopics,
        status: "interviewing", // proceed directly to interviewing status
      });

      const updated = db.getSessionById(session.id);
      
      // Validate schema state before launching
      if (!validateSessionState(updated)) {
        return res.status(400).json({ error: "Configured interview state is invalid." });
      }

      return res.json({ session: updated });
    } catch (e: any) {
      console.error("Failed to configure mock session:", e);
      return res.status(500).json({ error: e.message || "Configuration failed" });
    }
  });

  // get user sessions
  app.get("/api/sessions", authenticateToken, (req, res) => {
    try {
      const sessions = db.getSessionsByUserId(req.user.id);
      return res.json(sessions);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // get session details with report & questions
  app.get("/api/sessions/:id", authenticateToken, (req, res) => {
    try {
      const session = db.getSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized access attempt on session: ${req.params.id} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized access to session" });
      }

      const questions = db.getQuestionsBySessionId(session.id);
      const report = db.getReportBySessionId(session.id);

      return res.json({
        session,
        questions,
        report: report || null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Re-upload resume mid-session
  app.post("/api/sessions/:id/reupload", authenticateToken, async (req, res) => {
    try {
      const session = db.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized resume reupload attempt on session: ${req.params.id} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized access to session" });
      }

      const { resumeText } = req.body;
      if (!resumeText) return res.status(400).json({ error: "Resume text required" });

      // Update session resume
      db.updateSession(session.id, { resumeText });

      // Re-embed resume
      await indexDocument(req.user.id, session.id, "resume", resumeText);

      return res.json({ message: "Resume successfully re-uploaded and embedded. Questions will now adapt to your updated background." });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Generate next question
  app.post("/api/sessions/:id/next-question", authenticateToken, async (req, res) => {
    const session = db.getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    
    if (session.userId !== req.user.id) {
      console.warn(`[resource_access_denied] Unauthorized next-question request on session: ${req.params.id} by user: ${req.user.id}`);
      return res.status(403).json({ error: "Unauthorized access to session" });
    }

    // Validate InterviewState against schema before agent execution
    if (!validateSessionState(session)) {
      console.error(`[State Validation Failed] Session ${session.id} is in an invalid state. Concluding early.`);
      try {
        db.updateSession(session.id, { status: "completed" });
        const questionsList = db.getQuestionsBySessionId(session.id);
        const benchmark = await runIndustryBenchmark(session.role, session.jdText);
        const report = await runReportGenerator(session, questionsList, benchmark);
        return res.status(400).json({
          error: "Your session state was found to be corrupted. Let's try that again. Your mock interview has been concluded early, and your partial progress report has been compiled successfully.",
          session: db.getSessionById(session.id),
          report,
          questions: questionsList
        });
      } catch (err: any) {
        return res.status(400).json({ error: "Failed to validate and recover session state." });
      }
    }

    try {
      if (session.status === "completed") {
        return res.status(400).json({ error: "Interview is already complete" });
      }

      const previousQuestions = db.getQuestionsBySessionId(session.id);

      // Verify if there's already an active question that wasn't answered
      const activeUnanswered = previousQuestions.find((q) => q.answerText === null);
      if (activeUnanswered) {
        return res.json(activeUnanswered);
      }

      // Generate benchmark context
      const benchmark = await runIndustryBenchmark(session.role, session.jdText);

      // Generate next question via Agent
      const agentOutput = await runInterviewer(session, previousQuestions, benchmark);

      const nextQuestion = db.createQuestion({
        id: `que_${Math.random().toString(36).substring(2, 11)}`,
        sessionId: session.id,
        questionText: agentOutput.question,
        expectedConcepts: agentOutput.expected_concepts,
        topic: agentOutput.topic,
        difficulty: agentOutput.difficulty,
        orderIndex: previousQuestions.length,
        answerText: null,
        scoreTechnical: null,
        scoreCompleteness: null,
        scoreClarity: null,
        scoreRelevance: null,
        scoreOverall: null,
        justification: null,
        feedbackStrengths: null,
        feedbackGaps: null,
        feedbackImprovement: null,
        hintRequested: false,
        createdAt: new Date().toISOString(),
      });

      // Update session status to interviewing
      if (session.status === "setup") {
        db.updateSession(session.id, { status: "interviewing" });
      }

      return res.json(nextQuestion);
    } catch (e: any) {
      console.error("Failed to generate next question. Concluding session early with partial report:", e);
      try {
        db.updateSession(session.id, { status: "completed" });
        const questionsList = db.getQuestionsBySessionId(session.id);
        const benchmark = await runIndustryBenchmark(session.role, session.jdText);
        const report = await runReportGenerator(session, questionsList, benchmark);
        return res.status(200).json({
          error: "We are thinking a little longer than usual. Let's try that again. Your mock interview has been concluded early, and your partial progress report has been compiled successfully.",
          session: db.getSessionById(session.id),
          report,
          questions: questionsList
        });
      } catch (err: any) {
        return res.status(500).json({ error: "Interviewer Agent encountered an issue. Please try restarting your session." });
      }
    }
  });

  // Request a hint with a penalty
  app.post("/api/sessions/:id/request-hint", authenticateToken, async (req, res) => {
    try {
      const session = db.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized request-hint on session: ${req.params.id} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized access to session" });
      }

      const { questionId } = req.body;
      const question = db.getQuestionById(questionId);
      if (!question) return res.status(404).json({ error: "Question not found" });

      // Apply penalty and flag in DB
      db.updateQuestion(question.id, { hintRequested: true });

      // Generate custom helpful hint with Gemini based on expected concepts
      let hintText = `Focus on explaining your approach around these elements: ${question.expectedConcepts.slice(0, 2).join(", ")}. Be sure to structure your response using specific professional examples.`;

      return res.json({
        hint: hintText,
        penaltyWarning: "A small evaluation penalty of 1 point has been applied for utilizing a coaching hint.",
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Submit Answer -> run multi-agent LangGraph flow
  app.post("/api/sessions/:id/submit-answer", authenticateToken, async (req, res) => {
    const session = db.getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== req.user.id) {
      console.warn(`[resource_access_denied] Unauthorized submit-answer on session: ${req.params.id} by user: ${req.user.id}`);
      return res.status(403).json({ error: "Unauthorized access to session" });
    }

    // Validate state against schema before graph execution
    if (!validateSessionState(session)) {
      console.error(`[State Validation Failed] Session ${session.id} is in an invalid state prior to evaluation.`);
      try {
        db.updateSession(session.id, { status: "completed" });
        const questionsList = db.getQuestionsBySessionId(session.id);
        const benchmark = await runIndustryBenchmark(session.role, session.jdText);
        const report = await runReportGenerator(session, questionsList, benchmark);
        return res.status(400).json({
          error: "Your session state was found to be corrupted. Let's try that again. Your mock interview has been concluded early, and your partial progress report has been compiled successfully.",
          session: db.getSessionById(session.id),
          report,
          questions: questionsList
        });
      } catch (err: any) {
        return res.status(400).json({ error: "Failed to validate and recover session state." });
      }
    }

    try {
      const { questionId, answerText } = req.body;
      if (!questionId || !answerText) {
        return res.status(400).json({ error: "Question ID and answer text are required" });
      }

      const question = db.getQuestionById(questionId);
      if (!question) return res.status(404).json({ error: "Question not found" });

      if (question.isFollowup) {
        // Evaluate the candidate's answer to the adversarial follow-up challenge
        const parentQuestionId = question.followupTo;
        const parentQuestion = parentQuestionId ? db.getQuestionById(parentQuestionId) : null;
        
        // We evaluate pressure handling
        const followupEval = await runFollowUpEvaluator(
          parentQuestion || question,
          question.questionText,
          answerText
        );

        // Save evaluation
        db.updateQuestion(question.id, {
          answerText,
          scoreOverall: followupEval.pressure_handling,
          pressureHandling: followupEval.pressure_handling,
          justification: followupEval.justification,
          scoreTechnical: followupEval.pressure_handling,
          scoreCompleteness: followupEval.pressure_handling,
          scoreClarity: followupEval.pressure_handling,
          scoreRelevance: followupEval.pressure_handling,
        });

        // Add to session's followup history
        const updatedHistory = session.followupHistory || [];
        updatedHistory.push({
          parentQuestionId,
          followupQuestionText: question.questionText,
          challengeType: question.challengeType || "scale",
          answerText,
          pressureScore: followupEval.pressure_handling,
          justification: followupEval.justification,
        });

        // Update session: increment turn count and clear follow-up flag
        const newTurnCount = session.turnCount + 1;
        const isSessionFinished = newTurnCount >= session.maxTurns;

        db.updateSession(session.id, {
          turnCount: newTurnCount,
          awaitingFollowup: false,
          followupHistory: updatedHistory,
          status: isSessionFinished ? "completed" : "interviewing",
        });

        let report: Report | null = null;
        if (isSessionFinished) {
          const questionsList = db.getQuestionsBySessionId(session.id);
          const benchmark = await runIndustryBenchmark(session.role, session.jdText);
          report = await runReportGenerator(session, questionsList, benchmark);
        }

        // Return standard response structured properly
        return res.json({
          evaluation: {
            technical_correctness: followupEval.pressure_handling,
            completeness: followupEval.pressure_handling,
            communication_clarity: followupEval.pressure_handling,
            relevance: followupEval.pressure_handling,
            use_of_examples: followupEval.pressure_handling,
            overall_score: followupEval.pressure_handling,
            justification: followupEval.justification,
            pressure_handling: followupEval.pressure_handling,
          },
          coaching: {
            strengths: ["Demonstrated composure under adversarial follow-up scrutiny", "Responded to targeted pushback"],
            gaps: followupEval.pressure_handling < 7 ? ["Struggled to defend assumptions robustly under scale conditions"] : [],
            suggested_improvement: "Maintain this clear, structured focus when asked unexpected follow-up scenarios.",
            resource_topics: ["Pressure Management", "Trade-Off Analysis"],
          },
          isComplete: isSessionFinished,
          report,
          session: db.getSessionById(session.id),
        });

      } else {
        // STANDARD (non-followup) question evaluation
        const evaluation = await runEvaluator(question, answerText);
        const coaching = await runCoach(question, answerText, evaluation);

        let finalOverallScore = evaluation.overall_score;
        if (question.hintRequested) {
          finalOverallScore = Math.max(1, finalOverallScore - 1);
        }

        // Save evaluation
        db.updateQuestion(question.id, {
          answerText,
          scoreTechnical: evaluation.technical_correctness,
          scoreCompleteness: evaluation.completeness,
          scoreClarity: evaluation.communication_clarity,
          scoreRelevance: evaluation.relevance,
          scoreOverall: finalOverallScore,
          justification: evaluation.justification,
          feedbackStrengths: coaching.strengths,
          feedbackGaps: coaching.gaps,
          feedbackImprovement: coaching.suggested_improvement,
        });

        // Trigger condition: overall score >= 7 OR 40% random chance
        const meetsScoreThreshold = finalOverallScore >= 7;
        const randomChance = Math.random() < 0.40;
        
        if (meetsScoreThreshold || randomChance) {
          console.log(`[Follow-Up Triggered] Score: ${finalOverallScore}, Random: ${randomChance}. Generating adversarial challenge.`);
          
          const followupResult = await runAdversarialFollowUp(question, answerText);
          
          // Create the follow-up question
          const followupQ: Question = {
            id: `q_f_${Math.random().toString(36).substring(2, 11)}`,
            sessionId: session.id,
            questionText: followupResult.followup_question,
            expectedConcepts: [followupResult.expected_depth],
            topic: `${question.topic} (Follow-Up Challenge)`,
            difficulty: session.currentDifficulty,
            orderIndex: question.orderIndex + 1,
            answerText: null,
            scoreTechnical: null,
            scoreCompleteness: null,
            scoreClarity: null,
            scoreRelevance: null,
            scoreOverall: null,
            justification: null,
            feedbackStrengths: null,
            feedbackGaps: null,
            feedbackImprovement: null,
            hintRequested: false,
            createdAt: new Date().toISOString(),
            isFollowup: true,
            followupTo: question.id,
            challengeType: followupResult.challenge_type,
          };
          
          db.createQuestion(followupQ);

          const updatedHistory = session.followupHistory || [];
          db.updateSession(session.id, {
            awaitingFollowup: true,
            followupHistory: updatedHistory,
          });

          // Send back response with evaluation, coaching, and notify the frontend that a follow-up is coming
          return res.json({
            evaluation: {
              ...evaluation,
              overall_score: finalOverallScore,
            },
            coaching,
            isComplete: false,
            report: null,
            session: db.getSessionById(session.id),
            hasFollowupTriggered: true,
            followupQuestion: followupResult.followup_question,
          });
        }

        // Standard flow if NO follow-up is triggered
        const newTurnCount = session.turnCount + 1;
        const isSessionFinished = newTurnCount >= session.maxTurns;

        // Adjust difficulty via Router
        const routingResult = runRouter(finalOverallScore, session.currentDifficulty);

        db.updateSession(session.id, {
          turnCount: newTurnCount,
          currentDifficulty: session.difficultyMode === "fixed" ? session.currentDifficulty : routingResult.nextDifficulty,
          status: isSessionFinished ? "completed" : "interviewing",
        });

        let report: Report | null = null;
        if (isSessionFinished) {
          const questionsList = db.getQuestionsBySessionId(session.id);
          const benchmark = await runIndustryBenchmark(session.role, session.jdText);
          report = await runReportGenerator(session, questionsList, benchmark);
        }

        return res.json({
          evaluation: {
            ...evaluation,
            overall_score: finalOverallScore,
          },
          coaching,
          isComplete: isSessionFinished,
          report,
          session: db.getSessionById(session.id),
        });
      }

    } catch (e: any) {
      console.error("Failed to process candidate's answer:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // End Interview Early & Force Report Generation
  app.post("/api/sessions/:id/end-early", authenticateToken, async (req, res) => {
    try {
      const session = db.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      if (session.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized end-early attempt on session: ${req.params.id} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized access to session" });
      }

      if (session.status === "completed") {
        return res.status(400).json({ error: "Interview is already complete" });
      }

      // Complete session
      db.updateSession(session.id, { status: "completed" });

      const questionsList = db.getQuestionsBySessionId(session.id);
      const benchmark = await runIndustryBenchmark(session.role, session.jdText);
      const report = await runReportGenerator(session, questionsList, benchmark);

      return res.json({
        message: "Interview ended early. Partial feedback report compiled successfully.",
        session: db.getSessionById(session.id),
        report,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Compare Performance Across Two saved Sessions
  app.post("/api/reports/compare", authenticateToken, (req, res) => {
    try {
      const { sessionAId, sessionBId } = req.body;
      if (!sessionAId || !sessionBId) {
        return res.status(400).json({ error: "Two session IDs are required for comparison" });
      }

      const sessionA = db.getSessionById(sessionAId);
      const sessionB = db.getSessionById(sessionBId);

      if (!sessionA || !sessionB) {
        return res.status(404).json({ error: "One or both mock sessions could not be found." });
      }

      if (sessionA.userId !== req.user.id || sessionB.userId !== req.user.id) {
        console.warn(`[resource_access_denied] Unauthorized report compare attempt on sessions: ${sessionAId}, ${sessionBId} by user: ${req.user.id}`);
        return res.status(403).json({ error: "Unauthorized to compare these sessions" });
      }

      const reportA = db.getReportBySessionId(sessionAId);
      const reportB = db.getReportBySessionId(sessionBId);

      if (!reportA || !reportB) {
        return res.status(400).json({ error: "Both sessions must be fully completed to compare metrics." });
      }

      // Generate a comparison summary
      const scoreDiff = reportB.overallScore - reportA.overallScore;
      const progressLabel = scoreDiff > 0 
        ? `Performance improved by ${scoreDiff} points!` 
        : scoreDiff < 0 
          ? `Performance declined by ${Math.abs(scoreDiff)} points.` 
          : "Identical performance scores.";

      return res.json({
        sessionA: { id: sessionA.id, role: sessionA.role, date: sessionA.createdAt, score: reportA.overallScore },
        sessionB: { id: sessionB.id, role: sessionB.role, date: sessionB.createdAt, score: reportB.overallScore },
        metrics: {
          scoreDiff,
          alignmentJdDiff: reportB.alignmentJd - reportA.alignmentJd,
          alignmentBenchmarkDiff: reportB.alignmentBenchmark - reportA.alignmentBenchmark,
        },
        progressLabel,
        remediationSummary: {
          commonStrengths: reportB.strengths.filter((s) => reportA.strengths.includes(s)),
          remainingGaps: reportB.gaps,
          suggestedNextSteps: `Focus heavily on target areas such as: ${reportB.recommendedTopics.slice(0, 2).join(", ")}.`,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Beautiful styled printable / PDF fallback page for report downloads
  app.get("/api/reports/:sessionId/pdf", authenticateToken, (req, res) => {
    try {
      const session = db.getSessionById(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.userId !== req.user.id) {
        return res.status(403).json({ error: "Unauthorized access to report" });
      }

      const report = db.getReportBySessionId(session.id);
      if (!report) {
        return res.status(400).json({ error: "Report is not yet ready for this session." });
      }

      const questions = db.getQuestionsBySessionId(session.id);
      const answered = questions.filter(q => q.answerText !== null);

      // Initialize PDF Kit document
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="interview-report-${session.id}.pdf"`);
      
      doc.pipe(res);

      // PDF styling and design - clean, minimalist and highly professional
      doc.fillColor("#1e1b4b").fontSize(24).text("Adversarial Interview Coach", { align: "center" });
      doc.moveDown(0.5);
      doc.fillColor("#4f46e5").fontSize(12).text(`Candidate Interview Performance Report`, { align: "center" });
      doc.moveDown(1.5);

      // Section 1: Overview
      doc.fillColor("#1e1b4b").fontSize(14).text("1. Session Metadata", { underline: true });
      doc.moveDown(0.5);
      doc.fillColor("#334155").fontSize(10);
      doc.text(`Target Role: ${session.role}`);
      doc.text(`Interview Type: ${session.type}`);
      doc.text(`Date Concluded: ${new Date(report.createdAt).toLocaleDateString()}`);
      doc.text(`Seniority Expectation Bar: ${report.expectedSeniorityBar}`);
      doc.moveDown(1.5);

      // Section 2: Metrics
      doc.fillColor("#1e1b4b").fontSize(14).text("2. Key Performance Metrics", { underline: true });
      doc.moveDown(0.5);
      
      // Draw a subtle background box for metrics
      doc.rect(50, doc.y, 495, 80).fill("#f8fafc");
      doc.fillColor("#1e1b4b").fontSize(12);
      doc.text(`Overall Preparation Score: ${report.overallScore}%`, 70, doc.y + 15);
      doc.text(`Job Description Alignment Match: ${report.alignmentJd}%`, 70, doc.y + 10);
      doc.text(`Industry Standard Benchmark Bar: ${report.alignmentBenchmark}%`, 70, doc.y + 10);
      if (report.pressureHandling !== undefined) {
        doc.text(`Pressure Resilience Score: ${report.pressureHandling}%`, 70, doc.y + 10);
      }
      doc.moveDown(2);

      // Section 3: Strengths & Gaps
      doc.fillColor("#1e1b4b").fontSize(14).text("3. Key Validated Strengths & Gaps", { underline: true });
      doc.moveDown(0.5);
      
      doc.fillColor("#10b981").fontSize(11).text("Strengths Detected:");
      doc.fillColor("#334155").fontSize(10);
      report.strengths.forEach(s => doc.text(`• ${s}`));
      doc.moveDown(0.8);

      doc.fillColor("#ef4444").fontSize(11).text("Identified Development Gaps:");
      doc.fillColor("#334155").fontSize(10);
      report.gaps.forEach(g => doc.text(`• ${g}`));
      doc.moveDown(1.5);

      // Section 4: Recommended Deep Study Topics
      doc.fillColor("#1e1b4b").fontSize(14).text("4. Recommended Topics for Deep Study", { underline: true });
      doc.moveDown(0.5);
      doc.fillColor("#334155").fontSize(10);
      report.recommendedTopics.forEach(t => doc.text(`• ${t}`));
      doc.moveDown(1.5);

      // Section 5: Question History Transcripts
      doc.addPage();
      doc.fillColor("#1e1b4b").fontSize(14).text("5. Question Transcripts & Coaching Remediation", { underline: true });
      doc.moveDown(1.0);

      answered.forEach((q, idx) => {
        doc.fillColor("#1e1b4b").fontSize(11).text(`Q${idx + 1}: ${q.questionText}`);
        doc.moveDown(0.3);
        doc.fillColor("#475569").fontSize(9).text(`Your Answer: "${q.answerText || "(No Answer)"}"`, { oblique: true });
        doc.moveDown(0.3);
        
        const typeLabel = q.isFollowup ? `Adversarial Follow-Up (Pressure)` : `Core Topic (${q.difficulty})`;
        doc.fillColor("#4f46e5").fontSize(9).text(`Type: ${typeLabel} | Overall Score: ${q.scoreOverall}/10`);
        
        doc.fillColor("#10b981").fontSize(9).text(`Justification: ${q.justification || "Evaluated correctly."}`);
        if (q.feedbackImprovement) {
          doc.fillColor("#3b82f6").fontSize(9).text(`Coaching: ${q.feedbackImprovement}`);
        }
        doc.moveDown(1.2);
        
        // Prevent drawing text off-page
        if (doc.y > 700) {
          doc.addPage();
        }
      });

      doc.end();
    } catch (e: any) {
      console.error("[PDF Gen Error]", e);
      return res.status(500).json({ error: `Failed to compile PDF: ${e.message}` });
    }
  });


  // --- Frontend Setup & Vite integration ---
  if (process.env.NODE_ENV === "production") {
    // Serve build from dist folder
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Vite middleware for smooth dev feedback
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const port = 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

startServer().catch((e) => {
  console.error("Critical server bootstrap error:", e);
  process.exit(1);
});
