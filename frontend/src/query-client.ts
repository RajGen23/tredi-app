// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Import it for cache calls outside components, for example
// queryClient.invalidateQueries or setQueryData in websocket or push
// handlers; inside components useQueryClient() returns this same instance.
import { QueryClient } from "@tanstack/react-query";

// offlineFirst: with no signal, screens keep showing the saved copy instead of
// waiting forever; a day of gcTime keeps that copy around between visits.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "offlineFirst", gcTime: 24 * 60 * 60 * 1000, staleTime: 30 * 1000, retry: 1 },
    mutations: { networkMode: "always" },
  },
});
