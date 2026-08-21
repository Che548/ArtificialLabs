/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agent from "../agent.js";
import type * as agentAction from "../agentAction.js";
import type * as agentPlan from "../agentPlan.js";
import type * as ai_agentContextValidation from "../ai/agentContextValidation.js";
import type * as ai_yandexProvider from "../ai/yandexProvider.js";
import type * as aiAgentConfig from "../aiAgentConfig.js";
import type * as aiChatConfig from "../aiChatConfig.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatAction from "../chatAction.js";
import type * as crons from "../crons.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as notifications from "../notifications.js";
import type * as profile from "../profile.js";
import type * as seed from "../seed.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agent: typeof agent;
  agentAction: typeof agentAction;
  agentPlan: typeof agentPlan;
  "ai/agentContextValidation": typeof ai_agentContextValidation;
  "ai/yandexProvider": typeof ai_yandexProvider;
  aiAgentConfig: typeof aiAgentConfig;
  aiChatConfig: typeof aiChatConfig;
  auth: typeof auth;
  chat: typeof chat;
  chatAction: typeof chatAction;
  crons: typeof crons;
  health: typeof health;
  http: typeof http;
  "lib/access": typeof lib_access;
  notifications: typeof notifications;
  profile: typeof profile;
  seed: typeof seed;
  testing: typeof testing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  pushNotifications: import("@convex-dev/expo-push-notifications/_generated/component.js").ComponentApi<"pushNotifications">;
};
