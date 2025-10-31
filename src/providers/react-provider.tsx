import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { getQueryClient } from "./query-client";

export const ReactProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};