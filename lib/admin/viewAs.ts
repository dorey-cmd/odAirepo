export const VIEW_AS_STASH_COOKIE = "odai-admin-stash";

export interface ViewAsStash {
  access_token: string;
  refresh_token: string;
  adminUserId: string;
  adminEmail: string;
  targetEmail: string;
}
