import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BackendV2Error,
  createBackendV2Client,
  type ContactConversationResponse,
  type ContactPresenceResponse,
  type ContactResponse,
  type PresenceStatus,
  type UserResponse,
} from "../../api/v2Client";
import {
  createHttpClient,
  HttpApiError,
  type AttachmentResponse,
  type ConversationMessageResponse,
} from "../../api/httpClient";
import {
  createAuthClient,
  type AuthUserResponse,
} from "../../api/authClient";
import {
  loadStoredAccessToken,
  refreshStoredSession,
} from "../../auth/sessionStorage";
import { loadStoredConfig } from "../../config/storage";
import {
  createMessagingWebSocket,
  type MessageCreatedEvent,
  type MessageReceiptEvent,
  type MessagingWebSocket,
  type ServerEvent,
} from "../../realtime/webSocketClient";
import "./glassChat.css";

type GlassMessage = {
  id: string;
  clientMessageId?: string;
  conversationId: string;
  senderId: string;
  body: string;
  messageType: "text" | "file" | "system";
  attachmentId?: string;
  createdAt: string;
  policyStatus: "clean" | "flagged" | "blocked";
  receiptStatus?: "sending" | "sent" | "delivered" | "seen";
};

type GlassChatAppProps = {
  currentUser: AuthUserResponse;
};

/**
 * Renders a direct messaging interface for the current user, including contacts, conversations, messages, and attachments.
 *
 * @param currentUser - The authenticated user whose contacts and conversations are displayed.
 */
export function GlassChatApp({ currentUser }: GlassChatAppProps) {
  const webSocketRef = useRef<MessagingWebSocket | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const authReconnectAttemptsRef = useRef(0);
  const authRefreshInFlightRef = useRef(false);
  const attachmentLoadsRef = useRef<Set<string>>(new Set());
  const activeUser = {
    id: currentUser.user_id,
    email: currentUser.email ?? "",
    username: currentUser.username ?? currentUser.user_id,
    display_name: currentUser.display_name,
  };
  const [contacts, setContacts] = useState<ContactResponse[]>([]);
  const [searchResults, setSearchResults] = useState<UserResponse[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, ContactPresenceResponse>
  >({});
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [activeConversation, setActiveConversation] =
    useState<ContactConversationResponse | null>(null);
  const [messages, setMessages] = useState<GlassMessage[]>([]);
  const [historyStatus, setHistoryStatus] = useState<{
    state: "idle" | "loading" | "loaded" | "error";
    label: string;
  }>({ state: "idle", label: "" });
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingAttachment, setPendingAttachment] =
    useState<AttachmentResponse | null>(null);
  const [attachmentsById, setAttachmentsById] = useState<
    Record<string, AttachmentResponse>
  >({});
  const [attachmentStatus, setAttachmentStatus] = useState<{
    state: "idle" | "uploading" | "error";
    label: string;
  }>({ state: "idle", label: "" });
  const [socketStatus, setSocketStatus] = useState<{
    state: "idle" | "connecting" | "connected" | "joined" | "error";
    label: string;
  }>({
    state: "idle",
    label: "Select a contact to connect.",
  });
  const [conversationStatus, setConversationStatus] = useState<{
    state: "idle" | "resolving" | "open" | "error";
    label: string;
  }>({
    state: "idle",
    label: "",
  });
  const [contactDraft, setContactDraft] = useState("");
  const [contactStatus, setContactStatus] = useState<{
    state: "idle" | "loading" | "adding" | "ok" | "error";
    label: string;
  }>({
    state: "idle",
    label: "",
  });
  const v2Client = useMemo(
    () => createBackendV2Client(loadStoredConfig()),
    [],
  );
  const httpClient = useMemo(() => createHttpClient(loadStoredConfig()), []);
  const selectedContact =
    contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const selectedContactPresence = selectedContact
    ? presenceByUserId[selectedContact.id]
    : null;

  useEffect(() => {
    return () => {
      webSocketRef.current?.disconnect();
      webSocketRef.current = null;
    };
  }, []);

  useEffect(() => {
    void refreshContacts();
  }, [activeUser.id]);

  useEffect(() => {
    if (!activeConversation) {
      authReconnectAttemptsRef.current = 0;
      disconnectGlassSocket();
      setSocketStatus({
        state: "idle",
        label: "Select a contact to connect.",
      });
      return;
    }

    connectGlassSocket(activeConversation.conversation_id);
    void loadConversationHistory(activeConversation.conversation_id);
  }, [activeConversation?.conversation_id, activeUser.id]);

  async function loadConversationHistory(conversationId: string) {
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) return;
    setHistoryStatus({ state: "loading", label: "Loading messages..." });
    try {
      const response = await httpClient.getConversationMessages(
        jwtToken,
        conversationId,
        { limit: 50 },
      );
      const history = response.messages.map((message) =>
        messageFromHistory(message, activeUser.id),
      );
      setMessages((current) => mergeMessages(current, history));
      setHistoryStatus({
        state: "loaded",
        label: "",
      });
      history.forEach((message) => {
        if (message.attachmentId) {
          void loadAttachmentMetadata(message.attachmentId);
        }
      });
      history.forEach((message) => void markContactMessageSeen(message));
    } catch (error) {
      setHistoryStatus({
        state: "error",
        label:
          error instanceof Error
            ? error.message
            : "Could not load message history.",
      });
    }
  }

  async function refreshContacts() {
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) return;
    setContactStatus({ state: "loading", label: "Loading contacts..." });
    try {
      const response = await v2Client.listContacts(jwtToken);
      setContacts(uniqueContacts(response.contacts));
      await refreshContactPresence();
      setSelectedContactId((current) => {
        if (
          current &&
          response.contacts.some((contact) => contact.id === current)
        ) {
          return current;
        }
        return null;
      });
      setActiveConversation(null);
      setConversationStatus({ state: "idle", label: "" });
      setContactStatus({
        state: "ok",
        label: response.contacts.length
          ? `${response.contacts.length} contact${response.contacts.length === 1 ? "" : "s"} loaded.`
          : "",
      });
    } catch (error) {
      setContactStatus({
        state: "error",
        label: friendlyContactError(error),
      });
    }
  }

  async function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken || !contactDraft.trim()) {
      return;
    }

    setContactStatus({ state: "loading", label: "Searching people..." });
    try {
      const response = await v2Client.searchUsers(jwtToken, contactDraft.trim());
      const results = response.users.filter((user) => user.id !== activeUser.id);
      setSearchResults(results);
      setContactStatus({
        state: "ok",
        label: results.length
          ? `${results.length} result${results.length === 1 ? "" : "s"} found.`
          : "No people matched that search.",
      });
    } catch (error) {
      setSearchResults([]);
      setContactStatus({ state: "error", label: friendlyContactError(error) });
    }
  }

  async function handleContactAdd(user: UserResponse) {
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) return;
    setContactStatus({ state: "adding", label: "Adding contact..." });
    try {
      const created = await v2Client.addContact(jwtToken, {
        contact: user.username || user.email,
      });
      setContacts((current) => uniqueContacts([...current, created]));
      setContactDraft("");
      setSearchResults([]);
      setContactStatus({ state: "ok", label: "Contact added." });
      await refreshContacts();
      await handleContactSelect(created);
    } catch (error) {
      setContactStatus({
        state: "error",
        label: friendlyContactError(error),
      });
    }
  }

  async function handleContactSelect(contact: ContactResponse) {
    setSelectedContactId(contact.id);
    setActiveConversation(null);
    setMessages([]);
    setHistoryStatus({ state: "idle", label: "" });
    seenMessageIdsRef.current = new Set();
    setMessageDraft("");
    setSelectedFile(null);
    setPendingAttachment(null);
    setAttachmentStatus({ state: "idle", label: "" });
    disconnectGlassSocket();
    setConversationStatus({
      state: "resolving",
      label: `Opening chat with ${contact.display_name}...`,
    });

    try {
      const jwtToken = loadStoredAccessToken().trim();
      if (!jwtToken) return;
      const resolved = await v2Client.resolveContactConversation(
        jwtToken,
        contact.id,
      );
      setActiveConversation(resolved);
      setConversationStatus({
        state: "open",
        label: "Direct conversation ready.",
      });
    } catch (error) {
      setActiveConversation(null);
      setConversationStatus({
        state: "error",
        label: friendlyConversationError(error),
      });
    }
  }

  function connectGlassSocket(conversationId: string, accessToken?: string) {
    const jwtToken = (accessToken ?? loadStoredAccessToken()).trim();
    if (!jwtToken) {
      setSocketStatus({
        state: "error",
        label: "A messaging session is required to connect to chat.",
      });
      return;
    }

    disconnectGlassSocket();
    setSocketStatus({ state: "connecting", label: "Connecting to chat..." });

    let client: MessagingWebSocket;
    client = createMessagingWebSocket(loadStoredConfig(), jwtToken, {
      onOpen: () => {
        setSocketStatus({
          state: "connected",
          label: "Socket connected. Waiting for the server...",
        });
        void refreshContactPresence();
      },
      onMessage: (event) => handleGlassSocketMessage(event, conversationId),
      onClose: (event) => {
        if (webSocketRef.current !== client) return;
        webSocketRef.current = null;
        if (isAuthenticationClose(event)) {
          void reconnectAfterTokenRefresh(conversationId);
          return;
        }
        setSocketStatus({ state: "idle", label: "Disconnected." });
        void refreshContactPresence();
      },
      onError: () => {
        setSocketStatus({
          state: "error",
          label: "Could not connect to chat. Check the backend and session.",
        });
      },
    });

    webSocketRef.current = client;
    client.connect();
  }

  function disconnectGlassSocket() {
    webSocketRef.current?.disconnect();
    webSocketRef.current = null;
  }

  async function reconnectAfterTokenRefresh(conversationId: string) {
    if (authRefreshInFlightRef.current) return;
    if (authReconnectAttemptsRef.current >= 1) {
      setSocketStatus({
        state: "error",
        label: "The messaging session expired. Sign in again.",
      });
      return;
    }

    authRefreshInFlightRef.current = true;
    authReconnectAttemptsRef.current += 1;
    setSocketStatus({
      state: "connecting",
      label: "Refreshing the session and reconnecting...",
    });
    try {
      const refreshedSession = await refreshStoredSession(
        createAuthClient(loadStoredConfig()),
      );
      connectGlassSocket(conversationId, refreshedSession.accessToken);
    } catch {
      setSocketStatus({
        state: "error",
        label: "The messaging session expired. Sign in again.",
      });
    } finally {
      authRefreshInFlightRef.current = false;
    }
  }

  async function refreshContactPresence() {
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) return;
    try {
      const response = await v2Client.getContactsPresence(jwtToken);
      setPresenceByUserId(presenceMapFromContacts(response.contacts));
    } catch {
      // Presence is advisory for this phase; contact loading and chat still work.
    }
  }

  function handleGlassSocketMessage(event: ServerEvent, conversationId: string) {
    if (event.type === "connection.ready") {
      authReconnectAttemptsRef.current = 0;
      setSocketStatus({
        state: "connected",
        label: "Connected. Joining conversation...",
      });
      try {
        const socket = webSocketRef.current;
        if (!socket) {
          throw new Error("WebSocket is not connected");
        }
        socket.send({
          type: "conversation.join",
          conversation_id: conversationId,
        });
      } catch (error) {
        setSocketStatus({
          state: "error",
          label: error instanceof Error ? error.message : "Conversation join failed.",
        });
      }
      return;
    }

    if (
      event.type === "conversation.joined" &&
      event.conversation_id === conversationId
    ) {
      setSocketStatus({ state: "joined", label: "Live chat connected." });
      return;
    }

    if (isMessageCreatedEvent(event) && event.conversation_id === conversationId) {
      const nextMessage = messageFromEvent(event, activeUser.id);
      setMessages((current) => upsertMessageFromServer(current, nextMessage));
      if (nextMessage.attachmentId) {
        void loadAttachmentMetadata(nextMessage.attachmentId);
      }
      void markContactMessageSeen(nextMessage);
      setSocketStatus({ state: "joined", label: "Live chat connected." });
      return;
    }

    if (isMessageReceiptEvent(event) && event.conversation_id === conversationId) {
      setMessages((current) => updateMessageReceipt(current, event));
      return;
    }

    if (event.type === "error") {
      if (
        typeof event.error === "string" &&
        isAuthenticationError(event.error)
      ) {
        disconnectGlassSocket();
        void reconnectAfterTokenRefresh(conversationId);
        return;
      }
      setSocketStatus({
        state: "error",
        label: typeof event.error === "string" ? event.error : "Chat error.",
      });
    }
  }

  async function handleMessageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFile || pendingAttachment) {
      await sendAttachmentMessage();
      return;
    }
    const body = messageDraft.trim();
    if (!activeConversation || !body) {
      return;
    }

    const clientMessageId = createClientMessageId();
    const optimisticMessage: GlassMessage = {
      id: clientMessageId,
      clientMessageId,
      conversationId: activeConversation.conversation_id,
      senderId: activeUser.id,
      body,
      createdAt: new Date().toISOString(),
      policyStatus: "clean",
      receiptStatus: "sending",
      messageType: "text",
    };

    try {
      const socket = webSocketRef.current;
      if (!socket) {
        throw new Error("WebSocket is not connected");
      }
      setMessages((current) => appendMessageIfNew(current, optimisticMessage));
      socket.send({
        type: "message.send",
        conversation_id: activeConversation.conversation_id,
        client_message_id: clientMessageId,
        body,
      });
      setMessageDraft("");
      setSocketStatus({ state: "joined", label: "Sending message..." });
    } catch (error) {
      setSocketStatus({
        state: "error",
        label: error instanceof Error ? error.message : "Message send failed.",
      });
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
    }
  }

  function handleSelectedFile(file: File | null) {
    setSelectedFile(file);
    setPendingAttachment(null);
    setAttachmentStatus({ state: "idle", label: file ? file.name : "" });
  }

  async function sendAttachmentMessage() {
    if (!activeConversation || (!selectedFile && !pendingAttachment)) return;
    const jwtToken = loadStoredAccessToken().trim();
    const socket = webSocketRef.current;
    if (!jwtToken || !socket) {
      setAttachmentStatus({
        state: "error",
        label: "Connect to the conversation before sending a file.",
      });
      return;
    }

    setAttachmentStatus({ state: "uploading", label: "Uploading file..." });
    let attachment = pendingAttachment;
    try {
      if (!attachment) {
        if (!selectedFile) return;
        const uploadedAttachment = await httpClient.uploadAttachment(
          jwtToken,
          activeConversation.conversation_id,
          selectedFile,
        );
        attachment = uploadedAttachment;
        setPendingAttachment(uploadedAttachment);
        setAttachmentsById((current) => ({
          ...current,
          [uploadedAttachment.id]: uploadedAttachment,
        }));
      }
      const readyAttachment = attachment;

      const clientMessageId = createClientMessageId();
      socket.send({
        type: "message.send",
        conversation_id: activeConversation.conversation_id,
        client_message_id: clientMessageId,
        body: readyAttachment.original_name,
        attachment_id: readyAttachment.id,
      });
      setMessages((current) =>
        appendMessageIfNew(current, {
          id: clientMessageId,
          clientMessageId,
          conversationId: activeConversation.conversation_id,
          senderId: activeUser.id,
          body: readyAttachment.original_name,
          messageType: "file",
          attachmentId: readyAttachment.id,
          createdAt: new Date().toISOString(),
          policyStatus: "clean",
          receiptStatus: "sending",
        }),
      );
      setSelectedFile(null);
      setPendingAttachment(null);
      setAttachmentStatus({ state: "idle", label: "" });
      setSocketStatus({ state: "joined", label: "Sending file..." });
    } catch (error) {
      setAttachmentStatus({
        state: "error",
        label: friendlyAttachmentError(error),
      });
    }
  }

  async function loadAttachmentMetadata(attachmentId: string) {
    if (attachmentsById[attachmentId] || attachmentLoadsRef.current.has(attachmentId)) {
      return;
    }
    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) return;
    attachmentLoadsRef.current.add(attachmentId);
    try {
      const attachment = await httpClient.getAttachment(jwtToken, attachmentId);
      setAttachmentsById((current) => ({ ...current, [attachmentId]: attachment }));
    } catch {
      // The message remains usable with its attachment id when metadata is unavailable.
    } finally {
      attachmentLoadsRef.current.delete(attachmentId);
    }
  }

  async function markContactMessageSeen(message: GlassMessage) {
    if (message.senderId === activeUser.id) {
      return;
    }
    if (seenMessageIdsRef.current.has(message.id)) {
      return;
    }

    const jwtToken = loadStoredAccessToken().trim();
    if (!jwtToken) {
      return;
    }

    seenMessageIdsRef.current.add(message.id);
    try {
      await v2Client.markMessageSeen(jwtToken, message.id);
    } catch {
      seenMessageIdsRef.current.delete(message.id);
    }
  }

  return (
    <main className="glass-chat-page">
      <section className="glass-chat-shell" aria-label="Glass chat preview">
        <aside className="glass-sidebar" aria-label="Contacts">
          <div className="glass-sidebar__profile">
            <div className="glass-avatar glass-avatar--large">
              <span>{getInitials(activeUser.display_name)}</span>
              <span className="glass-presence glass-presence--online" />
            </div>
            <div>
              <p className="glass-kicker">Glass chat v2</p>
              <h1>{activeUser.display_name}</h1>
              <span>@{activeUser.username}</span>
            </div>
          </div>

          <form className="glass-contact-form" onSubmit={handleContactSubmit}>
            <label className="glass-search">
              <span>Find people</span>
              <input
                aria-label="Search by email or username"
                disabled={
                  contactStatus.state === "adding" ||
                  contactStatus.state === "loading"
                }
                onChange={(event) => setContactDraft(event.target.value)}
                placeholder="email or username"
                type="text"
                value={contactDraft}
              />
            </label>
            <button
              className="glass-contact-form__button"
              disabled={
                !contactDraft.trim() ||
                contactStatus.state === "adding" ||
                contactStatus.state === "loading"
              }
              type="submit"
            >
              Search
            </button>
          </form>

          {contactStatus.label ? (
            <p
              className={`glass-contact-status glass-contact-status--${contactStatus.state}`}
              role={contactStatus.state === "error" ? "alert" : "status"}
            >
              {contactStatus.label}
            </p>
          ) : null}

          {searchResults.length ? (
            <div className="glass-search-results" aria-label="Search results">
              {searchResults.map((user) => (
                <article className="glass-search-result" key={user.id}>
                  <div>
                    <strong>{user.display_name}</strong>
                    <span>@{user.username}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleContactAdd(user)}
                    disabled={contactStatus.state === "adding"}
                  >
                    Add
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          <div className="glass-contact-list" aria-label="Contacts">
            {contacts.length === 0 && contactStatus.state !== "loading" ? (
              <article className="glass-empty-contact">
                <strong>No contacts yet</strong>
                <span>Add someone by email or username to start the list.</span>
              </article>
            ) : null}
            {contacts.map((contact) => (
              <button
                className={`glass-contact ${
                  contact.id === selectedContactId ? "glass-contact--active" : ""
                }`}
                key={contact.id}
                onClick={() => void handleContactSelect(contact)}
                type="button"
              >
                <div className="glass-avatar">
                  <span>{getInitials(contact.display_name)}</span>
                  <span
                    className={`glass-presence glass-presence--${presenceStatusFor(
                      presenceByUserId[contact.id]?.status,
                    )}`}
                  />
                </div>
                <div className="glass-contact__body">
                  <div className="glass-contact__line">
                    <strong>{contact.display_name}</strong>
                    <span>@{contact.username}</span>
                  </div>
                  <p className="glass-contact__preview">
                    {presenceLabel(presenceByUserId[contact.id])} | {contact.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="glass-conversation" aria-label="Conversation">
          <header className="glass-conversation__header">
            <div className="glass-conversation__identity">
              <div className="glass-avatar glass-avatar--large">
                <span>
                  {selectedContact
                    ? getInitials(selectedContact.display_name)
                    : "--"}
                </span>
                <span
                  className={`glass-presence glass-presence--${presenceStatusFor(
                    selectedContactPresence?.status,
                  )}`}
                />
              </div>
              <div>
                <p className="glass-kicker">
                  {activeConversation ? "Direct conversation" : "Contact preview"}
                </p>
                <h2>
                  {selectedContact
                    ? selectedContact.display_name
                    : "Select a contact"}
                </h2>
                <span>
                  {selectedContact
                    ? `@${selectedContact.username} | ${presenceLabel(
                        selectedContactPresence,
                      )}`
                    : `Signed in as @${activeUser.username}`}
                </span>
              </div>
            </div>
          </header>

          <div className="glass-message-stage" aria-label="Message preview">
            <div className="glass-day-chip">
              {activeConversation
                ? activeConversation.conversation_id
                : selectedContact
                  ? "Opening conversation"
                  : "Choose a contact"}
            </div>
            {!selectedContact ? (
              <article className="glass-conversation-empty">
                <strong>No contact selected</strong>
                <span>
                  Select someone from the sidebar to open a direct conversation.
                </span>
              </article>
            ) : null}
            {selectedContact && conversationStatus.label ? (
              <article
                className={`glass-conversation-empty glass-conversation-empty--${conversationStatus.state}`}
                role={conversationStatus.state === "error" ? "alert" : "status"}
              >
                <strong>
                  {conversationStatus.state === "resolving"
                    ? "Opening conversation"
                    : conversationStatus.state === "error"
                      ? "Conversation unavailable"
                      : "Conversation ready"}
                </strong>
                <span>{conversationStatus.label}</span>
              </article>
            ) : null}
            {selectedContact && activeConversation && messages.length === 0 ? (
              <article className="glass-conversation-empty">
                <strong>
                  {historyStatus.state === "loading"
                    ? "Loading messages"
                    : historyStatus.state === "error"
                      ? "Message history unavailable"
                      : "No messages yet"}
                </strong>
                <span>
                  {historyStatus.label ||
                    "Send the first message in this direct conversation."}
                </span>
              </article>
            ) : null}
            {selectedContact && activeConversation
              ? messages.map((message, index) => (
                  <article
                    className={`glass-message-row ${
                      message.senderId === activeUser.id
                        ? "glass-message-row--own"
                        : "glass-message-row--other"
                    }`}
                    key={message.id}
                  >
                    <div
                      className={`glass-message glass-message--${messageTone(
                        message,
                      )} ${
                        index === messages.length - 1
                          ? "glass-message--latest"
                          : ""
                      }`}
                    >
                      {message.messageType === "file" && message.attachmentId ? (
                        <div className="glass-attachment">
                          <strong>
                            {attachmentsById[message.attachmentId]
                              ?.original_name ?? message.body ?? "Attachment"}
                          </strong>
                          <span>
                            {attachmentDescription(
                              attachmentsById[message.attachmentId],
                            )}
                          </span>
                          <a
                            href={attachmentHref(
                              httpClient.config.apiBaseUrl,
                              message.attachmentId,
                              attachmentsById[message.attachmentId],
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open attachment
                          </a>
                        </div>
                      ) : (
                        <p>{message.body}</p>
                      )}
                      <footer>
                        <time>{formatMessageTime(message.createdAt)}</time>
                        {message.policyStatus !== "clean" ? (
                          <span className="glass-receipt">
                            {message.policyStatus}
                          </span>
                        ) : null}
                        {message.senderId === activeUser.id &&
                        message.receiptStatus ? (
                          <span
                            className={`glass-receipt glass-receipt--${message.receiptStatus}`}
                            title={message.receiptStatus}
                          >
                            {receiptLabel(message.receiptStatus)}
                          </span>
                        ) : null}
                      </footer>
                    </div>
                  </article>
                ))
              : null}
          </div>

          {selectedFile || attachmentStatus.label ? (
            <div
              className={`glass-attachment-status glass-attachment-status--${attachmentStatus.state}`}
              role={attachmentStatus.state === "error" ? "alert" : "status"}
            >
              <span>{attachmentStatus.label || selectedFile?.name}</span>
              {selectedFile && attachmentStatus.state !== "uploading" ? (
                <button type="button" onClick={() => handleSelectedFile(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}

          <form
            className="glass-composer"
            aria-label="Message composer"
            onSubmit={handleMessageSubmit}
          >
            <label className="glass-composer__tool" title="Attach a file">
              <span aria-hidden="true">+</span>
              <input
                className="glass-composer__file"
                key={selectedFile ? `${selectedFile.name}-${selectedFile.size}` : "empty"}
                type="file"
                onChange={(event) =>
                  handleSelectedFile(event.target.files?.[0] ?? null)
                }
                disabled={
                  !activeConversation ||
                  socketStatus.state !== "joined" ||
                  attachmentStatus.state === "uploading"
                }
              />
            </label>
            <input
              aria-label="Message preview input"
              disabled={!activeConversation || socketStatus.state !== "joined"}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder={
                activeConversation && selectedContact
                  ? `Message ${selectedContact.display_name}`
                  : selectedContact
                    ? "Conversation is opening"
                    : "Select a contact first"
              }
              type="text"
              value={messageDraft}
            />
            <button
              className="glass-composer__send"
              disabled={
                !activeConversation ||
                socketStatus.state !== "joined" ||
                (!messageDraft.trim() && !selectedFile && !pendingAttachment) ||
                attachmentStatus.state === "uploading"
              }
              type="submit"
            >
              Go
            </button>
          </form>
          <p
            className={`glass-socket-status glass-socket-status--${socketStatus.state}`}
            role={socketStatus.state === "error" ? "alert" : "status"}
          >
            {socketStatus.label}
          </p>
        </section>
      </section>
    </main>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
}

function uniqueContacts(contacts: ContactResponse[]) {
  const seen = new Set<string>();
  const result: ContactResponse[] = [];
  for (const contact of contacts) {
    if (seen.has(contact.id)) {
      continue;
    }
    seen.add(contact.id);
    result.push(contact);
  }
  return result;
}

function presenceMapFromContacts(contacts: ContactPresenceResponse[]) {
  return contacts.reduce<Record<string, ContactPresenceResponse>>(
    (result, contact) => {
      result[contact.id] = contact;
      return result;
    },
    {},
  );
}

function presenceStatusFor(status: PresenceStatus | undefined) {
  return status === "online" || status === "away" ? status : "offline";
}

function presenceLabel(presence: ContactPresenceResponse | null | undefined) {
  if (!presence || presence.status === "offline") {
    return presence?.last_active_at
      ? `last active ${formatPresenceTime(presence.last_active_at)}`
      : "offline";
  }
  if (presence.status === "away") {
    return "away";
  }
  return "online";
}

function formatPresenceTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appendMessageIfNew(messages: GlassMessage[], nextMessage: GlassMessage) {
  if (messages.some((message) => message.id === nextMessage.id)) {
    return messages;
  }
  return [...messages, nextMessage];
}

function upsertMessageFromServer(
  messages: GlassMessage[],
  nextMessage: GlassMessage,
) {
  const matchingClientIndex = nextMessage.clientMessageId
    ? messages.findIndex(
        (message) => message.clientMessageId === nextMessage.clientMessageId,
      )
    : -1;
  if (matchingClientIndex >= 0) {
    return messages.map((message, index) =>
      index === matchingClientIndex
        ? {
            ...nextMessage,
            receiptStatus: maxReceiptStatus(
              message.receiptStatus ?? "sending",
              nextMessage.receiptStatus ?? "sent",
            ),
          }
        : message,
    );
  }
  return appendMessageIfNew(messages, nextMessage);
}

function updateMessageReceipt(
  messages: GlassMessage[],
  event: MessageReceiptEvent,
) {
  return messages.map((message) => {
    if (message.id !== event.message_id) {
      return message;
    }
    return {
      ...message,
      receiptStatus: maxReceiptStatus(
        message.receiptStatus ?? "sent",
        event.status,
      ),
    };
  });
}

function messageFromEvent(
  event: MessageCreatedEvent,
  activeUserId: string | undefined,
): GlassMessage {
  return {
    id: event.message_id,
    clientMessageId: event.client_message_id,
    conversationId: event.conversation_id,
    senderId: event.sender_id,
    body: event.body,
    messageType: event.message_type,
    attachmentId: event.attachment_id,
    createdAt: event.created_at || new Date().toISOString(),
    policyStatus: event.policy_status,
    receiptStatus: event.sender_id === activeUserId ? "sent" : undefined,
  };
}

function messageFromHistory(
  message: ConversationMessageResponse,
  activeUserId: string,
): GlassMessage {
  return {
    id: message.id,
    clientMessageId: message.client_message_id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    body: message.body,
    messageType: message.message_type,
    attachmentId: message.attachment_id,
    createdAt: message.created_at,
    policyStatus: message.policy_status,
    receiptStatus:
      message.receipt_status ??
      (message.sender_id === activeUserId ? "sent" : undefined),
  };
}

function mergeMessages(...messageGroups: GlassMessage[][]) {
  let merged: GlassMessage[] = [];
  for (const message of messageGroups.flat()) {
    merged = upsertMessageFromServer(merged, message);
  }
  return merged.sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function maxReceiptStatus(
  current: NonNullable<GlassMessage["receiptStatus"]>,
  next: NonNullable<GlassMessage["receiptStatus"]>,
) {
  const rank: Record<NonNullable<GlassMessage["receiptStatus"]>, number> = {
    sending: 0,
    sent: 1,
    delivered: 2,
    seen: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

function receiptLabel(status: NonNullable<GlassMessage["receiptStatus"]>) {
  if (status === "sending") {
    return "...";
  }
  if (status === "sent") {
    return "✓";
  }
  if (status === "delivered") {
    return "✓✓";
  }
  return "✓✓ seen";
}

function messageTone(message: GlassMessage) {
  if (message.policyStatus === "flagged" || message.policyStatus === "blocked") {
    return "alert";
  }
  return "normal";
}

function formatMessageTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function attachmentDescription(attachment: AttachmentResponse | undefined) {
  if (!attachment) return "Attachment details unavailable";
  return `${attachment.mime_type || "File"} · ${formatFileSize(attachment.size_bytes)}`;
}

function attachmentHref(
  apiBaseUrl: string,
  attachmentId: string,
  attachment: AttachmentResponse | undefined,
) {
  const providedUrl = attachment?.download_url ?? attachment?.url;
  if (providedUrl) {
    try {
      return new URL(providedUrl, apiBaseUrl).toString();
    } catch {
      // Fall back to the authenticated attachment endpoint.
    }
  }
  return `${apiBaseUrl}/attachments/${encodeURIComponent(attachmentId)}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createClientMessageId() {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMessageCreatedEvent(event: ServerEvent): event is MessageCreatedEvent {
  return (
    event.type === "message.created" &&
    "message_id" in event &&
    typeof event.message_id === "string" &&
    "conversation_id" in event &&
    typeof event.conversation_id === "string" &&
    "sender_id" in event &&
    typeof event.sender_id === "string" &&
    "body" in event &&
    typeof event.body === "string"
  );
}

function isMessageReceiptEvent(event: ServerEvent): event is MessageReceiptEvent {
  return (
    (event.type === "message.delivered" || event.type === "message.seen") &&
    "message_id" in event &&
    typeof event.message_id === "string" &&
    "conversation_id" in event &&
    typeof event.conversation_id === "string" &&
    "status" in event &&
    (event.status === "delivered" || event.status === "seen")
  );
}

function isAuthenticationClose(event: CloseEvent) {
  return (
    event.code === 1008 ||
    event.code === 4001 ||
    event.code === 4003 ||
    isAuthenticationError(event.reason)
  );
}

function isAuthenticationError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated") ||
    normalized.includes("token expired") ||
    normalized.includes("invalid token") ||
    normalized.includes("authentication")
  );
}

function friendlyContactError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (error instanceof BackendV2Error && error.status === 401) {
    return "Your messaging session has expired. Sign in again.";
  }
  if (error instanceof BackendV2Error && error.status === 403) {
    return "You do not have permission to update these contacts.";
  }
  if (error instanceof BackendV2Error && error.status === 404) {
    return "No user was found for that email or username.";
  }
  if (error instanceof BackendV2Error && error.status === 409) {
    return "That person is already in your contacts.";
  }
  if (message.includes("cannot add self")) {
    return "You cannot add yourself as a contact.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "The backend is not reachable. Start the backend and try again.";
  }
  return "Could not update contacts. Try again in a moment.";
}

function friendlyConversationError(error: unknown) {
  if (error instanceof BackendV2Error && error.status === 401) {
    return "Your messaging session has expired. Sign in again.";
  }
  if (error instanceof BackendV2Error && error.status === 403) {
    return "This user is not in your contacts yet.";
  }
  if (error instanceof BackendV2Error && error.status === 404) {
    return "That contact or conversation could not be found.";
  }
  if (error instanceof BackendV2Error && error.status === 409) {
    return "A direct conversation could not be resolved right now.";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("failed to fetch")) {
    return "The backend is not reachable. Start the backend and try again.";
  }
  return "Could not open this direct conversation. Try again in a moment.";
}

function friendlyAttachmentError(error: unknown) {
  if (error instanceof HttpApiError && error.status === 400) {
    return "This file could not be uploaded. Check the file and try again.";
  }
  if (error instanceof HttpApiError && error.status === 401) {
    return "Your messaging session has expired. Sign in again.";
  }
  if (error instanceof HttpApiError && error.status === 403) {
    return "You do not have permission to attach files here.";
  }
  if (error instanceof HttpApiError && error.status === 404) {
    return "This conversation is no longer available.";
  }
  if (error instanceof HttpApiError && error.status === 413) {
    return "This file is larger than the backend allows.";
  }
  if (error instanceof HttpApiError && error.status === 415) {
    return "This file type is not supported.";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("failed to fetch")) {
    return "The backend is not reachable. Try the upload again later.";
  }
  return "The attachment could not be sent. Try again.";
}
