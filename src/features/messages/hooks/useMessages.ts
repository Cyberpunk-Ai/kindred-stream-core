import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { QUERY_KEYS } from "@/constants/query-keys";
import { messagesService } from "@/services/messages/MessagesService";
import { realtimeService } from "@/services/realtime";

export function useConversations(userId: string) {
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: QUERY_KEYS.messages.conversations(userId),
    queryFn: () => messagesService.getConversations(userId),
    enabled: !!userId,
    refetchInterval: 60 * 1000, // poll every 60s for new conversations (less aggressive)
  });

  // Subscribe to conversation updates for new messages
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = realtimeService.subscribeToChat("all", () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages.conversations(userId) });
    });
    return unsubscribe;
  }, [userId, queryClient]);

  return conversationsQuery;
}

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();

  const messagesQuery = useQuery({
    queryKey: QUERY_KEYS.messages.messages(conversationId),
    queryFn: () => messagesService.getMessages(conversationId),
    enabled: !!conversationId,
    // Reduced polling from 5s to 60s since realtime subscription handles updates
    refetchInterval: 60 * 1000,
  });

  // Subscribe to chat updates via realtime instead of polling
  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = realtimeService.subscribeToChat(conversationId, () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages.messages(conversationId) });
    });
    return unsubscribe;
  }, [conversationId, queryClient]);

  const sendMessageMutation = useMutation({
    mutationFn: ({ senderId, content }: { senderId: string; content: string }) =>
      messagesService.sendMessage(conversationId, senderId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages.messages(conversationId) });
    },
  });

  return {
    messages: messagesQuery.data ?? [],
    isLoading: messagesQuery.isLoading,
    send: sendMessageMutation.mutate,
    isSending: sendMessageMutation.isPending,
  };
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      participant1Id,
      participant2Id,
    }: {
      participant1Id: string;
      participant2Id: string;
    }) => messagesService.createConversation(participant1Id, participant2Id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.messages.conversations(vars.participant1Id),
      });
    },
  });
}
