import React, { useState, useEffect, useRef } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Upload,
  User,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// --- API Client ---
const API_URL = "";

// Helper to get auth header
const getAuthHeaders = () => {
  const token = localStorage.getItem("coach_jwt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function App() {
  // --- Global App States ---
  const [token, setToken] = useState<string | null>(localStorage.getItem("coach_jwt_token"));
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authView, setAuthView] = useState<"login" | "signup" | "forgot">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Navigation: "dashboard" | "setup" | "interview" | "report" | "history" | "compare" | "settings"
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // --- Session & Interview state ---
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeQuestions, setActiveQuestions] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [stats, setStats] = useState<any>({ totalSessions: 0, completedSessions: 0, trends: [] });

  // Interview setups
  const [setupRole, setSetupRole] = useState("Staff Frontend Engineer");
  const [setupType, setSetupType] = useState<"technical" | "behavioral" | "mixed">("mixed");
  const [setupMaxTurns, setSetupMaxTurns] = useState("5");
  const [setupDifficultyMode, setSetupDifficultyMode] = useState<"adaptive" | "fixed">("adaptive");
  const [setupCurrentDifficulty, setSetupCurrentDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [setupFocusTopics, setSetupFocusTopics] = useState("");
  const [setupJd, setSetupJd] = useState("");
  const [setupResume, setSetupResume] = useState("");
  const [setupIsLoading, setSetupIsLoading] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);

  // Setup LangGraph Agent logs visualization state
  const [agentStepMessage, setAgentStepMessage] = useState("");
  const [agentStepProgress, setAgentStepProgress] = useState(0);

  // Active question / Interview Q&A
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [candidateAnswer, setCandidateAnswer] = useState("");
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [feedbackTiming, setFeedbackTiming] = useState<"immediate" | "end">("immediate");
  const [hintText, setHintText] = useState("");
  const [hintWarning, setHintWarning] = useState("");
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState<any>(null);
  const [latestCoaching, setLatestCoaching] = useState<any>(null);

  // Mid-session re-upload resume states
  const [isReuploadOpen, setIsReuploadOpen] = useState(false);
  const [reuploadResume, setReuploadResume] = useState("");
  const [isReuploading, setIsReuploading] = useState(false);

  // Compare states
  const [compareSessionA, setCompareSessionA] = useState("");
  const [compareSessionB, setCompareSessionB] = useState("");
  const [compareResults, setCompareResults] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Settings
  const [settingsStatus, setSettingsStatus] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // Simulated drag-and-drop highlights
  const [jdDragged, setJdDragged] = useState(false);
  const [resumeDragged, setResumeDragged] = useState(false);

  // Fetch initial profile & sessions
  useEffect(() => {
    if (token) {
      fetchUserProfile();
      fetchSessions();
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const res = await apiRequest(`${API_URL}/api/auth/me`);
      if (res && res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
          if (data.statistics) {
            setStats(data.statistics);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching user profile", e);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await apiRequest(`${API_URL}/api/sessions`);
      if (res && res.ok) {
        const data = await res.json();
        // Sort sessions by creation date desc
        data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSessions(data);
      }
    } catch (e) {
      console.error("Error fetching sessions", e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("coach_jwt_token");
    setToken(null);
    setCurrentUser(null);
    setSessions([]);
    setActiveSession(null);
    setActiveQuestions([]);
    setActiveReport(null);
    setActiveTab("dashboard");
  };

  // Wrapper for fetch requests that silently refreshes expired tokens
  const apiRequest = async (url: string, options: any = {}) => {
    let currentToken = localStorage.getItem("coach_jwt_token");
    const headers = {
      "Content-Type": "application/json",
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...(options.headers || {}),
    };

    let res = await fetch(url, { ...options, headers });

    // Handle expired tokens with silent refresh attempt
    if (res.status === 401 || res.status === 403) {
      if (currentToken) {
        console.log("[Authentication System] Attempting silent token refresh...");
        try {
          const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: currentToken }),
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.token) {
              console.log("[Authentication System] Silent token refresh successful!");
              localStorage.setItem("coach_jwt_token", data.token);
              setToken(data.token);
              
              // Retry the original request with the fresh token
              const retryHeaders = {
                ...headers,
                Authorization: `Bearer ${data.token}`,
              };
              res = await fetch(url, { ...options, headers: retryHeaders });
              return res;
            }
          }
        } catch (err) {
          console.error("[Authentication System] Silent refresh error:", err);
        }
      }

      // If refresh fails or no token, force re-login
      console.warn("[Authentication System] Token validation or refresh failed. Forcing logout.");
      handleLogout();
    }

    return res;
  };

  // --- Authentications ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setIsAuthLoading(true);

    if (authView === "forgot") {
      try {
        const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authEmail }),
        });
        const data = await res.json();
        if (res.ok) {
          setAuthSuccess(data.message || "Reset token emailed successfully.");
        } else {
          setAuthError(data.error || "Failed to dispatch reset email");
        }
      } catch (err) {
        setAuthError("Failed to connect to the authentication server.");
      } finally {
        setIsAuthLoading(false);
      }
      return;
    }

    const endpoint = authView === "login" ? "/api/auth/login" : "/api/auth/signup";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("coach_jwt_token", data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setAuthPassword("");
        setAuthError("");
      } else {
        setAuthError(data.error || "Authentication failed");
      }
    } catch (err) {
      setAuthError("Could not reach authentication server.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // --- Seed Demo Materials ---
  const handleLoadDemoValues = () => {
    setSetupRole("Staff Product Designer");
    setSetupJd(`Key Responsibilities:\n- Lead design strategy for high-scale enterprise product workspaces.\n- Establish highly polished design systems, focusing on soft shadows, pixel precision, and clean negative space.\n- Work deeply with React components, Tailwind styling systems, and collaborative canvas structures.\n- Translate user feedback and usage logs into clear layout optimizations.`);
    setSetupResume(`Professional Experience:\n- Senior Designer at Linear (2024-2026). Spearheaded design components, bento widgets, and navigation drawers. Reduced layout cognitive fatigue by 25%.\n- Product Designer at Vercel (2022-2024). Created premium template frameworks focusing on standard off-white color spaces and fluid desktop layouts.\n- Core Skills: Figma, Tailwind CSS, high-fidelity prototypes, human-centered UI systems.`);
  };

  // --- Setup Mock Interview ---
  const handleSetupInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupRole || !setupJd || !setupResume) {
      alert("Please ensure role, job description, and resume are fully entered.");
      return;
    }

    setSetupIsLoading(true);
    setAgentStepProgress(10);
    setAgentStepMessage("1/5 Ingesting Resume & Job Description Document...");

    const progressSteps = [
      { progress: 30, text: "2/5 Tokenizing and Indexing into ChromaDB context..." },
      { progress: 55, text: "3/5 Running RAG-based Resume vs JD alignment gap analysis..." },
      { progress: 78, text: "4/5 Fetching industry benchmarks via Multi-Agent search grounding..." },
      { progress: 95, text: "5/5 Triggering LangGraph node: Interviewer Agent generates first question..." },
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < progressSteps.length) {
        setAgentStepProgress(progressSteps[stepIndex].progress);
        setAgentStepMessage(progressSteps[stepIndex].text);
        stepIndex++;
      } else {
        clearInterval(interval);
      }
    }, 1200);

    try {
      const parsedTopics = setupFocusTopics
        ? setupFocusTopics.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
        : [];

      const res = await apiRequest(`${API_URL}/api/sessions/setup`, {
        method: "POST",
        body: JSON.stringify({
          role: setupRole,
          type: setupType,
          maxTurns: setupMaxTurns,
          jdText: setupJd,
          resumeText: setupResume,
          difficultyMode: setupDifficultyMode,
          currentDifficulty: setupCurrentDifficulty,
          focusTopics: parsedTopics,
        }),
      });

      if (!res) {
        clearInterval(interval);
        setSetupIsLoading(false);
        return;
      }

      const data = await res.json();
      clearInterval(interval);

      if (res.ok) {
        // Trigger first question immediately
        const session = data.session;
        setAgentStepProgress(100);
        setAgentStepMessage("LangGraph pipeline successfully compiled!");
        
        // Load the session detail
        await handleViewSession(session.id);
      } else {
        alert(data.error || "Failed to initialize interview session");
        setSetupIsLoading(false);
      }
    } catch (err) {
      clearInterval(interval);
      alert("Failed to connect to the backend container.");
      setSetupIsLoading(false);
    }
  };

  // View full details of a session
  const handleViewSession = async (sessionId: string) => {
    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${sessionId}`);
      if (res && res.ok) {
        const data = await res.json();
        setActiveSession(data.session);
        setActiveQuestions(data.questions);
        setActiveReport(data.report);

        if (data.session.status === "completed") {
          setActiveTab("report");
        } else {
          // If in progress, fetch or generate the next question
          setActiveTab("interview");
          await fetchOrGenerateNextQuestion(data.session.id, data.questions);
        }
        fetchUserProfile(); // Update stats
        fetchSessions(); // Update sessions sidebar
      }
    } catch (e) {
      console.error("Failed to fetch session metadata", e);
    }
  };

  // Fetch current unanswered question, or trigger backend to generate one
  const fetchOrGenerateNextQuestion = async (sessionId: string, currentQs: any[]) => {
    // Check if there's an unanswered active question
    const unanswered = currentQs.find((q) => q.answerText === null);
    if (unanswered) {
      setCurrentQuestion(unanswered);
      setCandidateAnswer("");
      setHintText("");
      setHintWarning("");
      setLatestEvaluation(null);
      setLatestCoaching(null);
      setShowFeedbackPanel(false);
      return;
    }

    // Otherwise generate next question
    setCandidateAnswer("");
    setHintText("");
    setHintWarning("");
    setLatestEvaluation(null);
    setLatestCoaching(null);
    setShowFeedbackPanel(false);
    setCurrentQuestion(null); // loader state

    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${sessionId}/next-question`, {
        method: "POST",
      });
      if (res && res.ok) {
        const nextQ = await res.json();
        
        // If the backend generated a fallback or error, it might return a full session payload instead.
        // Let's handle if it returns nextQuestion, or if it completes the session early because of an error.
        if (nextQ.error && nextQ.session && nextQ.report) {
          // It was a graceful early completion! Let's update frontend state directly.
          alert(nextQ.error);
          setActiveSession(nextQ.session);
          setActiveReport(nextQ.report);
          setActiveQuestions(nextQ.questions);
          setActiveTab("report");
          return;
        }

        setCurrentQuestion(nextQ);
        // Refresh questions list
        const updatedRes = await apiRequest(`${API_URL}/api/sessions/${sessionId}`);
        if (updatedRes && updatedRes.ok) {
          const updatedData = await updatedRes.json();
          setActiveQuestions(updatedData.questions);
        }
      } else if (res) {
        const err = await res.json();
        alert(err.error || "Failed to fetch next question");
      }
    } catch (e) {
      console.error("Error generating question", e);
    }
  };

  // Submit Answer
  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateAnswer.trim()) return;

    setIsSubmittingAnswer(true);
    setAgentStepProgress(15);
    setAgentStepMessage("1/4 Triggering Evaluator Agent: scoring answer...");

    const evalProgress = [
      { progress: 40, text: "2/4 Triggering Coach Agent: generating gap remediation..." },
      { progress: 75, text: "3/4 Triggering Router: calibrating dynamic difficulty parameters..." },
      { progress: 95, text: "4/4 Updating state object & fetching next workflow parameters..." },
    ];

    let pIndex = 0;
    const progressInterval = setInterval(() => {
      if (pIndex < evalProgress.length) {
        setAgentStepProgress(evalProgress[pIndex].progress);
        setAgentStepMessage(evalProgress[pIndex].text);
        pIndex++;
      }
    }, 1000);

    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}/submit-answer`, {
        method: "POST",
        body: JSON.stringify({
          questionId: currentQuestion.id,
          answerText: candidateAnswer,
        }),
      });

      clearInterval(progressInterval);
      if (res && res.ok) {
        const data = await res.json();
        setLatestEvaluation(data.evaluation);
        setLatestCoaching(data.coaching);
        
        // If immediate feedback is turned on, show the feedback dashboard panel
        if (feedbackTiming === "immediate") {
          setShowFeedbackPanel(true);
        }

        // Update active session metadata
        setActiveSession(data.session);

        // Fetch refreshed session details
        const detailsRes = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}`);
        if (detailsRes && detailsRes.ok) {
          const details = await detailsRes.json();
          setActiveQuestions(details.questions);
          setActiveReport(details.report);

          if (data.isComplete) {
            setActiveReport(data.report);
            setActiveTab("report");
            setIsSubmittingAnswer(false);
            return;
          }

          // Prepare for next question
          if (feedbackTiming === "end") {
            // Advance automatically
            await fetchOrGenerateNextQuestion(activeSession.id, details.questions);
          }
        }
      } else if (res) {
        const data = await res.json();
        alert(data.error || "Failed to process evaluation");
      }
    } catch (e) {
      clearInterval(progressInterval);
      console.error("Error submitting answer", e);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Load next question manually after immediate feedback is reviewed
  const handleProceedNext = async () => {
    setShowFeedbackPanel(false);
    await fetchOrGenerateNextQuestion(activeSession.id, activeQuestions);
  };

  // Request Hint
  const handleRequestHint = async () => {
    if (!currentQuestion) return;
    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}/request-hint`, {
        method: "POST",
        body: JSON.stringify({ questionId: currentQuestion.id }),
      });
      if (res && res.ok) {
        const data = await res.json();
        setHintText(data.hint);
        setHintWarning(data.penaltyWarning);
      }
    } catch (e) {
      console.error("Failed to fetch hint", e);
    }
  };

  // End Interview Early
  const handleEndEarly = async () => {
    if (!window.confirm("Are you sure you want to conclude the mock session early? We will compile performance data for your completed answers.")) {
      return;
    }
    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}/end-early`, {
        method: "POST",
      });
      if (res && res.ok) {
        const data = await res.json();
        setActiveSession(data.session);
        setActiveReport(data.report);
        // Fetch full updated list
        const detailsRes = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}`);
        if (detailsRes && detailsRes.ok) {
          const details = await detailsRes.json();
          setActiveQuestions(details.questions);
          setActiveTab("report");
        }
      }
    } catch (e) {
      console.error("Failed to end interview early", e);
    }
  };

  // Mid-session Resume Reupload
  const handleReuploadResume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reuploadResume.trim()) return;

    setIsReuploading(true);
    try {
      const res = await apiRequest(`${API_URL}/api/sessions/${activeSession.id}/reupload`, {
        method: "POST",
        body: JSON.stringify({ resumeText: reuploadResume }),
      });
      if (res && res.ok) {
        const data = await res.json();
        alert(data.message);
        setIsReuploadOpen(false);
        setReuploadResume("");
        // Refresh session
        await handleViewSession(activeSession.id);
      } else if (res) {
        const data = await res.json();
        alert(data.error || "Failed to reupload resume");
      }
    } catch (e) {
      console.error("Error reuploading resume", e);
    } finally {
      setIsReuploading(false);
    }
  };

  // --- Compare Sessions ---
  const handleCompareSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compareSessionA || !compareSessionB) {
      alert("Please select two mock interview sessions to compare.");
      return;
    }

    setIsComparing(true);
    try {
      const res = await apiRequest(`${API_URL}/api/reports/compare`, {
        method: "POST",
        body: JSON.stringify({
          sessionAId: compareSessionA,
          sessionBId: compareSessionB,
        }),
      });
      if (res && res.ok) {
        const data = await res.json();
        setCompareResults(data);
      } else if (res) {
        const data = await res.json();
        alert(data.error || "Could not execute comparison");
      }
    } catch (e) {
      console.error("Error comparing sessions", e);
    } finally {
      setIsComparing(false);
    }
  };

  // Settings updating & cascade deleting account
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmation.toLowerCase() !== "delete") {
      alert("Please type 'delete' to confirm account deletion.");
      return;
    }

    try {
      const res = await apiRequest(`${API_URL}/api/auth/delete-account`, {
        method: "DELETE",
      });
      if (res && res.ok) {
        const data = await res.json();
        alert(data.message);
        handleLogout();
      } else if (res) {
        const data = await res.json();
        alert(data.error || "Failed to delete account");
      }
    } catch (e) {
      console.error("Error deleting account", e);
    }
  };

  // Simulated file drop readers
  const handleSimulatedFileUpload = (type: "jd" | "resume", filename: string) => {
    if (type === "jd") {
      setSetupJd(`SIMULATED UPLOADED JD (${filename}):\nTarget Role: Senior Product Engineer.\nRequired Qualifications:\n- Exceptional experience writing and debugging full-stack TypeScript applications.\n- Complete understanding of custom API systems and persistent local schemas.\n- Knowledge of visual modeling dashboards and high-speed data structures.`);
    } else {
      setSetupResume(`SIMULATED UPLOADED RESUME (${filename}):\nCandidate profile: Full-Stack Engineer.\nKey expertise:\n- 4+ years architecting web products with React, Express, and SQLite storage layers.\n- Designed dynamic mock simulation tools and automated performance testing logs.\n- Focused on clean desktop-first visual design layouts and optimized fluid spacing.`);
    }
  };

  const [fileError, setFileError] = useState<string | null>(null);

  const handleRealFileUpload = async (type: "jd" | "resume", file: File) => {
    setFileError(null);
    
    // Size check (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setFileError("Document exceeds the maximum allowed size of 5MB. Please upload a smaller file.");
      return;
    }

    // Magic Bytes Check
    try {
      const headerBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = (e) => {
          if (e.target?.result) {
            resolve(new Uint8Array(e.target.result as ArrayBuffer));
          } else {
            reject(new Error("Failed to read file headers"));
          }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsArrayBuffer(file.slice(0, 4));
      });

      const isPdf = headerBytes[0] === 0x25 && headerBytes[1] === 0x50 && headerBytes[2] === 0x44 && headerBytes[3] === 0x46; // %PDF
      const isDocx = headerBytes[0] === 0x50 && headerBytes[1] === 0x4B && headerBytes[2] === 0x03 && headerBytes[3] === 0x04; // PK.. (ZIP/DOCX)

      console.log(`[File Validation System] File header check for ${file.name}: bytes=[${Array.from(headerBytes).join(", ")}], isPdf=${isPdf}, isDocx=${isDocx}`);

      if (!isPdf && !isDocx && !file.type.startsWith("text/") && !file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
        setFileError("Invalid document type. Only PDF, DOCX, and TXT files are accepted based on magic-byte validation.");
        return;
      }

      // Read text content
      const textReader = new FileReader();
      textReader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          if (!text || text.trim().length === 0) {
            throw new Error("No readable text found inside document.");
          }
          if (type === "jd") {
            setSetupJd(text);
          } else {
            setSetupResume(text);
          }
        } catch (err: any) {
          setFileError(`Failed to extract text from document: ${err.message || "Unknown parsing issue."}. You can copy and paste the text manually below.`);
        }
      };
      textReader.onerror = () => {
        setFileError("Error reading file content. Please paste your text manually.");
      };

      if (isPdf || isDocx) {
        // Text extraction wrapped in try/except returning actionable message
        throw new Error("Standard browser binary PDF/DOCX files require a textual structure to extract client-side. Let's type or paste your credentials directly.");
      } else {
        textReader.readAsText(file);
      }
    } catch (err: any) {
      setFileError(`Failed to parse binary document: ${err.message || "Format unsupported."}. Please copy and paste your text details directly into the text area below.`);
    }
  };

  // --- RENDERING VIEWS ---

  // 1. AUTHENTICATION MODULE
  if (!token) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-md p-8">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-9 h-9 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21.438c-3.333-2-6-4.5-6-9V6.257c0-2.25 1.5-4.286 3.5-5.257 1.25-.607 2.678-.607 3.928 0 2 .971 3.5 3.007 3.5 5.257v6.181c0 4.5-2.667 7-6 9z" />
              </svg>
            </div>
            <span className="font-bold text-xl tracking-tight text-indigo-900">Adversarial Coach</span>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">
              {authView === "login" && "Welcome Back"}
              {authView === "signup" && "Create Developer Account"}
              {authView === "forgot" && "Recover Security Credentials"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {authView === "login" && "Enter your credentials to access saved mock history."}
              {authView === "signup" && "Sign up to begin custom RAG resume and JD gap analyses."}
              {authView === "forgot" && "Provide your email address to retrieve verification codes."}
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-100 text-green-700 rounded-lg text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            {authView !== "forgot" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>
                  {authView === "login" && "Access Mock System"}
                  {authView === "signup" && "Initialize Profile"}
                  {authView === "forgot" && "Send Security Link"}
                </span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-4 justify-between text-xs font-semibold text-indigo-600">
            {authView === "login" ? (
              <>
                <button type="button" onClick={() => setAuthView("signup")} className="hover:underline">
                  New? Create Account
                </button>
                <button type="button" onClick={() => setAuthView("forgot")} className="hover:underline text-slate-500 font-medium">
                  Forgot Password?
                </button>
              </>
            ) : authView === "signup" ? (
              <button type="button" onClick={() => setAuthView("login")} className="hover:underline w-full text-center">
                Already registered? Sign in instead
              </button>
            ) : (
              <button type="button" onClick={() => setAuthView("login")} className="hover:underline w-full text-center text-slate-500 font-medium">
                Return to Login screen
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP SHELL ---
  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-slate-900 overflow-hidden">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21.438c-3.333-2-6-4.5-6-9V6.257c0-2.25 1.5-4.286 3.5-5.257 1.25-.607 2.678-.607 3.928 0 2 .971 3.5 3.007 3.5 5.257v6.181c0 4.5-2.667 7-6 9z" />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-indigo-900">Adversarial</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] uppercase font-bold text-slate-400 px-3 py-2 tracking-widest">Main Modules</div>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => {
              setSetupStep(1);
              setActiveTab("setup");
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "setup" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Mock Session</span>
          </button>

          <button
            onClick={() => setActiveTab("compare")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "compare" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Compare Sessions</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === "settings" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>

          {/* Recent Sessions list */}
          <div className="mt-8 text-[10px] uppercase font-bold text-slate-400 px-3 py-2 tracking-widest">Recent Sessions</div>
          {sessions.length === 0 ? (
            <div className="text-xs text-slate-400 px-3 py-2 italic font-medium">No sessions created yet</div>
          ) : (
            <div className="space-y-1">
              {sessions.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleViewSession(s.id)}
                  className={`w-full text-left truncate flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeSession?.id === s.id
                      ? "bg-slate-100 text-indigo-700 font-semibold"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${s.status === "completed" ? "bg-green-500" : "bg-amber-400 animate-pulse"}`} />
                  <span className="truncate">{s.role}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Logged in User widget */}
        <div className="p-4 border-t border-slate-100 bg-[#FAFAFA]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                {currentUser?.email?.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{currentUser?.email}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Premium Access</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 hover:text-red-600 text-slate-400 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* CORE DISPLAY WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
        
        {/* TAB 1: USER DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-8 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Adversarial Interview Preparation</h1>
                <p className="text-sm text-slate-500">Analyze skills gaps, practice structured Q&As, and view multi-agent coach recommendations.</p>
              </div>
              <button
                onClick={() => {
                  setSetupStep(1);
                  setActiveTab("setup");
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl shadow-sm hover:bg-indigo-700 flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Begin Prep Session</span>
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Mock Sessions</div>
                <div className="text-3xl font-extrabold text-slate-800 mt-2">{stats.totalSessions}</div>
                <div className="text-xs text-slate-500 mt-1">Initiated multi-agent setups</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Reports</div>
                <div className="text-3xl font-extrabold text-slate-800 mt-2">{stats.completedSessions}</div>
                <div className="text-xs text-slate-500 mt-1">Compiled detailed score guides</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Workspace</div>
                <div className="text-3xl font-extrabold text-indigo-600 mt-2">
                  {sessions.filter((s) => s.status !== "completed").length}
                </div>
                <div className="text-xs text-slate-500 mt-1">Interviews currently in progress</div>
              </div>
            </div>

            {/* Preparation Performance Trends */}
            {stats.trends && stats.trends.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Performance Curve Trend</h2>
                <p className="text-xs text-slate-500 mb-4">Overall preparation match score progression across completed mock interviews.</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.trends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="role" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={11} domain={[0, 100]} tickLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#4F46E5" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Sessions table */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800">Preparation & Mock Archives</h2>
                <p className="text-xs text-slate-500 mt-1">View historical score metrics, re-enter sessions, or review gap remediations.</p>
              </div>

              {sessions.length === 0 ? (
                <div className="p-8 text-center">
                  <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-sm font-bold text-slate-700">No mock history available</h3>
                  <p className="text-xs text-slate-500 mt-1">Initialize your first mock setup using a Resume and target Job Description.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                        <th className="py-3 px-6">Target Role</th>
                        <th className="py-3 px-6">Interview Type</th>
                        <th className="py-3 px-6">Difficulty</th>
                        <th className="py-3 px-6">Status</th>
                        <th className="py-3 px-6">Created At</th>
                        <th className="py-3 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="py-4 px-6 font-semibold text-slate-800">{s.role}</td>
                          <td className="py-4 px-6 font-medium text-slate-500 capitalize">{s.type}</td>
                          <td className="py-4 px-6">
                            <span className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
                              {s.currentDifficulty}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                              s.status === "completed" ? "text-green-600" : "text-amber-500"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.status === "completed" ? "bg-green-500" : "bg-amber-400 animate-pulse"}`} />
                              {s.status === "completed" ? "Report Complete" : "In Progress"}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-xs text-slate-400 font-medium">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleViewSession(s.id)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                            >
                              {s.status === "completed" ? "View Report" : "Resume Practice"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SETUP SCREEN */}
        {activeTab === "setup" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Custom Mock Session Setup</h1>
              <p className="text-sm text-slate-500 mt-1">Configure your target role specifications and ingest workspace documents.</p>
            </div>

            {/* STEP INDICATORS */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  setupStep === 1 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>1</div>
                <span className="text-sm font-semibold">Target Specifications</span>
              </div>
              <div className="h-px w-12 bg-slate-200" />
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  setupStep === 2 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                }`}>2</div>
                <span className="text-sm font-semibold">Document RAG Ingestion</span>
              </div>
            </div>

            {setupIsLoading ? (
              /* SETUP / INGESTION LOADING LOG ENGINE ANIMATION */
              <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-6" />
                <h3 className="text-lg font-bold text-slate-800">Compiling LangGraph Node State</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">
                  We are indexing documents, generating custom vector collections, and building your personalized mock interview pipeline.
                </p>

                {/* Progress bars & agent log messages */}
                <div className="mt-8 max-w-lg mx-auto">
                  <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1.5">
                    <span>LangGraph Compilation</span>
                    <span>{agentStepProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${agentStepProgress}%` }} />
                  </div>
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 font-mono text-left text-xs text-indigo-700 min-h-[48px] flex items-center">
                    <Sparkles className="w-4 h-4 shrink-0 mr-2 text-indigo-500 animate-pulse" />
                    <span>{agentStepMessage}</span>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSetupInterview} className="space-y-6">
                
                {/* STEP 1: CONFIGURE BASIC INFO */}
                {setupStep === 1 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                      <h2 className="font-bold text-slate-800">Target Role & Practice Formats</h2>
                      <button
                        type="button"
                        onClick={handleLoadDemoValues}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded"
                      >
                        Load Seed Demo Values
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Target Role / Job Title</label>
                      <input
                        type="text"
                        required
                        value={setupRole}
                        onChange={(e) => setSetupRole(e.target.value)}
                        placeholder="e.g. Senior Frontend Engineer"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Interview Style Focus</label>
                        <select
                          value={setupType}
                          onChange={(e: any) => setSetupType(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="technical">Technical Q&A Practice</option>
                          <option value="behavioral">Behavioral Practice (STAR Method)</option>
                          <option value="mixed">Mixed Assessment</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Turns Capacity (Questions Max)</label>
                        <select
                          value={setupMaxTurns}
                          onChange={(e) => setSetupMaxTurns(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="3">3 Turns (Speed Run)</option>
                          <option value="5">5 Turns (Standard Fit)</option>
                          <option value="8">8 Turns (Comprehensive Challenge)</option>
                          <option value="10">10 Turns (Extensive System Design)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Difficulty Mode</label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setSetupDifficultyMode("adaptive")}
                            className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                              setupDifficultyMode === "adaptive"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Adaptive Mode
                          </button>
                          <button
                            type="button"
                            onClick={() => setSetupDifficultyMode("fixed")}
                            className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                              setupDifficultyMode === "fixed"
                                ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Fixed Level
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                          {setupDifficultyMode === "fixed" ? "Fixed Difficulty Level" : "Starting Difficulty"}
                        </label>
                        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                          {(["easy", "medium", "hard"] as const).map((diff) => (
                            <button
                              key={diff}
                              type="button"
                              onClick={() => setSetupCurrentDifficulty(diff)}
                              className={`py-1.5 text-xs font-bold rounded-md capitalize transition-all ${
                                setupCurrentDifficulty === diff
                                  ? "bg-white text-indigo-700 shadow-sm"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {diff}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Target Focus Topics (Optional)</label>
                      <input
                        type="text"
                        value={setupFocusTopics}
                        onChange={(e) => setSetupFocusTopics(e.target.value)}
                        placeholder="e.g. System Design, React, Concurrency, API Rate Limiting"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Separate topics with commas. The multi-agent router and interviewer will prioritize these specific areas.</span>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSetupStep(2)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                      >
                        <span>Configure Document Uploads</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: PASTE / DRAG RAG DOCUMENTS */}
                {setupStep === 2 && (
                  <div className="space-y-6">
                    {fileError && (
                      <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                        <span>{fileError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Job Description card */}
                      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-slate-800">Job Description Context</h3>
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">RAG BASE</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">Paste target job description details or upload a document to calibrate mock questions.</p>

                        <div
                          onDragOver={(e) => { e.preventDefault(); setJdDragged(true); }}
                          onDragLeave={() => setJdDragged(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setJdDragged(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                              handleRealFileUpload("jd", file);
                            } else {
                              handleSimulatedFileUpload("jd", "Job_Description_Full.pdf");
                            }
                          }}
                          className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all min-h-[140px] ${
                            jdDragged ? "border-indigo-600 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
                          <label className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer block text-center mb-1">
                            Choose document (.pdf, .docx, .txt)
                            <input
                              type="file"
                              accept=".pdf,.docx,.txt"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRealFileUpload("jd", file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSimulatedFileUpload("jd", "Job_Description_Full.pdf")}
                            className="text-[10px] font-medium text-slate-400 hover:text-slate-600 hover:underline"
                          >
                            Or Simulate PDF File Drop
                          </button>
                        </div>

                        <textarea
                          required
                          value={setupJd}
                          onChange={(e) => setSetupJd(e.target.value)}
                          placeholder="Paste target job requirements details here..."
                          rows={6}
                          className="w-full mt-4 p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                        />
                      </div>

                      {/* Resume card */}
                      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-slate-800">Candidate Resume Context</h3>
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">RAG BASE</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-4">Paste your qualifications or upload your CV to anchor multi-agent evaluators.</p>

                        <div
                          onDragOver={(e) => { e.preventDefault(); setResumeDragged(true); }}
                          onDragLeave={() => setResumeDragged(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setResumeDragged(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                              handleRealFileUpload("resume", file);
                            } else {
                              handleSimulatedFileUpload("resume", "Candidate_Resume_Latest.pdf");
                            }
                          }}
                          className={`flex-1 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all min-h-[140px] ${
                            resumeDragged ? "border-indigo-600 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
                          <label className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer block text-center mb-1">
                            Choose CV/Resume (.pdf, .docx, .txt)
                            <input
                              type="file"
                              accept=".pdf,.docx,.txt"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRealFileUpload("resume", file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleSimulatedFileUpload("resume", "Candidate_Resume_Latest.pdf")}
                            className="text-[10px] font-medium text-slate-400 hover:text-slate-600 hover:underline"
                          >
                            Or Simulate PDF File Drop
                          </button>
                        </div>

                        <textarea
                          required
                          value={setupResume}
                          onChange={(e) => setSetupResume(e.target.value)}
                          placeholder="Paste your resume/CV content text details here..."
                          rows={6}
                          className="w-full mt-4 p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                        />
                      </div>

                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-between">
                      <button
                        type="button"
                        onClick={() => setSetupStep(1)}
                        className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Compile LangGraph Pipeline</span>
                      </button>
                    </div>
                  </div>
                )}

              </form>
            )}
          </div>
        )}

        {/* TAB 3: LIVE INTERVIEW SCREEN */}
        {activeTab === "interview" && activeSession && (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Header controls */}
            <header className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-900 font-bold">Mock Practice Workspace</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-500 font-medium truncate max-w-xs">{activeSession.role}</span>
              </div>
              <div className="flex items-center gap-3">
                
                {/* Collapsible timing toggle */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setFeedbackTiming("immediate")}
                    className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${
                      feedbackTiming === "immediate" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Immediate Feedback
                  </button>
                  <button
                    onClick={() => setFeedbackTiming("end")}
                    className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${
                      feedbackTiming === "end" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    End Only
                  </button>
                </div>

                <button
                  onClick={() => setIsReuploadOpen(true)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Update Background</span>
                </button>

                <button
                  onClick={handleEndEarly}
                  className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors"
                >
                  End Early
                </button>
              </div>
            </header>

            {/* Main practicing chat section */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col max-w-4xl mx-auto w-full space-y-6">
              
              {/* Turn Tracker Progress */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full uppercase tracking-wider">
                    Turn {activeSession.turnCount + 1} of {activeSession.maxTurns}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Difficulty level currently adjusted to: <strong className="uppercase text-indigo-600">{activeSession.currentDifficulty}</strong>
                  </span>
                </div>
                <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${(activeSession.turnCount / activeSession.maxTurns) * 100}%` }}
                  />
                </div>
              </div>

              {/* Chat history list of previous answered questions */}
              {activeQuestions
                .filter((q) => q.answerText !== null)
                .map((q, idx) => (
                  <div key={q.id} className="space-y-4">
                    {/* Interviewer Question */}
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                        Q
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm max-w-2xl">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <span className="text-xs font-bold text-indigo-600">Interviewer Node • Q{idx + 1}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{q.topic} ({q.difficulty})</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-relaxed">{q.questionText}</p>
                      </div>
                    </div>

                    {/* Candidate Answer */}
                    <div className="flex items-start gap-4 flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 shadow-sm">
                        C
                      </div>
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 shadow-sm max-w-2xl text-right">
                        <div className="text-xs font-bold text-indigo-700 mb-2 text-left">Your Submitted Response</div>
                        <p className="text-sm text-slate-800 text-left leading-relaxed font-medium italic">"{q.answerText}"</p>
                      </div>
                    </div>

                    {/* EVALUATOR + COACH CRITIQUE PANEL (only if answered and available) */}
                    {q.scoreOverall !== null && (
                      <div className="pl-12 pr-12">
                        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-green-600 uppercase tracking-widest">Evaluator Feedback</span>
                              {q.hintRequested && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded">HINT PENALTY APPLIED</span>
                              )}
                            </div>
                            <span className="text-sm font-bold text-slate-800">
                              Question Score: <strong className="text-indigo-600 text-base">{q.scoreOverall}</strong>/10
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="p-2 bg-slate-50 rounded-lg">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Technical</div>
                              <div className="text-sm font-extrabold text-slate-700">{q.scoreTechnical}/10</div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completeness</div>
                              <div className="text-sm font-extrabold text-slate-700">{q.scoreCompleteness}/10</div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clarity</div>
                              <div className="text-sm font-extrabold text-slate-700">{q.scoreClarity}/10</div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Relevance</div>
                              <div className="text-sm font-extrabold text-slate-700">{q.scoreRelevance}/10</div>
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg leading-relaxed font-medium italic border border-slate-100">
                            <strong>Recruiter's Justification:</strong> {q.justification}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-green-50/50 border border-green-100 rounded-lg">
                              <div className="text-[10px] text-green-700 font-bold uppercase mb-2">Validated Strengths</div>
                              <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                                {q.feedbackStrengths?.map((str: string, sIdx: number) => (
                                  <li key={sIdx} className="flex gap-2">
                                    <span className="text-green-500 font-bold shrink-0">✓</span>
                                    <span>{str}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-lg">
                              <div className="text-[10px] text-amber-700 font-bold uppercase mb-2">Identified Gaps</div>
                              <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                                {q.feedbackGaps?.map((gap: string, gIdx: number) => (
                                  <li key={gIdx} className="flex gap-2">
                                    <span className="text-amber-500 font-bold shrink-0">!</span>
                                    <span>{gap}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div className="text-xs text-indigo-900 bg-indigo-50/50 p-3.5 rounded-lg border border-indigo-100">
                            <strong>Coaching Recommendation:</strong> {q.feedbackImprovement}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

              {/* ACTIVE QUESTION PORT */}
              {currentQuestion ? (
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm animate-bounce">
                      Q
                    </div>
                    <div className="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-md max-w-3xl flex-1 relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-1.5 bg-indigo-600" style={{ width: "100%" }} />
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-600">Active Adversarial Node</span>
                          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase tracking-wider">
                            {currentQuestion.difficulty}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentQuestion.topic}</span>
                      </div>
                      <p className="text-base font-bold text-slate-800 leading-relaxed mb-4">
                        {currentQuestion.questionText}
                      </p>

                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">Targeting concepts:</span>
                        {currentQuestion.expectedConcepts.map((c: string, cIdx: number) => (
                          <span key={cIdx} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold font-mono">
                            #{c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ANSWER SUBMISSION FORM */}
                  {!showFeedbackPanel && (
                    <form onSubmit={handleSubmitAnswer} className="pl-12 space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Your Answer (minimum 100 words recommended)</label>
                          <span className="text-xs text-slate-400 font-medium">{candidateAnswer.split(/\s+/).filter(Boolean).length} words</span>
                        </div>
                        <textarea
                          required
                          disabled={isSubmittingAnswer}
                          value={candidateAnswer}
                          onChange={(e) => setCandidateAnswer(e.target.value)}
                          placeholder="Formulate your structured response here..."
                          rows={6}
                          className="w-full p-4 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRequestHint}
                            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Request Hint</span>
                          </button>
                          
                          {hintText && (
                            <div className="text-xs text-indigo-700 max-w-sm ml-2 bg-indigo-50 border border-indigo-100 p-2 rounded-lg leading-relaxed">
                              {hintText} <span className="block text-[10px] font-bold text-amber-700 mt-1">{hintWarning}</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingAnswer || !candidateAnswer.trim()}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                        >
                          {isSubmittingAnswer ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <span>Submit Response</span>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* INTERMEDIATE FEEDBACK OVERLAY (Only if immediate reviewed) */}
                  {showFeedbackPanel && (
                    <div className="pl-12 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 shadow-sm space-y-6">
                      <div className="flex justify-between items-center border-b border-indigo-100 pb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-bold text-indigo-900 text-sm">Response Evaluated Successfully</h3>
                        </div>
                        <span className="text-xs text-indigo-700 font-bold">TURN COMPLETED</span>
                      </div>

                      {latestEvaluation && (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-extrabold text-slate-800">
                              Calculated Evaluation: <strong className="text-indigo-600 text-lg">{latestEvaluation.overall_score}</strong>/10
                            </span>
                            <span className="text-xs text-slate-400 font-bold">Dynamic Scoring Metrics</span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Technical Accuracy</div>
                              <div className="text-base font-extrabold text-indigo-600">{latestEvaluation.technical_correctness}/10</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Completeness</div>
                              <div className="text-base font-extrabold text-indigo-600">{latestEvaluation.completeness}/10</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Communication Clarity</div>
                              <div className="text-base font-extrabold text-indigo-600">{latestEvaluation.communication_clarity}/10</div>
                            </div>
                            <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Use of Examples</div>
                              <div className="text-base font-extrabold text-indigo-600">{latestEvaluation.use_of_examples}/10</div>
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 bg-white p-3 rounded-lg leading-relaxed border border-indigo-100">
                            <strong>Recruiter's Justification:</strong> {latestEvaluation.justification}
                          </p>
                        </div>
                      )}

                      {latestCoaching && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 bg-white rounded-lg border border-indigo-100 shadow-sm">
                            <div className="text-[10px] text-green-700 font-bold uppercase mb-2">Strengths Noted</div>
                            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                              {latestCoaching.strengths.map((sStr: string, idx: number) => (
                                <li key={idx} className="flex gap-2">
                                  <span className="text-green-500 font-bold">✓</span>
                                  <span>{sStr}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="p-4 bg-white rounded-lg border border-indigo-100 shadow-sm">
                            <div className="text-[10px] text-amber-700 font-bold uppercase mb-2">Remediation Topics</div>
                            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                              {latestCoaching.gaps.map((gStr: string, idx: number) => (
                                <li key={idx} className="flex gap-2">
                                  <span className="text-amber-500 font-bold">!</span>
                                  <span>{gStr}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={handleProceedNext}
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                        >
                          <span>Calibrate Next Question Node</span>
                          <ChevronRight className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                /* LOADER ACTIVE */
                <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-sm font-bold text-slate-700">Calibrating AI Mock Agent Parameters</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">Analyzing previous question performance metrics and extracting target JD details to compile the next challenge.</p>
                </div>
              )}

            </div>

            {/* MID-SESSION RESUME RE-UPLOAD DRAWER/MODAL */}
            {isReuploadOpen && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
                <div className="w-full max-w-lg bg-white h-full shadow-2xl p-8 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-lg font-bold text-slate-800">Adapt Resume Mid-Session</h2>
                      <button onClick={() => setIsReuploadOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      Re-uploading or editing your qualifications will trigger background RAG re-embeddings. Remaining interview turns will recalibrate to your updated skill profile.
                    </p>

                    <form onSubmit={handleReuploadResume} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Updated Qualifications / CV Details</label>
                        <textarea
                          required
                          value={reuploadResume}
                          onChange={(e) => setReuploadResume(e.target.value)}
                          placeholder="Paste updated resume details here..."
                          rows={12}
                          className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
                        />
                      </div>

                      <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setIsReuploadOpen(false)}
                          className="px-4 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isReuploading}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                        >
                          {isReuploading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              <span>Re-embed & Calibrate</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 4: FINAL REPORT DASHBOARD */}
        {activeTab === "report" && activeReport && (
          <div className="flex-1 overflow-y-auto p-8">
            
            {/* Header with quick actions */}
            <header className="mb-8 flex flex-wrap gap-4 justify-between items-center">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="text-slate-900 font-bold">Preparation Reports</span>
                  <span className="text-slate-300">/</span>
                  <span className="capitalize">{activeSession?.type} evaluation</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{activeSession?.role}</h1>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl bg-white shadow-sm hover:bg-slate-50"
                >
                  Return to Dashboard
                </button>
                <a
                  href={`${API_URL}/api/reports/${activeSession.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl shadow-sm hover:bg-indigo-700 flex items-center gap-2 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Premium PDF</span>
                </a>
              </div>
            </header>

            {/* PERFORMANCE ANALYSIS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
              
              {/* Overall Match Gauge Card */}
              <div className="md:col-span-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Overall preparation Match</div>
                <div className="text-6xl font-extrabold text-indigo-600 mt-2">{activeReport.overallScore}%</div>
                <div className="mt-4 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-extrabold uppercase tracking-wider">
                    {activeReport.overallScore >= 75 ? "STRONG" : activeReport.overallScore >= 50 ? "MEDIUM" : "WEAK"}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">preparation benchmark</span>
                </div>
              </div>

              {/* RAG Alignment percentages */}
              <div className="md:col-span-8 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Job Description vs Market Benchmark</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Dynamic gap validation extracted from vector databases and tool search edges.</p>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-center">
                      <div className="text-base font-extrabold text-slate-800">{activeReport.alignmentJd}%</div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">JD Match Alignment</div>
                    </div>
                    <div className="text-center">
                      <div className="text-base font-extrabold text-indigo-600">{activeReport.alignmentBenchmark}%</div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Market Bar Match</div>
                    </div>
                  </div>
                </div>

                {/* Score breakdown metrics visual bar */}
                <div className="flex-1 flex flex-col justify-end space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>Qualifications Relevance Alignment</span>
                      <span>{activeReport.alignmentJd}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${activeReport.alignmentJd}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>Target Market Benchmark Bar</span>
                      <span>{activeReport.alignmentBenchmark}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${activeReport.alignmentBenchmark}%` }} />
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* STRENGTHS AND REMEDIATIONS Callout blocks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              
              {/* Key strengths */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-green-50 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">Key Validated Strengths</h3>
                </div>
                <ul className="space-y-3">
                  {activeReport.strengths?.map((str: string, idx: number) => (
                    <li key={idx} className="flex gap-3">
                      <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                      <p className="text-xs text-slate-600 font-medium leading-normal">{str}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Coach Recommendations Area */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded bg-indigo-50 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm">Coach Recommendations & study topics</h3>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-4">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Target Seniority bar Overview</div>
                  <p className="text-xs text-indigo-950 font-medium leading-relaxed">
                    {activeReport.expectedSeniorityBar}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeReport.recommendedTopics?.map((topic: string, idx: number) => (
                    <span key={idx} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold tracking-wide">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

            </div>

            {/* RADAR METRICS & Q&A HISTORY TRANSCRIPT */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">
              <h2 className="text-lg font-bold text-slate-800 mb-2">Q&A Session Performance Transcript</h2>
              <p className="text-xs text-slate-500 mb-6">Review exact evaluations, scores, and coach recommendations for each mock Q&A question.</p>

              <div className="space-y-6">
                {activeQuestions.map((q, idx) => (
                  <div key={q.id} className="border border-slate-100 rounded-xl p-4 bg-[#FAFAFA] space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span>QUESTION {idx + 1} • {q.topic}</span>
                      <span className="text-indigo-600 text-sm">{q.scoreOverall || 0}/10 Points</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">Q: {q.questionText}</p>
                    {q.answerText ? (
                      <>
                        <p className="text-xs text-slate-500 font-medium italic bg-white p-3 rounded-lg border border-slate-100">
                          " {q.answerText} "
                        </p>
                        <p className="text-xs text-indigo-950 bg-indigo-50 p-3 rounded-lg border border-indigo-100 leading-normal">
                          <strong>Coach remediation:</strong> {q.feedbackImprovement || "Solid preparation alignment."}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 font-medium italic">Unanswered question.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* BENCHMARK AGENT WORKSPACE PANEL */}
            <div className="bg-[#0F172A] rounded-xl p-6 flex flex-wrap gap-4 items-center justify-between shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-extrabold text-xs">
                  AI
                </div>
                <div>
                  <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Benchmark Intelligence Agent Edge</div>
                  <p className="text-white text-xs mt-1">
                    Industry trends validation: Candidate practicing for <strong>{activeSession?.role}</strong> fits typical <strong>{activeReport.expectedSeniorityBar}</strong> profiles.
                  </p>
                  <p className="text-slate-400 text-[10px] mt-0.5">
                    Suggested tools trending in market: <strong className="text-indigo-300 font-medium">{activeReport.trendingTools?.join(", ")}</strong>.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSetupRole(activeSession?.role || "");
                  setSetupStep(1);
                  setActiveTab("setup");
                }}
                className="px-4 py-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors shadow-md"
              >
                Re-initiate session
              </button>
            </div>

          </div>
        )}

        {/* TAB 5: COMPARE WORKSPACE */}
        {activeTab === "compare" && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Multi-Session Comparator</h1>
              <p className="text-sm text-slate-500 mt-1">Validate preparation improvements by comparing progress logs across two completed sessions.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8">
              <form onSubmit={handleCompareSessions} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Primary Session (Base)</label>
                  <select
                    value={compareSessionA}
                    onChange={(e) => setCompareSessionA(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Completed Session...</option>
                    {sessions
                      .filter((s) => s.status === "completed")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.role} - {new Date(s.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Secondary Session (Compare)</label>
                  <select
                    value={compareSessionB}
                    onChange={(e) => setCompareSessionB(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Completed Session...</option>
                    {sessions
                      .filter((s) => s.status === "completed")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.role} - {new Date(s.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isComparing || !compareSessionA || !compareSessionB}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isComparing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Layers className="w-4 h-4" />
                      <span>Compare Metrics</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {compareResults ? (
              /* COMPARISON DISPLAY GRID */
              <div className="space-y-6">
                
                {/* Score comparison badges */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Session score</div>
                    <div className="text-4xl font-extrabold text-slate-700 mt-2">{compareResults.sessionA.score}%</div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">{compareResults.sessionA.role}</div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Session score</div>
                    <div className="text-4xl font-extrabold text-indigo-600 mt-2">{compareResults.sessionB.score}%</div>
                    <div className="text-xs text-slate-400 mt-1 font-medium">{compareResults.sessionB.role}</div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center flex flex-col justify-center items-center">
                    <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Score Calibration Delta</div>
                    <div className={`text-3xl font-extrabold mt-1 ${compareResults.metrics.scoreDiff >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {compareResults.metrics.scoreDiff >= 0 ? `+${compareResults.metrics.scoreDiff}` : compareResults.metrics.scoreDiff} Points
                    </div>
                    <p className="text-xs text-slate-500 font-bold mt-1.5">{compareResults.progressLabel}</p>
                  </div>
                </div>

                {/* Gaps and next steps */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-sm">Skills Remediator analysis</h3>
                  
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1.5">Actionable remediation Suggestions</div>
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">{compareResults.remediationSummary.suggestedNextSteps}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-100 rounded-lg">
                      <div className="text-xs font-bold text-green-700 uppercase mb-2">Common verified Strengths</div>
                      {compareResults.remediationSummary.commonStrengths?.length === 0 ? (
                        <p className="text-xs text-slate-400 italic font-medium">No overlapping common strengths identified.</p>
                      ) : (
                        <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                          {compareResults.remediationSummary.commonStrengths?.map((s: string, idx: number) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-green-500">✓</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-4 border border-slate-100 rounded-lg">
                      <div className="text-xs font-bold text-amber-700 uppercase mb-2">Gaps pending calibration</div>
                      <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
                        {compareResults.remediationSummary.remainingGaps?.map((g: string, idx: number) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-amber-500">!</span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 bg-white border border-slate-200 rounded-xl shadow-sm">
                <Layers className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                <h3 className="text-sm font-bold text-slate-700">No session comparison active</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">Select two completed mock interviews above to analyze prepare curve improvements.</p>
              </div>
            )}

          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {activeTab === "settings" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Workspace Settings</h1>
              <p className="text-sm text-slate-500 mt-1">Manage security clearances and configure local metadata variables.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6 space-y-4">
              <h2 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-3">User Clearance Information</h2>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div>
                  <span className="text-slate-400">EMAIL ACCOUNT</span>
                  <p className="text-slate-700 text-sm font-bold mt-1">{currentUser?.email}</p>
                </div>
                <div>
                  <span className="text-slate-400">ACCESS SCHEMAS</span>
                  <p className="text-slate-700 text-sm font-bold mt-1">JSON-Local Persistent Client</p>
                </div>
              </div>
            </div>

            {/* CASCADE ACC ACCOUNT DELETION */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-red-800 text-sm">Danger Zone: Purge Clearances</h3>
              <p className="text-xs text-red-700 leading-normal font-medium">
                Deleting your account is irreversible. All of your uploaded Job Descriptions, candidate resumes, chunk embeddings, mock interview transcripts, evaluations, and compiled score reports will be cascadingly deleted permanently.
              </p>

              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <label className="block text-xs font-bold text-red-900 uppercase tracking-wider">Type 'delete' to authorize cascade</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    required
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="delete"
                    className="px-3 py-1.5 border border-red-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 flex-1"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
                  >
                    Purge Account Clearance
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
