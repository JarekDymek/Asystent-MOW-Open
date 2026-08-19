/* Shared application state. Data constants are loaded before this file. */
/* ────────────────────────────────
   STATE
──────────────────────────────── */
let chatHistory = [];
let harmContent = null;
let harmFileName = null;
let speechRecognition = null;
let isListening = false;
let aiAttachments = [];
let harmAttachment = null;
let imageZoom = 1;
let weeklyPlan = null;
let knowledgeItems = [];
let centralKnowledgeItems = [];
let centralKnowledgeMeta = null;
let currentInfoItems = [];
let internatScheduleIndex = [];
const savedDayScheduleState = localStorage.getItem('mow_day_schedule_collapsed_v1');
let dayScheduleCollapsed = savedDayScheduleState === null ? true : savedDayScheduleState === '1';
const CHAT_DRAFT_KEY = 'mow_chat_draft_v2';
const KNOWLEDGE_KEY = 'mow_knowledge_base_v1';
const CENTRAL_KNOWLEDGE_KEY = 'mow_central_knowledge_cache_v1';
