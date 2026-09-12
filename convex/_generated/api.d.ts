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
import type * as admin from "../admin.js";
import type * as adminAssetActions from "../adminAssetActions.js";
import type * as adminCatalog from "../adminCatalog.js";
import type * as adminMigrations from "../adminMigrations.js";
import type * as adminUsers from "../adminUsers.js";
import type * as agent from "../agent.js";
import type * as agentAction from "../agentAction.js";
import type * as agentPlan from "../agentPlan.js";
import type * as ai_agentContextValidation from "../ai/agentContextValidation.js";
import type * as ai_documentOcrProvider from "../ai/documentOcrProvider.js";
import type * as ai_yandexProvider from "../ai/yandexProvider.js";
import type * as aiAgentConfig from "../aiAgentConfig.js";
import type * as aiChatConfig from "../aiChatConfig.js";
import type * as auth from "../auth.js";
import type * as calibrationActions from "../calibrationActions.js";
import type * as chat from "../chat.js";
import type * as chatAction from "../chatAction.js";
import type * as crons from "../crons.js";
import type * as documentInterpretation from "../documentInterpretation.js";
import type * as documentInterpretationAction from "../documentInterpretationAction.js";
import type * as documentOcr from "../documentOcr.js";
import type * as documentOcrHttp from "../documentOcrHttp.js";
import type * as emailChange from "../emailChange.js";
import type * as emailVerification from "../emailVerification.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_accountCounts from "../lib/accountCounts.js";
import type * as lib_adminAccess from "../lib/adminAccess.js";
import type * as lib_clientCompatibility from "../lib/clientCompatibility.js";
import type * as lib_cloudConsent from "../lib/cloudConsent.js";
import type * as lib_contactVerification from "../lib/contactVerification.js";
import type * as lib_resendUsage from "../lib/resendUsage.js";
import type * as lib_sms from "../lib/sms.js";
import type * as monitoring from "../monitoring.js";
import type * as monitoringData from "../monitoringData.js";
import type * as notifications from "../notifications.js";
import type * as passwordRecovery from "../passwordRecovery.js";
import type * as phoneChange from "../phoneChange.js";
import type * as profile from "../profile.js";
import type * as publicCatalog from "../publicCatalog.js";
import type * as registrationConsent from "../registrationConsent.js";
import type * as reviewAccess from "../reviewAccess.js";
import type * as seed from "../seed.js";
import type * as smsAuth from "../smsAuth.js";
import type * as telemetry from "../telemetry.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  admin: typeof admin;
  adminAssetActions: typeof adminAssetActions;
  adminCatalog: typeof adminCatalog;
  adminMigrations: typeof adminMigrations;
  adminUsers: typeof adminUsers;
  agent: typeof agent;
  agentAction: typeof agentAction;
  agentPlan: typeof agentPlan;
  "ai/agentContextValidation": typeof ai_agentContextValidation;
  "ai/documentOcrProvider": typeof ai_documentOcrProvider;
  "ai/yandexProvider": typeof ai_yandexProvider;
  aiAgentConfig: typeof aiAgentConfig;
  aiChatConfig: typeof aiChatConfig;
  auth: typeof auth;
  calibrationActions: typeof calibrationActions;
  chat: typeof chat;
  chatAction: typeof chatAction;
  crons: typeof crons;
  documentInterpretation: typeof documentInterpretation;
  documentInterpretationAction: typeof documentInterpretationAction;
  documentOcr: typeof documentOcr;
  documentOcrHttp: typeof documentOcrHttp;
  emailChange: typeof emailChange;
  emailVerification: typeof emailVerification;
  health: typeof health;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/accountCounts": typeof lib_accountCounts;
  "lib/adminAccess": typeof lib_adminAccess;
  "lib/clientCompatibility": typeof lib_clientCompatibility;
  "lib/cloudConsent": typeof lib_cloudConsent;
  "lib/contactVerification": typeof lib_contactVerification;
  "lib/resendUsage": typeof lib_resendUsage;
  "lib/sms": typeof lib_sms;
  monitoring: typeof monitoring;
  monitoringData: typeof monitoringData;
  notifications: typeof notifications;
  passwordRecovery: typeof passwordRecovery;
  phoneChange: typeof phoneChange;
  profile: typeof profile;
  publicCatalog: typeof publicCatalog;
  registrationConsent: typeof registrationConsent;
  reviewAccess: typeof reviewAccess;
  seed: typeof seed;
  smsAuth: typeof smsAuth;
  telemetry: typeof telemetry;
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
