export const NUTRITION_ROLES = ["admin", "manager", "nutrition_coach"] as const;

export const FOLLOW_REQUIREMENTS = [
  "unreviewed",
  "need_follow",
  "no_follow",
  "monitor",
  "paused",
] as const;

export type FollowRequirement = (typeof FOLLOW_REQUIREMENTS)[number];

export const WORKFLOW_STATUSES = [
  "not_started",
  "in_progress",
  "waiting_client",
  "waiting_pt",
  "followed",
  "follow_again",
  "escalate",
] as const;

export type NutritionWorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const NUTRITION_PRIORITIES = ["p1", "p2", "p3"] as const;
export type NutritionPriority = (typeof NUTRITION_PRIORITIES)[number];

export const FOLLOW_METHODS = ["chat", "call", "in_person", "pt_support"] as const;
export type NutritionFollowMethod = (typeof FOLLOW_METHODS)[number];

export const FOLLOW_OUTCOMES = [
  "complete",
  "needs_follow_again",
  "waiting_client",
  "waiting_pt",
  "escalate",
] as const;

export type NutritionFollowOutcome = (typeof FOLLOW_OUTCOMES)[number];

export const FOLLOW_REQUIREMENT_LABELS: Record<FollowRequirement, string> = {
  unreviewed: "Chưa phân loại",
  need_follow: "Cần Follow",
  no_follow: "Không cần Follow",
  monitor: "Theo dõi",
  paused: "Tạm hoãn",
};

export const WORKFLOW_STATUS_LABELS: Record<NutritionWorkflowStatus, string> = {
  not_started: "Chưa xử lý",
  in_progress: "Đang xử lý",
  waiting_client: "Chờ khách",
  waiting_pt: "Chờ PT",
  followed: "Đã Follow",
  follow_again: "Cần Follow lại",
  escalate: "Escalate",
};

export const PRIORITY_LABELS: Record<NutritionPriority, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export const FOLLOW_METHOD_LABELS: Record<NutritionFollowMethod, string> = {
  chat: "Chat",
  call: "Call",
  in_person: "In-person",
  pt_support: "PT hỗ trợ",
};

export const FOLLOW_OUTCOME_LABELS: Record<NutritionFollowOutcome, string> = {
  complete: "Hoàn tất",
  needs_follow_again: "Cần follow tiếp",
  waiting_client: "Chờ khách",
  waiting_pt: "Chờ PT",
  escalate: "Escalate",
};

export const FOLLOW_REASON_OPTIONS = [
  "Regular Follow",
  "Không phản hồi",
  "Nutrition issue",
  "Weight plateau",
  "Low compliance",
  "Client complaint",
  "Renew",
  "PT Request",
  "New Client",
  "Manager Review",
] as const;

export function isNutritionRole(role: string | null | undefined) {
  return NUTRITION_ROLES.includes(
    String(role || "") as (typeof NUTRITION_ROLES)[number],
  );
}

export function isFollowRequirement(value: unknown): value is FollowRequirement {
  return FOLLOW_REQUIREMENTS.includes(value as FollowRequirement);
}

export function isWorkflowStatus(
  value: unknown,
): value is NutritionWorkflowStatus {
  return WORKFLOW_STATUSES.includes(value as NutritionWorkflowStatus);
}

export function isNutritionPriority(value: unknown): value is NutritionPriority {
  return NUTRITION_PRIORITIES.includes(value as NutritionPriority);
}

export function isFollowMethod(value: unknown): value is NutritionFollowMethod {
  return FOLLOW_METHODS.includes(value as NutritionFollowMethod);
}

export function isFollowOutcome(value: unknown): value is NutritionFollowOutcome {
  return FOLLOW_OUTCOMES.includes(value as NutritionFollowOutcome);
}

export function workflowStatusFromOutcome(
  outcome: NutritionFollowOutcome,
): NutritionWorkflowStatus {
  switch (outcome) {
    case "complete":
      return "followed";
    case "needs_follow_again":
      return "follow_again";
    case "waiting_client":
      return "waiting_client";
    case "waiting_pt":
      return "waiting_pt";
    case "escalate":
      return "escalate";
  }
}
