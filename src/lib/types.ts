export const BOARD_ROLES = ["OWNER", "MEMBER"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];
