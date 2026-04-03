import { useEffect } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { ProjectGate } from "@/features/project/ProjectGate";
import { ChaptersView } from "@/features/chapters/ChaptersView";
import { ChapterDetailView } from "@/features/chapters/ChapterDetailView";
import { ScenesView } from "@/features/scenes/ScenesView";
import { SceneWorkspaceView } from "@/features/scenes/SceneWorkspaceView";
import { CharactersView } from "@/features/characters/CharactersView";
import { SuggestionsView } from "@/features/suggestions/SuggestionsView";
import { SettingsView } from "@/features/settings/SettingsView";
import { ScratchpadView } from "@/features/scratchpad/ScratchpadView";
import { StoryOverviewView } from "@/features/story/StoryOverviewView";
import { useUiStore } from "@/store/uiStore";

function RootLayout() {
  return (
    <ProjectGate>
      <Outlet />
    </ProjectGate>
  );
}

function IndexRouteComponent() {
  return <ChaptersView />;
}

function CharacterDetailRouteComponent() {
  const { characterId } = useParams({ from: "/characters/$characterId" });
  const setSelectedCharacterId = useUiStore((state) => state.setSelectedCharacterId);

  useEffect(() => {
    setSelectedCharacterId(characterId);
  }, [characterId, setSelectedCharacterId]);

  return <CharactersView />;
}

function SuggestionDetailRouteComponent() {
  const { suggestionId } = useParams({ from: "/suggestions/$suggestionId" });
  const setSelectedSuggestionId = useUiStore((state) => state.setSelectedSuggestionId);

  useEffect(() => {
    setSelectedSuggestionId(suggestionId);
  }, [setSelectedSuggestionId, suggestionId]);

  return <SuggestionsView />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRouteComponent,
});

const chaptersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "chapters",
  component: ChaptersView,
});

const storyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "story",
  component: StoryOverviewView,
});

const chapterDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "chapters/$chapterId",
  component: ChapterDetailView,
});

const scenesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "scenes",
  component: ScenesView,
});

const sceneWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "scenes/$sceneId",
  component: SceneWorkspaceView,
});

const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "characters",
  component: CharactersView,
});

const characterDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "characters/$characterId",
  component: CharacterDetailRouteComponent,
});

const suggestionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "suggestions",
  component: SuggestionsView,
});

const suggestionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "suggestions/$suggestionId",
  component: SuggestionDetailRouteComponent,
});

const scratchpadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "scratchpad",
  component: ScratchpadView,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  storyRoute,
  chaptersRoute,
  chapterDetailRoute,
  scenesRoute,
  sceneWorkspaceRoute,
  charactersRoute,
  characterDetailRoute,
  suggestionsRoute,
  suggestionDetailRoute,
  scratchpadRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
