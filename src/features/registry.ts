import type { ComponentType } from "react";
import type { ModuleId } from "../shared/modules";
import { LocalAiScreen } from "./ai/LocalAiScreen";
import { ApiBuilderScreen } from "./api/ApiBuilderScreen";
import { JsonStudioScreen } from "./json/JsonStudioScreen";
import { JwtInspectorScreen } from "./jwt/JwtInspectorScreen";
import { NetworkScreen } from "./network/NetworkScreen";
import { PageInspectorScreen } from "./page/PageInspectorScreen";

export const MODULE_SCREENS = {
  network: NetworkScreen,
  json: JsonStudioScreen,
  jwt: JwtInspectorScreen,
  api: ApiBuilderScreen,
  ai: LocalAiScreen,
  page: PageInspectorScreen,
} satisfies Record<ModuleId, ComponentType>;
