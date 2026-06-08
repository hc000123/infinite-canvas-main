"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";

import type { CanvasAssistantMessage, CanvasAssistantSession } from "../types";

type AssistantView = "chat" | "history";

type UseCanvasAssistantSessionsOptions = {
    activeSessionId: string | null;
    cleanupImages: (input: { sessions: CanvasAssistantSession[] }) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null, options?: { skipCanvasHistory?: boolean }) => void;
    sessions: CanvasAssistantSession[];
};

export function useCanvasAssistantSessions({ activeSessionId, cleanupImages, onSessionsChange, sessions }: UseCanvasAssistantSessionsOptions) {
    const [view, setView] = useState<AssistantView>("chat");
    const [checkedChatIds, setCheckedChatIds] = useState<string[]>([]);
    const [deleteChatIds, setDeleteChatIds] = useState<string[]>([]);
    const [localSessions, setLocalSessions] = useState<CanvasAssistantSession[]>(() => (sessions.length ? sessions : [createAssistantSession()]));
    const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(activeSessionId);
    const skipNextSessionsHistoryRef = useRef(false);

    useEffect(() => {
        if (!sessions.length) return;
        setLocalSessions(sessions);
        setLocalActiveSessionId(activeSessionId);
    }, [activeSessionId, sessions]);

    useEffect(() => {
        onSessionsChange(localSessions, localActiveSessionId, { skipCanvasHistory: skipNextSessionsHistoryRef.current });
        skipNextSessionsHistoryRef.current = false;
    }, [localActiveSessionId, localSessions, onSessionsChange]);

    const safeSessions = localSessions.length ? localSessions : [createAssistantSession()];
    const activeSession = useMemo(() => safeSessions.find((session) => session.id === localActiveSessionId) || safeSessions[0] || null, [localActiveSessionId, safeSessions]);
    const historySessions = safeSessions.filter((session) => session.messages.length > 0);
    const messages = activeSession?.messages || [];
    const hasMessages = messages.length > 0;

    const updateSession = (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
        setLocalSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)));
    };

    const appendMessage = (sessionId: string, message: CanvasAssistantMessage) => {
        updateSession(sessionId, (session) => ({
            ...session,
            title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
        }));
    };

    const appendAssistantMessage = (message: CanvasAssistantMessage, options?: { skipCanvasHistory?: boolean }) => {
        if (options?.skipCanvasHistory) skipNextSessionsHistoryRef.current = true;
        const session = activeSession || createAssistantSession();
        setLocalActiveSessionId(session.id);
        setView("chat");
        setLocalSessions((prev) => {
            const base = prev.some((item) => item.id === session.id) ? prev : [session, ...prev];
            return base.map((item) =>
                item.id === session.id
                    ? {
                          ...item,
                          title: item.messages.length ? item.title : message.text.slice(0, 18) || "助手消息",
                          messages: [...item.messages, message],
                          updatedAt: new Date().toISOString(),
                      }
                    : item,
            );
        });
    };

    const updateMessage = (sessionId: string, messageId: string, patch: Partial<CanvasAssistantMessage>) => {
        updateSession(sessionId, (session) => ({
            ...session,
            messages: session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            updatedAt: new Date().toISOString(),
        }));
    };

    const startChatSession = () => {
        if (activeSession && activeSession.messages.length === 0) {
            setLocalActiveSessionId(activeSession.id);
            return;
        }
        const session = createAssistantSession();
        setLocalSessions((prev) => [session, ...prev]);
        setLocalActiveSessionId(session.id);
    };

    const ensureActiveSession = () => {
        const session = activeSession || createAssistantSession();
        if (!activeSession) {
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        }
        return session;
    };

    const removeSessions = (ids: string[]) => {
        const next = safeSessions.filter((session) => !ids.includes(session.id));
        if (!next.length) {
            const session = createAssistantSession();
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        } else {
            setLocalSessions(next);
            setLocalActiveSessionId(localActiveSessionId && ids.includes(localActiveSessionId) ? next[0].id : localActiveSessionId);
        }
        cleanupImages({ sessions: next });
        setCheckedChatIds((prev) => prev.filter((id) => !ids.includes(id)));
    };

    const clearSessions = () => {
        const session = createAssistantSession();
        setLocalSessions([session]);
        setLocalActiveSessionId(session.id);
        setCheckedChatIds([]);
        cleanupImages({ sessions: [session] });
    };

    return {
        activeSession,
        appendAssistantMessage,
        appendMessage,
        checkedChatIds,
        clearSessions,
        deleteChatIds,
        ensureActiveSession,
        hasMessages,
        historySessions,
        messages,
        removeSessions,
        setCheckedChatIds,
        setDeleteChatIds,
        setActiveSessionId: setLocalActiveSessionId,
        setView,
        startChatSession,
        updateMessage,
        view,
    };
}

function createAssistantSession(): CanvasAssistantSession {
    const now = new Date().toISOString();
    return { id: nanoid(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}
