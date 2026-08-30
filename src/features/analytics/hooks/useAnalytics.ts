import { useMutation } from "@tanstack/react-query";

export function useAnalytics() {
  const trackEventMutation = useMutation({
    mutationFn: async (event: any) => {
      const { analyticsService } = await import("@/services/analytics/AnalyticsService");
      return analyticsService.track(event);
    },
  });

  return { trackEvent: trackEventMutation.mutate };
}
