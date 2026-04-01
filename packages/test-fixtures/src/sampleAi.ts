import type {
  AppSettings,
  RecommendedModel,
  ScratchpadChatResponse,
  ScratchpadResult,
  ScratchpadSession,
} from "@novelforge/domain";

const timestamp = "2026-03-15T00:00:00.000Z";

export const sampleAppSettings: AppSettings = {
  ai: {
    defaultProvider: "gemini",
    providers: {
      gemini: {
        enabled: true,
        hasApiKey: true,
        defaultModel: "gemini-2.5-flash",
      },
      groq: {
        enabled: true,
        hasApiKey: false,
        defaultModel: "llama-3.3-70b-versatile",
      },
      openrouter: {
        enabled: true,
        hasApiKey: false,
        defaultModel: "openrouter/free",
      },
    },
  },
};

export const sampleRecommendedModels: RecommendedModel[] = [
  {
    providerId: "gemini",
    modelId: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Best default for long-context story planning and rapid drafting help.",
  },
  {
    providerId: "groq",
    modelId: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile",
    description: "Fast general-purpose chat for iterative brainstorming and rewrites.",
  },
  {
    providerId: "openrouter",
    modelId: "openrouter/free",
    label: "OpenRouter Free Router",
    description: "Routes to currently free OpenRouter models for flexible experimentation.",
  },
];

export const sampleScratchpadResult: ScratchpadResult = {
  summary: "Converted the pasted premise into a chapter spine and early scene beats.",
  chapters: [
    {
      targetChapterId: null,
      title: "Chapter 1: The Signal in the Fog",
      summary: "Mara intercepts a forbidden distress signal while salvaging the reef.",
      purpose: "Launch the external mystery and force Mara to make a risky choice.",
      majorEvents: ["Mara finds the signal", "The salvage crew argues", "Mara keeps the core"],
      emotionalMovement: "Routine to dread",
      characterFocusIds: ["char-mara"],
      setupPayoffNotes: "The signal repeats the captain's last words in reverse.",
    },
  ],
  scenes: [
    {
      targetSceneId: null,
      chapterId: null,
      chapterTitleHint: "Chapter 1: The Signal in the Fog",
      title: "Reefline Salvage",
      summary: "Mara hears the signal inside a wrecked beacon.",
      purpose: "Inciting disturbance",
      beatOutline:
        "Mara finds the beacon core.\nThe crew pushes to sell it.\nMara pockets it before anyone else can stop her.",
      conflict: "The crew wants profit; Mara wants answers.",
      outcome: "Mara hides the beacon core before the others can sell it.",
      povCharacterId: null,
      location: "Sunken reef",
      timeLabel: "Pre-dawn",
      involvedCharacterIds: [],
      continuityTags: ["signal", "captain"],
      dependencySceneIds: [],
      manuscriptText: "<p>The reef clicked like teeth beneath the skiff.</p>",
    },
  ],
  characters: [
    {
      targetCharacterId: null,
      name: "Mara Thorne",
      role: "Protagonist",
      personalityTraits: ["stubborn", "protective", "curious"],
      motivations: "Discover what happened to the vanished rescue ship.",
      fears: "Becoming responsible for another doomed expedition.",
      worldview: "Useful truths are usually the ones other people bury.",
      speakingStyle: "Blunt, dry, often masking care with sarcasm.",
      vocabularyTendencies: "Maritime slang, spare concrete language.",
      speechRhythm: "Quick when pressured, clipped when emotional.",
      emotionalBaseline: "Guarded resolve.",
      relationships: [],
      secrets: "She already knows the missing captain was carrying contraband.",
      arcDirection: "From lone scavenger to reluctant leader.",
      contradictions: "Rejects responsibility while constantly rescuing others.",
    },
  ],
  continuityNotes: [
    "If the captain's final message appears here, later reveals must preserve why no one else recognized it sooner.",
  ],
};

export const sampleScratchpadSession: ScratchpadSession = {
  id: "scratchpad-session-1",
  title: "Signal premise workshop",
  messages: [
    {
      id: "scratchpad-message-1",
      role: "user",
      content:
        "I have a foggy ocean salvage novel idea. Help me turn it into opening chapters and a main character card.",
      createdAt: timestamp,
      action: "create-chapters",
    },
  ],
  latestResult: sampleScratchpadResult,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const sampleScratchpadChatResponse: ScratchpadChatResponse = {
  providerId: "gemini",
  modelId: "gemini-2.5-flash",
  assistantMessage: {
    id: "scratchpad-message-2",
    role: "assistant",
    content:
      "I turned your pasted premise into an opening chapter spine, an initial scene, and a protagonist card you can review before applying.",
    createdAt: timestamp,
    action: "create-chapters",
  },
  result: sampleScratchpadResult,
};
