import type {
  Chapter,
  Character,
  ProjectSnapshot,
  ScratchpadAction,
  ScratchpadProjectContext,
  Scene,
  Suggestion,
} from "@novelforge/domain";
import type { WorkbenchActivityId, WorkbenchTab, WorkbenchTabKind } from "@/store/uiStore";

const chapterRoutePattern = /^\/chapters\/([^/]+)$/;
const sceneRoutePattern = /^\/scenes\/([^/]+)$/;
const characterRoutePattern = /^\/characters\/([^/]+)$/;
const suggestionRoutePattern = /^\/suggestions\/([^/]+)$/;

export interface WorkbenchDocumentMeta {
  title: string;
  shortTitle: string;
  activity: WorkbenchActivityId;
  aiContextPrefix: string;
  aiContextLabel: string;
  defaultAiAction: ScratchpadAction;
  projectContext: ScratchpadProjectContext;
}

function matchEntityRoute(pattern: RegExp, pathname: string) {
  return pattern.exec(pathname)?.[1] ?? null;
}

function buildSceneProjectContext(scene: Scene): ScratchpadProjectContext {
  return {
    chapterIds: scene.chapterId ? [scene.chapterId] : [],
    sceneIds: [scene.id],
    characterIds: [
      ...(scene.povCharacterId ? [scene.povCharacterId] : []),
      ...scene.involvedCharacterIds,
    ],
  };
}

function buildSuggestionProjectContext(suggestion: Suggestion): ScratchpadProjectContext {
  const refs = [suggestion.sourceObject, suggestion.impactedObject];

  return refs.reduce<ScratchpadProjectContext>(
    (context, ref) => {
      if (ref.kind === "chapter") {
        context.chapterIds.push(ref.id);
      }
      if (ref.kind === "scene") {
        context.sceneIds.push(ref.id);
      }
      if (ref.kind === "character") {
        context.characterIds.push(ref.id);
      }
      return context;
    },
    { chapterIds: [], sceneIds: [], characterIds: [] },
  );
}

function dedupeContext(context: ScratchpadProjectContext): ScratchpadProjectContext {
  return {
    chapterIds: [...new Set(context.chapterIds)],
    sceneIds: [...new Set(context.sceneIds)],
    characterIds: [...new Set(context.characterIds)],
  };
}

export function buildWorkbenchTab(pathname: string): WorkbenchTab | null {
  if (pathname === "/story") {
    return {
      id: "story",
      kind: "story",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  if (pathname === "/chapters") {
    return {
      id: "chapters",
      kind: "chapters",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  const chapterId = matchEntityRoute(chapterRoutePattern, pathname);
  if (chapterId) {
    return {
      id: `chapter:${chapterId}`,
      kind: "chapter",
      route: pathname,
      entityId: chapterId,
      closeable: true,
    };
  }

  if (pathname === "/scenes") {
    return {
      id: "scenes",
      kind: "scenes",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  const sceneId = matchEntityRoute(sceneRoutePattern, pathname);
  if (sceneId) {
    return {
      id: `scene:${sceneId}`,
      kind: "scene",
      route: pathname,
      entityId: sceneId,
      closeable: true,
    };
  }

  if (pathname === "/characters") {
    return {
      id: "characters",
      kind: "characters",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  const characterId = matchEntityRoute(characterRoutePattern, pathname);
  if (characterId) {
    return {
      id: `character:${characterId}`,
      kind: "character",
      route: pathname,
      entityId: characterId,
      closeable: true,
    };
  }

  if (pathname === "/suggestions") {
    return {
      id: "suggestions",
      kind: "suggestions",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  const suggestionId = matchEntityRoute(suggestionRoutePattern, pathname);
  if (suggestionId) {
    return {
      id: `suggestion:${suggestionId}`,
      kind: "suggestion",
      route: pathname,
      entityId: suggestionId,
      closeable: true,
    };
  }

  if (pathname === "/scratchpad") {
    return {
      id: "scratchpad",
      kind: "scratchpad",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  if (pathname === "/settings") {
    return {
      id: "settings",
      kind: "settings",
      route: pathname,
      entityId: null,
      closeable: true,
    };
  }

  return null;
}

export function getWorkbenchActivityForTabKind(kind: WorkbenchTabKind): WorkbenchActivityId {
  if (kind === "story" || kind === "chapters" || kind === "chapter" || kind === "scenes" || kind === "scene") {
    return "story";
  }

  if (kind === "characters" || kind === "character") {
    return "characters";
  }

  if (kind === "suggestions" || kind === "suggestion") {
    return "suggestions";
  }

  if (kind === "scratchpad") {
    return "ai";
  }

  return "explorer";
}

function findChapter(snapshot: ProjectSnapshot, chapterId: string | null) {
  return chapterId ? snapshot.chapters.find((chapter) => chapter.id === chapterId) ?? null : null;
}

function findScene(snapshot: ProjectSnapshot, sceneId: string | null) {
  return sceneId ? snapshot.scenes.find((scene) => scene.id === sceneId) ?? null : null;
}

function findCharacter(snapshot: ProjectSnapshot, characterId: string | null) {
  return characterId
    ? snapshot.characters.find((character) => character.id === characterId) ?? null
    : null;
}

function findSuggestion(snapshot: ProjectSnapshot, suggestionId: string | null) {
  return suggestionId
    ? snapshot.suggestions.find((suggestion) => suggestion.id === suggestionId) ?? null
    : null;
}

function getChapterMeta(chapter: Chapter): WorkbenchDocumentMeta {
  return {
    title: chapter.title,
    shortTitle: chapter.title,
    activity: "story",
    aiContextPrefix: "Active chapter",
    aiContextLabel: chapter.title,
    defaultAiAction: "create-scenes",
    projectContext: {
      chapterIds: [chapter.id],
      sceneIds: [],
      characterIds: chapter.characterFocusIds,
    },
  };
}

function getSceneMeta(snapshot: ProjectSnapshot, scene: Scene): WorkbenchDocumentMeta {
  const chapterTitle = findChapter(snapshot, scene.chapterId)?.title ?? "Unassigned";
  return {
    title: scene.title,
    shortTitle: scene.title,
    activity: "story",
    aiContextPrefix: "Active scene",
    aiContextLabel: `${chapterTitle} / ${scene.title}`,
    defaultAiAction: "extract-continuity-notes",
    projectContext: dedupeContext(buildSceneProjectContext(scene)),
  };
}

function getCharacterMeta(character: Character): WorkbenchDocumentMeta {
  return {
    title: character.name,
    shortTitle: character.name,
    activity: "characters",
    aiContextPrefix: "Active character",
    aiContextLabel: character.name,
    defaultAiAction: "create-character-card",
    projectContext: {
      chapterIds: [],
      sceneIds: [],
      characterIds: [character.id],
    },
  };
}

function getSuggestionMeta(suggestion: Suggestion): WorkbenchDocumentMeta {
  return {
    title: suggestion.title,
    shortTitle: suggestion.title,
    activity: "suggestions",
    aiContextPrefix: "Chatting about",
    aiContextLabel: suggestion.title,
    defaultAiAction: "extract-continuity-notes",
    projectContext: dedupeContext(buildSuggestionProjectContext(suggestion)),
  };
}

export function getWorkbenchDocumentMeta(
  tab: WorkbenchTab | null,
  snapshot: ProjectSnapshot | null,
): WorkbenchDocumentMeta | null {
  if (!tab) {
    return null;
  }

  if (!snapshot) {
    return {
      title: "NovelForge",
      shortTitle: "NovelForge",
      activity: getWorkbenchActivityForTabKind(tab.kind),
      aiContextPrefix: "Chatting about",
      aiContextLabel: "NovelForge",
      defaultAiAction: "summarize",
      projectContext: {
        chapterIds: [],
        sceneIds: [],
        characterIds: [],
      },
    };
  }

  if (tab.kind === "story") {
    return {
      title: "Story Outline",
      shortTitle: "Story",
      activity: "story",
      aiContextPrefix: "Chatting about",
      aiContextLabel: snapshot.project.title,
      defaultAiAction: "summarize",
      projectContext: {
        chapterIds: snapshot.chapters.map((chapter) => chapter.id),
        sceneIds: [],
        characterIds: [],
      },
    };
  }

  if (tab.kind === "chapters") {
    return {
      title: "Chapters",
      shortTitle: "Chapters",
      activity: "story",
      aiContextPrefix: "Chatting about",
      aiContextLabel: "Chapter Planner",
      defaultAiAction: "create-chapters",
      projectContext: {
        chapterIds: snapshot.chapters.map((chapter) => chapter.id),
        sceneIds: [],
        characterIds: [],
      },
    };
  }

  if (tab.kind === "chapter") {
    const chapter = findChapter(snapshot, tab.entityId);
    return chapter ? getChapterMeta(chapter) : null;
  }

  if (tab.kind === "scenes") {
    return {
      title: "Scenes Board",
      shortTitle: "Scenes",
      activity: "story",
      aiContextPrefix: "Chatting about",
      aiContextLabel: "Scene Board",
      defaultAiAction: "create-scenes",
      projectContext: {
        chapterIds: snapshot.chapters.map((chapter) => chapter.id),
        sceneIds: snapshot.scenes.map((scene) => scene.id),
        characterIds: [],
      },
    };
  }

  if (tab.kind === "scene") {
    const scene = findScene(snapshot, tab.entityId);
    return scene ? getSceneMeta(snapshot, scene) : null;
  }

  if (tab.kind === "characters") {
    return {
      title: "Characters",
      shortTitle: "Characters",
      activity: "characters",
      aiContextPrefix: "Chatting about",
      aiContextLabel: "Character Workspace",
      defaultAiAction: "create-character-card",
      projectContext: {
        chapterIds: [],
        sceneIds: [],
        characterIds: snapshot.characters.map((character) => character.id),
      },
    };
  }

  if (tab.kind === "character") {
    const character = findCharacter(snapshot, tab.entityId);
    return character ? getCharacterMeta(character) : null;
  }

  if (tab.kind === "suggestions") {
    return {
      title: "Suggestions Inbox",
      shortTitle: "Suggestions",
      activity: "suggestions",
      aiContextPrefix: "Chatting about",
      aiContextLabel: "Suggestions Inbox",
      defaultAiAction: "extract-continuity-notes",
      projectContext: {
        chapterIds: [],
        sceneIds: [],
        characterIds: [],
      },
    };
  }

  if (tab.kind === "suggestion") {
    const suggestion = findSuggestion(snapshot, tab.entityId);
    return suggestion ? getSuggestionMeta(suggestion) : null;
  }

  if (tab.kind === "scratchpad") {
    return {
      title: "Scratchpad",
      shortTitle: "Scratchpad",
      activity: "ai",
      aiContextPrefix: "Chatting about",
      aiContextLabel: "Scratchpad",
      defaultAiAction: "summarize",
      projectContext: {
        chapterIds: [],
        sceneIds: [],
        characterIds: [],
      },
    };
  }

  return {
    title: "Settings",
    shortTitle: "Settings",
    activity: "explorer",
    aiContextPrefix: "Chatting about",
    aiContextLabel: "Settings",
    defaultAiAction: "summarize",
    projectContext: {
      chapterIds: [],
      sceneIds: [],
      characterIds: [],
    },
  };
}
