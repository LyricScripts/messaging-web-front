import type { AppConfig } from "../config/env";

export type BackendV2Client = {
  config: AppConfig;
  searchUsers: (jwtToken: string, query: string) => Promise<UserSearchResponse>;
  getUser: (jwtToken: string, userId: string) => Promise<UserResponse>;
  addContact: (
    jwtToken: string,
    request: AddContactRequest,
  ) => Promise<ContactResponse>;
  listContacts: (jwtToken: string) => Promise<ContactListResponse>;
  deleteContact: (jwtToken: string, contactId: string) => Promise<void>;
  resolveContactConversation: (
    jwtToken: string,
    contactUserId: string,
  ) => Promise<ContactConversationResponse>;
  getUserPresence: (
    jwtToken: string,
    userId: string,
  ) => Promise<UserPresenceResponse>;
  getContactsPresence: (jwtToken: string) => Promise<ContactPresenceListResponse>;
  markMessageSeen: (
    jwtToken: string,
    messageId: string,
  ) => Promise<MessageReceiptResponse>;
};

export type UserResponse = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
};

export type UserSearchResponse = {
  users: UserResponse[];
};

export type AddContactRequest = {
  contact: string;
};

export type ContactResponse = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  availability_status?: PresenceStatus | null;
};

export type ContactListResponse = {
  contacts: ContactResponse[];
};

export type ContactConversationResponse = {
  conversation_id: string;
  type: "direct";
  participants: ContactConversationParticipant[];
};

export type ContactConversationParticipant = {
  user_id: string;
  display_name: string;
  can_read: boolean;
  can_send: boolean;
};

export type PresenceStatus = "online" | "offline" | "away";

export type UserPresenceResponse = {
  user_id: string;
  status: PresenceStatus;
  last_active_at?: string;
};

export type ContactPresenceListResponse = {
  contacts: ContactPresenceResponse[];
};

export type ContactPresenceResponse = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  status: PresenceStatus;
  last_active_at?: string;
};

export type MessageReceiptResponse = {
  message_id: string;
  conversation_id: string;
  user_id: string;
  status: "delivered" | "seen";
  created_at: string;
  updated_at: string;
};

type RequestOptions = {
  jwtToken?: string;
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
};

/**
 * Creates a backend v2 API client configured with the supplied application settings.
 *
 * @param config - Application configuration used by the client for API requests
 * @returns A backend v2 API client
 */
export function createBackendV2Client(config: AppConfig): BackendV2Client {
  return {
    config,
    searchUsers: (jwtToken: string, query: string) => {
      const params = new URLSearchParams({ query });
      return requestJson<UserSearchResponse>(
        config.apiBaseUrl,
        `/users/search?${params.toString()}`,
        { jwtToken },
      );
    },
    getUser: (jwtToken: string, userId: string) =>
      requestJson<UserResponse>(
        config.apiBaseUrl,
        `/users/${encodeURIComponent(userId)}`,
        { jwtToken },
      ),
    addContact: (jwtToken: string, request: AddContactRequest) =>
      requestJson<ContactResponse>(config.apiBaseUrl, "/me/contacts", {
        jwtToken,
        body: request,
        method: "POST",
      }),
    listContacts: (jwtToken: string) =>
      requestJson<ContactListResponse>(config.apiBaseUrl, "/me/contacts", {
        jwtToken,
      }),
    deleteContact: (jwtToken: string, contactId: string) => {
      return requestNoContent(
        config.apiBaseUrl,
        `/me/contacts/${encodeURIComponent(contactId)}`,
        { jwtToken, method: "DELETE" },
      );
    },
    resolveContactConversation: (jwtToken: string, contactUserId: string) =>
      requestJson<ContactConversationResponse>(
        config.apiBaseUrl,
        `/me/contacts/${encodeURIComponent(contactUserId)}/conversation`,
        {
          jwtToken,
          method: "POST",
        },
      ),
    getUserPresence: (jwtToken: string, userId: string) =>
      requestJson<UserPresenceResponse>(
        config.apiBaseUrl,
        `/presence/users/${encodeURIComponent(userId)}`,
        { jwtToken },
      ),
    getContactsPresence: (jwtToken: string) =>
      requestJson<ContactPresenceListResponse>(
        config.apiBaseUrl,
        "/contacts/presence",
        { jwtToken },
      ),
    markMessageSeen: (jwtToken: string, messageId: string) =>
      requestJson<MessageReceiptResponse>(
        config.apiBaseUrl,
        `/messages/${encodeURIComponent(messageId)}/seen`,
        {
          jwtToken,
          method: "PATCH",
        },
      ),
  };
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  options: RequestOptions = {},
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: buildHeaders(options),
    method: options.method ?? "GET",
  });

  if (!response.ok) {
    throw await buildBackendV2Error(path, response);
  }

  return response.json() as Promise<T>;
}

async function requestNoContent(
  apiBaseUrl: string,
  path: string,
  options: RequestOptions = {},
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: buildHeaders(options),
    method: options.method ?? "GET",
  });

  if (!response.ok) {
    throw await buildBackendV2Error(path, response);
  }
}

function buildHeaders(options: RequestOptions) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.jwtToken?.trim()) {
    headers.Authorization = `Bearer ${options.jwtToken.trim()}`;
  }
  return headers;
}

async function buildBackendV2Error(path: string, response: Response) {
  const detail = await response.text().catch(() => "");
  const message = detail.trim()
    ? `${path} returned ${response.status}: ${detail.trim()}`
    : `${path} returned ${response.status}`;
  return new BackendV2Error(message, response.status);
}

export class BackendV2Error extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendV2Error";
    this.status = status;
  }
}
